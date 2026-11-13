import {
  createInventorySnapshot,
  type NormalizedInventorySnapshot,
} from '../baskets/model'
import {
  InventoryValidationError,
  validateAndNormalizeInventory,
} from '../baskets/validation'
import {
  recordClientDiagnostic,
  type ClientDiagnosticInput,
} from '../diagnostics/client-diagnostics'
import {
  claimInventoryMetadataCheck,
  getInventoryRefreshState,
  replaceCachedInventorySnapshotAndMarkRefresh,
} from '../local-store/inventory-cache'
import { SOCRATA_CONFIG } from './config'
import {
  loadCompleteInventory,
  type InventoryFetcher,
  type InventoryLoadResult,
} from './inventory-loader'

export type NewYorkCalendarContext = {
  dateKey: string
  monthKey: string
  day: number
}

export type MonthlyRefreshResult =
  | {
      outcome: 'not-eligible' | 'already-checked' | 'completed-month'
      dateKey: string
      monthKey: string
    }
  | {
      outcome: 'unchanged'
      dateKey: string
      monthKey: string
      sourceVersion: string
    }
  | {
      outcome: 'updated'
      dateKey: string
      monthKey: string
      sourceVersion: string
      snapshot: NormalizedInventorySnapshot
    }

export type MonthlyRefreshOptions = {
  currentSnapshot: NormalizedInventorySnapshot
  now?: Date
  fetcher?: InventoryFetcher
  loadInventory?: () => Promise<InventoryLoadResult>
}

