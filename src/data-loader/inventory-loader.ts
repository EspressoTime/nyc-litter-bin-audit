import {
  buildInventoryQueryUrl,
  SOCRATA_CONFIG,
  type SocrataQueryOptions,
} from './config'
import type { SocrataBasketRecord } from '../baskets/model'

export type InventoryLoadStrategy = 'high-limit' | 'offset-pagination'

export type InventoryLoadTerminationReason =
  'short-high-limit-page' | 'short-offset-page' | 'empty-offset-page'

export type InventoryLoadDiagnostics = {
  strategy: InventoryLoadStrategy
  requestCount: number
  pageCount: number
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
): Promise<SocrataBasketRecord[]> {
  const response = await fetcher(buildInventoryQueryUrl(query))

  if (!response.ok) {
    throw new InventoryLoadError(
      `Socrata inventory request failed: ${response.status} ${response.statusText}`,
    )
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new InventoryLoadError('Socrata inventory response was not a JSON array.')
  }

  return payload as SocrataBasketRecord[]
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
  terminationReason: InventoryLoadTerminationReason,
): InventoryLoadResult {
  const deduped = dedupeRecords(pages)

  return {
    records: deduped.records,
    diagnostics: {
      strategy,
      requestCount,
      pageCount: pages.length,
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

  while (true) {
    const page = await fetchInventoryPage(fetcher, {
      limit: pageSize,
      offset,
    })
    pages.push(page)
    requestCount += 1

    if (page.length === 0) {
      return createLoadResult(
        pages,
        'offset-pagination',
        requestCount,
        'empty-offset-page',
      )
    }

    if (page.length < pageSize) {
      return createLoadResult(
        pages,
        'offset-pagination',
        requestCount,
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
    const highLimitPage = await fetchInventoryPage(fetcher, {
      limit: preferredLimit,
    })

    if (highLimitPage.length < preferredLimit) {
      return createLoadResult([highLimitPage], 'high-limit', 1, 'short-high-limit-page')
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
