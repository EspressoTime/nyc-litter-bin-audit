import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { LocalObservation, LocalObservationStatus } from '../observations/status'

export const LOCAL_OBSERVATION_DB_NAME = 'nyc-litter-basket-locator-observations'
export const LOCAL_OBSERVATION_DB_VERSION = 1
export const LOCAL_OBSERVATION_STORE_NAME = 'observations'
export const LOCAL_OBSERVATION_FALLBACK_KEY =
  'nyc-litter-basket-locator.local-observations'
export const LOCAL_PIN_DB_NAME = 'nyc-litter-basket-locator-user-pins'
export const LOCAL_PIN_FALLBACK_KEY = 'nyc-litter-basket-locator.local-pins'

export type StoredLocalObservation = {
  local_observation_id: string
  basket_id: string
  status: LocalObservationStatus
  observed_at: string
  created_at: string
  source: 'local'
}

export type SaveLocalObservationInput = {
  basketId: string
  status: LocalObservationStatus
  observedAt: string
  createdAt?: string
}

type LocalObservationSchema = DBSchema & {
  [LOCAL_OBSERVATION_STORE_NAME]: {
    key: string
    value: StoredLocalObservation
  }
}

export class LocalObservationStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'LocalObservationStoreError'
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidDateText(value: unknown): value is string {
  return isNonEmptyText(value) && Number.isFinite(Date.parse(value))
}

export function isStoredLocalObservation(
  value: unknown,
): value is StoredLocalObservation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const observation = value as Partial<StoredLocalObservation>
  return (
    isNonEmptyText(observation.local_observation_id) &&
    isNonEmptyText(observation.basket_id) &&
    (observation.status === 'exists' || observation.status === 'missing') &&
    isValidDateText(observation.observed_at) &&
    isValidDateText(observation.created_at) &&
    observation.source === 'local'
  )
}

function assertSaveInput(input: SaveLocalObservationInput): void {
  if (
    !isNonEmptyText(input.basketId) ||
    (input.status !== 'exists' && input.status !== 'missing') ||
    !isValidDateText(input.observedAt) ||
    (input.createdAt !== undefined && !isValidDateText(input.createdAt))
  ) {
    throw new LocalObservationStoreError(
      'The local observation could not be saved because its fields are invalid.',
    )
  }
}

function createLocalObservationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `observation-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function toStoredObservation(input: SaveLocalObservationInput): StoredLocalObservation {
  assertSaveInput(input)

  return {
    local_observation_id: createLocalObservationId(),
    basket_id: input.basketId.trim(),
    status: input.status,
    observed_at: input.observedAt,
    created_at: input.createdAt ?? new Date().toISOString(),
    source: 'local',
  }
}

function getLocalStorage(): Storage {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is unavailable.')
    }

    return localStorage
  } catch (error) {
    throw new LocalObservationStoreError('Browser-local storage is unavailable.', error)
  }
}

function readFallbackRecords(): StoredLocalObservation[] {
  const storage = getLocalStorage()
  const raw = storage.getItem(LOCAL_OBSERVATION_FALLBACK_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isStoredLocalObservation)
  } catch {
    return []
  }
}

function writeFallbackRecords(records: StoredLocalObservation[]): void {
  const storage = getLocalStorage()
  try {
    storage.setItem(LOCAL_OBSERVATION_FALLBACK_KEY, JSON.stringify(records))
  } catch (error) {
    throw new LocalObservationStoreError(
      'The local observation could not be saved in browser storage.',
      error,
    )
  }
}

async function openObservationDb(): Promise<IDBPDatabase<LocalObservationSchema>> {
  const database = await openDB<LocalObservationSchema>(
    LOCAL_OBSERVATION_DB_NAME,
    LOCAL_OBSERVATION_DB_VERSION,
    {
      upgrade(db) {
        if (!db.objectStoreNames.contains(LOCAL_OBSERVATION_STORE_NAME)) {
          db.createObjectStore(LOCAL_OBSERVATION_STORE_NAME, {
            keyPath: 'local_observation_id',
          })
        }
      },
    },
  )

  database.onversionchange = () => database.close()
  return database
}

async function getIndexedDbRecords(): Promise<StoredLocalObservation[]> {
  const database = await openObservationDb()
  try {
    const records = await database.getAll(LOCAL_OBSERVATION_STORE_NAME)
    return records.filter(isStoredLocalObservation)
  } finally {
    database.close()
  }
}

async function saveToIndexedDb(record: StoredLocalObservation): Promise<void> {
  const database = await openObservationDb()
  try {
    await database.put(LOCAL_OBSERVATION_STORE_NAME, record)
  } finally {
    database.close()
  }
}

export async function getLocalObservationRecords(): Promise<StoredLocalObservation[]> {
  try {
    return await getIndexedDbRecords()
  } catch (error) {
    try {
      return readFallbackRecords()
    } catch (fallbackError) {
      throw new LocalObservationStoreError(
        'Local observations could not be read from browser storage.',
        fallbackError ?? error,
      )
    }
  }
}

export async function getLocalObservations(): Promise<LocalObservation[]> {
  const records = await getLocalObservationRecords()
  return records.map((record) => ({
    basketId: record.basket_id,
    status: record.status,
    observedAt: record.observed_at,
  }))
}

export async function saveLocalObservation(
  input: SaveLocalObservationInput,
): Promise<StoredLocalObservation> {
  const record = toStoredObservation(input)

  try {
    await saveToIndexedDb(record)
  } catch (error) {
    try {
      const records = readFallbackRecords().filter(
        (existing) => existing.local_observation_id !== record.local_observation_id,
      )
      writeFallbackRecords([...records, record])
    } catch (fallbackError) {
      throw new LocalObservationStoreError(
        'The local observation could not be saved in browser storage.',
        fallbackError ?? error,
      )
    }
  }

  return record
}

export async function clearLocalObservations(): Promise<void> {
  try {
    const database = await openObservationDb()
    try {
      await database.clear(LOCAL_OBSERVATION_STORE_NAME)
    } finally {
      database.close()
    }
  } catch {
    // The localStorage fallback below can still clear observations when IndexedDB is unavailable.
  }

  let fallbackError: unknown
  try {
    getLocalStorage().removeItem(LOCAL_OBSERVATION_FALLBACK_KEY)
  } catch (error) {
    fallbackError = error
  }

  if (fallbackError) {
    throw new LocalObservationStoreError(
      'Local observations could not be cleared from browser storage.',
      fallbackError,
    )
  }
}