function recordRefreshDiagnostic(input: ClientDiagnosticInput): void {
  recordClientDiagnostic(input)
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

function getInventoryErrorCode(error: unknown): ClientDiagnosticInput['errorCode'] {
  if (error instanceof InventoryValidationError) {
    return 'schema-failure'
  }

  return 'inventory-request-failure'
}

function getValidationDiagnosticCounts(
  error: unknown,
): Pick<
  ClientDiagnosticInput,
  | 'sourceRowCount'
  | 'validRowCount'
  | 'invalidRowCount'
  | 'duplicateCount'
  | 'terminationReason'
> {
  if (!(error instanceof InventoryValidationError)) {
    return {}
  }

  return {
    sourceRowCount: error.diagnostics.inputRecordCount,
    validRowCount: error.diagnostics.validRecordCount,
    invalidRowCount:
      error.diagnostics.invalidCoordinateCount +
      error.diagnostics.unnormalizableRecordCount,
    duplicateCount: error.diagnostics.duplicateCount,
    terminationReason: error.diagnostics.terminationReason,
  }
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((part) => part.type === type)?.value
  if (!value) {
    throw new Error(`Could not determine the New York ${type} date part.`)
  }

  return value
}

export function getNewYorkCalendarContext(
  now: Date = new Date(),
): NewYorkCalendarContext {
  if (!Number.isFinite(now.getTime())) {
    throw new Error('A valid date is required for monthly refresh scheduling.')
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SOCRATA_CONFIG.refreshTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = getDatePart(parts, 'year')
  const month = getDatePart(parts, 'month')
  const day = getDatePart(parts, 'day')

  return {
    dateKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
    day: Number(day),
  }
}

export function isNewerSourceVersion(
  candidateVersion: string,
  appliedVersion: string,
): boolean {
  const candidateNumber = Number(candidateVersion)
  const appliedNumber = Number(appliedVersion)

  if (Number.isFinite(candidateNumber) && Number.isFinite(appliedNumber)) {
    return candidateNumber > appliedNumber
  }

  return candidateVersion !== appliedVersion
}

export async function fetchInventorySourceVersion(
  fetcher: InventoryFetcher = fetch,
): Promise<string> {
  const response = await fetcher(SOCRATA_CONFIG.metadataEndpoint)

  if (!response.ok) {
    throw new Error(
      `Socrata metadata request failed: ${response.status} ${response.statusText}`,
    )
  }

  const payload: unknown = await response.json()
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Socrata metadata response was not an object.')
  }

  const metadata = payload as Record<string, unknown>
  if (metadata.id !== SOCRATA_CONFIG.datasetId) {
    throw new Error('Socrata metadata returned an unexpected dataset.')
  }

  const sourceVersion = metadata[SOCRATA_CONFIG.updateMarkers.metadataTimestampField]
  if (sourceVersion === undefined || sourceVersion === null) {
    throw new Error('Socrata metadata did not include a source version.')
  }

  const normalizedVersion = String(sourceVersion).trim()
  if (!normalizedVersion) {
    throw new Error('Socrata metadata returned an empty source version.')
  }

  return normalizedVersion
}

function getOutcomeForClaim(
  claim: Awaited<ReturnType<typeof claimInventoryMetadataCheck>>,
  context: NewYorkCalendarContext,
): MonthlyRefreshResult | undefined {
  if (claim.claimed) {
    return undefined
  }

  return {
    outcome: claim.reason,
    dateKey: context.dateKey,
    monthKey: context.monthKey,
  }
}

export async function checkForMonthlyInventoryUpdate({
  currentSnapshot,
  now = new Date(),
  fetcher = fetch,
  loadInventory = () => loadCompleteInventory(fetcher),
}: MonthlyRefreshOptions): Promise<MonthlyRefreshResult> {
  const startedAt = Date.now()
  const context = getNewYorkCalendarContext(now)

  if (context.day < SOCRATA_CONFIG.refreshStartDay) {
    recordRefreshDiagnostic({
      operation: 'inventory-metadata-check',
      status: 'skipped',
      durationMs: elapsedMilliseconds(startedAt),
      terminationReason: 'not-eligible',
    })
    return {
      outcome: 'not-eligible',
      dateKey: context.dateKey,
      monthKey: context.monthKey,
    }
  }

  const claim = await claimInventoryMetadataCheck(context.dateKey, context.monthKey)
  const claimOutcome = getOutcomeForClaim(claim, context)
  if (claimOutcome) {
    recordRefreshDiagnostic({
      operation: 'inventory-metadata-check',
      status: 'skipped',
      durationMs: elapsedMilliseconds(startedAt),
      terminationReason: claimOutcome.outcome,
    })
    return claimOutcome
  }

  let sourceVersion: string
  try {
    sourceVersion = await fetchInventorySourceVersion(fetcher)
  } catch (error) {
    recordRefreshDiagnostic({
      operation: 'inventory-metadata-check',
      status: 'error',
      durationMs: elapsedMilliseconds(startedAt),
      terminationReason: 'metadata-request-failure',
      errorCode: 'metadata-request-failure',
    })
    throw error
  }

  const refreshState = await getInventoryRefreshState()
  const appliedVersion =
    refreshState?.appliedSourceVersion ?? currentSnapshot.metadata.sourceVersion

  if (!isNewerSourceVersion(sourceVersion, appliedVersion)) {
    recordRefreshDiagnostic({
      operation: 'inventory-metadata-check',
      status: 'unchanged',
      durationMs: elapsedMilliseconds(startedAt),
      sourceVersion: appliedVersion,
      terminationReason: 'source-unchanged',
    })
    return {
      outcome: 'unchanged',
      dateKey: context.dateKey,
      monthKey: context.monthKey,
      sourceVersion: appliedVersion,
    }
  }

  let loadedInventory: InventoryLoadResult
  try {
    loadedInventory = await loadInventory()
  } catch (error) {
    recordRefreshDiagnostic({
      operation: 'inventory-refresh',
      status: 'error',
      durationMs: elapsedMilliseconds(startedAt),
      terminationReason: 'inventory-load-failure',
      errorCode: getInventoryErrorCode(error),
    })
    throw error
  }

  let normalized
  try {
    normalized = validateAndNormalizeInventory(loadedInventory.records)
  } catch (error) {
    recordRefreshDiagnostic({
      operation: 'inventory-refresh',
      status: 'error',
      durationMs: elapsedMilliseconds(startedAt),
      responseSizeBytes: loadedInventory.diagnostics.responseSizeBytes,
      requestCount: loadedInventory.diagnostics.requestCount,
      pageCount: loadedInventory.diagnostics.pageCount,
      errorCode: 'schema-failure',
      ...getValidationDiagnosticCounts(error),
    })
    throw error
  }

  if (!normalized.canPublish) {
    recordClientDiagnostic({
      operation: 'inventory-refresh',
      status: 'error',
      durationMs: elapsedMilliseconds(startedAt),
      responseSizeBytes: loadedInventory.diagnostics.responseSizeBytes,
      requestCount: loadedInventory.diagnostics.requestCount,
      pageCount: loadedInventory.diagnostics.pageCount,
      sourceRowCount: loadedInventory.diagnostics.rawRecordCount,
      validRowCount: normalized.diagnostics.validRecordCount,
      invalidRowCount:
        normalized.diagnostics.invalidCoordinateCount +
        normalized.diagnostics.unnormalizableRecordCount,
      duplicateCount:
        loadedInventory.diagnostics.duplicateCount +
        normalized.diagnostics.duplicateCount,
      terminationReason: normalized.diagnostics.terminationReason,
      errorCode: 'empty-response',
    })
    throw new Error('The refreshed inventory did not contain publishable records.')
  }

  const nextSnapshot = createInventorySnapshot(normalized.baskets, {
    fetchedAt: now.toISOString(),
    sourceVersion,
  })
  try {
    await replaceCachedInventorySnapshotAndMarkRefresh(nextSnapshot, context.monthKey)
  } catch (error) {
    recordClientDiagnostic({
      operation: 'inventory-refresh',
      status: 'error',
      durationMs: elapsedMilliseconds(startedAt),
      responseSizeBytes: loadedInventory.diagnostics.responseSizeBytes,
      requestCount: loadedInventory.diagnostics.requestCount,
      pageCount: loadedInventory.diagnostics.pageCount,
      sourceRowCount: loadedInventory.diagnostics.rawRecordCount,
      validRowCount: normalized.diagnostics.validRecordCount,
      invalidRowCount:
        normalized.diagnostics.invalidCoordinateCount +
        normalized.diagnostics.unnormalizableRecordCount,
      duplicateCount:
        loadedInventory.diagnostics.duplicateCount +
        normalized.diagnostics.duplicateCount,
      terminationReason: 'cache-write-failure',
      errorCode: 'cache-write-failure',
    })
    throw error
  }

  recordClientDiagnostic({
    operation: 'inventory-refresh',
    status: 'success',
    durationMs: elapsedMilliseconds(startedAt),
    responseSizeBytes: loadedInventory.diagnostics.responseSizeBytes,
    requestCount: loadedInventory.diagnostics.requestCount,
    pageCount: loadedInventory.diagnostics.pageCount,
    sourceRowCount: loadedInventory.diagnostics.rawRecordCount,
    validRowCount: normalized.diagnostics.validRecordCount,
    invalidRowCount:
      normalized.diagnostics.invalidCoordinateCount +
      normalized.diagnostics.unnormalizableRecordCount,
    duplicateCount:
      loadedInventory.diagnostics.duplicateCount +
      normalized.diagnostics.duplicateCount,
    terminationReason: loadedInventory.diagnostics.terminationReason,
    sourceVersion,
  })

  return {
    outcome: 'updated',
    dateKey: context.dateKey,
    monthKey: context.monthKey,
    sourceVersion,
    snapshot: nextSnapshot,
  }
}
