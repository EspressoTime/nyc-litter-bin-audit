export const CLIENT_DIAGNOSTICS_STORAGE_KEY =
  'nyc-litter-basket-locator.client-diagnostics'
export const CLIENT_DIAGNOSTICS_MAX_RECORDS = 20
export const REPEATED_REFRESH_FAILURE_THRESHOLD = 3
export const ABNORMAL_ROW_COUNT_CHANGE_RATIO = 0.5

export type ClientDiagnosticOperation =
  'inventory-load' | 'inventory-metadata-check' | 'inventory-refresh'

export type ClientDiagnosticStatus =
  'success' | 'cached' | 'unchanged' | 'skipped' | 'error'

export type ClientDiagnosticErrorCode =
  | 'cache-read-failure'
  | 'cache-write-failure'
  | 'empty-response'
  | 'inventory-request-failure'
  | 'metadata-request-failure'
  | 'schema-failure'

export type ClientDiagnosticAnomalyCode =
  | 'schema-failure'
  | 'zero-row-response'
  | 'repeated-refresh-failure'
  | 'abnormal-row-count-change'

export type ClientDiagnosticRecord = {
  id: string
  recordedAt: string
  operation: ClientDiagnosticOperation
  status: ClientDiagnosticStatus
  durationMs: number
  responseSizeBytes?: number
  sourceRowCount?: number
  validRowCount?: number
  invalidRowCount?: number
  duplicateCount?: number
  requestCount?: number
  pageCount?: number
  terminationReason?: string
  sourceVersion?: string
  errorCode?: ClientDiagnosticErrorCode
  anomalyCodes: ClientDiagnosticAnomalyCode[]
}

export type ClientDiagnosticInput = Omit<
  ClientDiagnosticRecord,
  'id' | 'recordedAt' | 'anomalyCodes'
> & {
  recordedAt?: string
  anomalyCodes?: ClientDiagnosticAnomalyCode[]
}

const ANOMALY_CODES: ClientDiagnosticAnomalyCode[] = [
  'schema-failure',
  'zero-row-response',
  'repeated-refresh-failure',
  'abnormal-row-count-change',
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDiagnosticOperation(value: unknown): value is ClientDiagnosticOperation {
  return (
    value === 'inventory-load' ||
    value === 'inventory-metadata-check' ||
    value === 'inventory-refresh'
  )
}

function isDiagnosticStatus(value: unknown): value is ClientDiagnosticStatus {
  return (
    value === 'success' ||
    value === 'cached' ||
    value === 'unchanged' ||
    value === 'skipped' ||
    value === 'error'
  )
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isDiagnosticRecord(value: unknown): value is ClientDiagnosticRecord {
  if (!isObject(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.recordedAt === 'string' &&
    isDiagnosticOperation(value.operation) &&
    isDiagnosticStatus(value.status) &&
    isFiniteNonNegativeNumber(value.durationMs) &&
    Array.isArray(value.anomalyCodes) &&
    value.anomalyCodes.every((code) => ANOMALY_CODES.includes(code as never))
  )
}

function getLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function readStoredDiagnostics(): ClientDiagnosticRecord[] {
  const storage = getLocalStorage()
  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(CLIENT_DIAGNOSTICS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(isDiagnosticRecord).slice(0, CLIENT_DIAGNOSTICS_MAX_RECORDS)
      : []
  } catch {
    return []
  }
}

function writeStoredDiagnostics(records: ClientDiagnosticRecord[]): void {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(
      CLIENT_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(records.slice(0, CLIENT_DIAGNOSTICS_MAX_RECORDS)),
    )
  } catch {
    // Diagnostics must never prevent the inventory map from loading.
  }
}

function createDiagnosticId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `diagnostic-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function hasSchemaFailure(input: ClientDiagnosticInput): boolean {
  return (
    input.errorCode === 'schema-failure' ||
    input.terminationReason?.includes('schema') === true
  )
}

function hasZeroRows(input: ClientDiagnosticInput): boolean {
  return (
    input.sourceRowCount === 0 ||
    input.terminationReason === 'empty-input' ||
    input.terminationReason === 'empty-offset-page'
  )
}

function hasAbnormalRowCountChange(
  input: ClientDiagnosticInput,
  previousRecords: ClientDiagnosticRecord[],
): boolean {
  if (
    input.sourceRowCount === undefined ||
    input.sourceRowCount === 0 ||
    input.status === 'error'
  ) {
    return false
  }

  const previousSuccessfulRecord = previousRecords.find(
    (record) =>
      record.operation === 'inventory-refresh' &&
      record.status === 'success' &&
      record.sourceRowCount !== undefined &&
      record.sourceRowCount > 0,
  )

  if (
    !previousSuccessfulRecord ||
    previousSuccessfulRecord.sourceRowCount === undefined
  ) {
    return false
  }

  const changeRatio =
    Math.abs(input.sourceRowCount - previousSuccessfulRecord.sourceRowCount) /
    previousSuccessfulRecord.sourceRowCount

  return changeRatio >= ABNORMAL_ROW_COUNT_CHANGE_RATIO
}

function hasRepeatedRefreshFailure(
  input: ClientDiagnosticInput,
  previousRecords: ClientDiagnosticRecord[],
): boolean {
  if (input.operation !== 'inventory-refresh' || input.status !== 'error') {
    return false
  }

  const comparableRecords = [input, ...previousRecords].filter(
    (record) => record.operation === 'inventory-refresh',
  )
  let consecutiveFailures = 0
  for (const record of comparableRecords) {
    if (record.status !== 'error') {
      break
    }

    consecutiveFailures += 1
    if (consecutiveFailures >= REPEATED_REFRESH_FAILURE_THRESHOLD) {
      break
    }
  }

  return consecutiveFailures >= REPEATED_REFRESH_FAILURE_THRESHOLD
}

export function evaluateClientDiagnosticAnomalies(
  input: ClientDiagnosticInput,
  previousRecords: ClientDiagnosticRecord[] = readStoredDiagnostics(),
): ClientDiagnosticAnomalyCode[] {
  const anomalies = new Set(input.anomalyCodes ?? [])

  if (hasSchemaFailure(input)) {
    anomalies.add('schema-failure')
  }

  if (hasZeroRows(input)) {
    anomalies.add('zero-row-response')
  }

  if (hasRepeatedRefreshFailure(input, previousRecords)) {
    anomalies.add('repeated-refresh-failure')
  }

  if (hasAbnormalRowCountChange(input, previousRecords)) {
    anomalies.add('abnormal-row-count-change')
  }

  return ANOMALY_CODES.filter((code) => anomalies.has(code))
}

export function getClientDiagnostics(): ClientDiagnosticRecord[] {
  return readStoredDiagnostics()
}

export function recordClientDiagnostic(
  input: ClientDiagnosticInput,
): ClientDiagnosticRecord {
  const previousRecords = readStoredDiagnostics()
  const record: ClientDiagnosticRecord = {
    ...input,
    id: createDiagnosticId(),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    anomalyCodes: evaluateClientDiagnosticAnomalies(input, previousRecords),
  }

  writeStoredDiagnostics([record, ...previousRecords])
  return record
}

export function clearClientDiagnostics(): void {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.removeItem(CLIENT_DIAGNOSTICS_STORAGE_KEY)
  } catch {
    // Clearing diagnostics is best effort and is never part of the user flow.
  }
}
