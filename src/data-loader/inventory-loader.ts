import {
  buildInventoryQueryUrl,
  SOCRATA_CONFIG,
  type SocrataQueryOptions,
} from './config'
import type { SocrataBasketRecord } from '../baskets/model'

export type InventoryLoadStrategy = 'high-limit' | 'offset-pagination'

export type InventoryLoadTerminationReason =
  | 'short-high-limit-page'
  | 'short-offset-page'
  | 'empty-offset-page'
  | 'repeated-offset-page'

export type InventoryLoadDiagnostics = {
  strategy: InventoryLoadStrategy
  requestCount: number
  pageCount: number
  responseSizeBytes: number
  rawRecordCount: number
  uniqueRecordCount: number
  duplicateCount: number
  terminationReason: InventoryLoadTerminationReason
}

export type InventoryLoadResult = {
  records: SocrataBasketRecord[]
  diagnostics: InventoryLoadDiagnostics
}

export type InventoryFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type InventoryLoaderOptions = {
  preferredLimit?: number
  pageSize?: number
}

export class InventoryLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'InventoryLoadError'
  }
}

async function fetchInventoryPage(
  fetcher: InventoryFetcher,
  query: SocrataQueryOptions,
): Promise<{ records: SocrataBasketRecord[]; responseSizeBytes: number }> {
  const response = await fetcher(buildInventoryQueryUrl(query))

  if (!response.ok) {
    throw new InventoryLoadError(
      `Socrata inventory request failed: ${response.status} ${response.statusText}`,
    )
  }

  const body = await response.arrayBuffer()
  const responseSizeBytes = body.byteLength
  let payload: unknown

  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    throw new InventoryLoadError('Socrata inventory response was not valid JSON.')
  }

  if (!Array.isArray(payload)) {
    throw new InventoryLoadError('Socrata inventory response was not a JSON array.')
  }

  return { records: payload as SocrataBasketRecord[], responseSizeBytes }
}

function getBasketId(record: SocrataBasketRecord): string | null {
  if (record.basketid === null || record.basketid === undefined) {
    return null
  }

  const basketId = String(record.basketid).trim()
  return basketId.length > 0 ? basketId : null
}

function dedupeRecords(pages: SocrataBasketRecord[][]) {
  const records: SocrataBasketRecord[] = []
  const seenBasketIds = new Set<string>()
  let rawRecordCount = 0
  let duplicateCount = 0

  for (const page of pages) {
    for (const record of page) {
      rawRecordCount += 1
      const basketId = getBasketId(record)

      if (basketId !== null && seenBasketIds.has(basketId)) {
        duplicateCount += 1
        continue
      }

      if (basketId !== null) {
        seenBasketIds.add(basketId)
      }
      records.push(record)
    }
  }

  return {
    records,
    rawRecordCount,
    uniqueRecordCount: records.length,
    duplicateCount,
  }
}

function createLoadResult(
  pages: SocrataBasketRecord[][],
  strategy: InventoryLoadStrategy,
  requestCount: number,
  responseSizeBytes: number,
  terminationReason: InventoryLoadTerminationReason,
): InventoryLoadResult {
  const deduped = dedupeRecords(pages)

  return {
    records: deduped.records,
    diagnostics: {
      strategy,
      requestCount,
      pageCount: pages.length,
      responseSizeBytes,
      rawRecordCount: deduped.rawRecordCount,
      uniqueRecordCount: deduped.uniqueRecordCount,
      duplicateCount: deduped.duplicateCount,
      terminationReason,
    },
  }
}

async function loadWithOffsetPagination(
  fetcher: InventoryFetcher,
  pageSize: number,
  initialRequestCount = 0,
): Promise<InventoryLoadResult> {
  const pages: SocrataBasketRecord[][] = []
  let offset = 0
  let requestCount = initialRequestCount
  let responseSizeBytes = 0
  const seenBasketIds = new Set<string>()
  let previousPageSignature: string | null = null

  while (true) {
    const pageResult = await fetchInventoryPage(fetcher, {
      limit: pageSize,
      offset,
    })
    const page = pageResult.records
    pages.push(page)
    requestCount += 1
    responseSizeBytes += pageResult.responseSizeBytes

    const pageSignature = JSON.stringify(page)
    const hasNoNewBasketIds =
      page.length > 0 &&
      page.every((record) => {
        const basketId = getBasketId(record)
        return basketId !== null && seenBasketIds.has(basketId)
      })

    for (const record of page) {
      const basketId = getBasketId(record)
      if (basketId !== null) {
        seenBasketIds.add(basketId)
      }
    }

    if (pageSignature === previousPageSignature || hasNoNewBasketIds) {
      return createLoadResult(
        pages,
        'offset-pagination',
        requestCount,
        responseSizeBytes,
        'repeated-offset-page',
      )
    }
    previousPageSignature = pageSignature

    if (page.length === 0) {
      return createLoadResult(
        pages,
        'offset-pagination',
        requestCount,
        responseSizeBytes,
        'empty-offset-page',
      )
    }

    if (page.length < pageSize) {
      return createLoadResult(
        pages,
        'offset-pagination',
        requestCount,
        responseSizeBytes,
        'short-offset-page',
      )
    }

    offset += page.length
  }
}

export async function loadCompleteInventory(
  fetcher: InventoryFetcher = fetch,
  options: InventoryLoaderOptions = {},
): Promise<InventoryLoadResult> {
  const preferredLimit = options.preferredLimit ?? SOCRATA_CONFIG.preferredLimit
  const pageSize = options.pageSize ?? SOCRATA_CONFIG.fallbackPageSize
  let highLimitRequestError: unknown

  try {
    const highLimitPageResult = await fetchInventoryPage(fetcher, {
      limit: preferredLimit,
    })
    const highLimitPage = highLimitPageResult.records

    if (highLimitPage.length < preferredLimit) {
      return createLoadResult(
        [highLimitPage],
        'high-limit',
        1,
        highLimitPageResult.responseSizeBytes,
        'short-high-limit-page',
      )
    }
  } catch (error) {
    highLimitRequestError = error
  }

  try {
    return await loadWithOffsetPagination(fetcher, pageSize, 1)
  } catch (error) {
    throw new InventoryLoadError(
      'Unable to load the complete Socrata inventory with either loading strategy.',
      { highLimitRequestError, fallbackRequestError: error },
    )
  }
}
