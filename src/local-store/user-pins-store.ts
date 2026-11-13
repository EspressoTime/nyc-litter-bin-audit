import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { LOCAL_PIN_DB_NAME, LOCAL_PIN_FALLBACK_KEY } from './observations-store'

export { LOCAL_PIN_DB_NAME, LOCAL_PIN_FALLBACK_KEY } from './observations-store'

export const LOCAL_PIN_DB_VERSION = 1
export const LOCAL_PIN_STORE_NAME = 'pins'

export type LocalUserPin = {
  local_pin_id: string
  latitude: number
  longitude: number
  last_seen_at: string
  created_at: string
  updated_at: string
  source: 'local'
  kind: 'user_seen_basket'
}

export type CreateLocalUserPinInput = {
  latitude: number
  longitude: number
  lastSeenAt?: string
}

type LocalPinSchema = DBSchema & {
  [LOCAL_PIN_STORE_NAME]: {
    key: string
    value: LocalUserPin
  }
}

export class LocalUserPinStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'LocalUserPinStoreError'
  }
}

function isValidDateText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  )
}

function isValidCoordinatePair(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export function isLocalUserPin(value: unknown): value is LocalUserPin {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const pin = value as Partial<LocalUserPin>
  return (
    typeof pin.local_pin_id === 'string' &&
    pin.local_pin_id.trim().length > 0 &&
    isValidCoordinatePair(pin.latitude, pin.longitude) &&
    isValidDateText(pin.last_seen_at) &&
    isValidDateText(pin.created_at) &&
    isValidDateText(pin.updated_at) &&
    pin.source === 'local' &&
    pin.kind === 'user_seen_basket'
  )
}

function createLocalPinId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `pin-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function assertCreateInput(input: CreateLocalUserPinInput): void {
  if (
    !isValidCoordinatePair(input.latitude, input.longitude) ||
    (input.lastSeenAt !== undefined && !isValidDateText(input.lastSeenAt))
  ) {
    throw new LocalUserPinStoreError(
      'The local pin could not be saved because its coordinates or date are invalid.',
    )
  }
}

function getLocalStorage(): Storage {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is unavailable.')
    }

    return localStorage
  } catch (error) {
    throw new LocalUserPinStoreError('Browser-local storage is unavailable.', error)
  }
}

function readFallbackPins(): LocalUserPin[] {
  const raw = getLocalStorage().getItem(LOCAL_PIN_FALLBACK_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLocalUserPin) : []
  } catch {
    return []
  }
}

function writeFallbackPins(pins: LocalUserPin[]): void {
  try {
    getLocalStorage().setItem(LOCAL_PIN_FALLBACK_KEY, JSON.stringify(pins))
  } catch (error) {
    throw new LocalUserPinStoreError(
      'The local pin could not be saved in browser storage.',
      error,
    )
  }
}

async function openLocalPinDb(): Promise<IDBPDatabase<LocalPinSchema>> {
  const database = await openDB<LocalPinSchema>(
    LOCAL_PIN_DB_NAME,
    LOCAL_PIN_DB_VERSION,
    {
      upgrade(db) {
        if (!db.objectStoreNames.contains(LOCAL_PIN_STORE_NAME)) {
          db.createObjectStore(LOCAL_PIN_STORE_NAME, {
            keyPath: 'local_pin_id',
          })
        }
      },
    },
  )

  database.onversionchange = () => database.close()
  return database
}

async function getIndexedDbPins(): Promise<LocalUserPin[]> {
  const database = await openLocalPinDb()
  try {
    const pins = await database.getAll(LOCAL_PIN_STORE_NAME)
    return pins.filter(isLocalUserPin)
  } finally {
    database.close()
  }
}

async function putIndexedDbPin(pin: LocalUserPin): Promise<void> {
  const database = await openLocalPinDb()
  try {
    await database.put(LOCAL_PIN_STORE_NAME, pin)
  } finally {
    database.close()
  }
}

async function deleteIndexedDbPin(localPinId: string): Promise<void> {
  const database = await openLocalPinDb()
  try {
    await database.delete(LOCAL_PIN_STORE_NAME, localPinId)
  } finally {
    database.close()
  }
}

export async function getLocalUserPins(): Promise<LocalUserPin[]> {
  try {
    return await getIndexedDbPins()
  } catch (error) {
    try {
      return readFallbackPins()
    } catch (fallbackError) {
      throw new LocalUserPinStoreError(
        'Local pins could not be read from browser storage.',
        fallbackError ?? error,
      )
    }
  }
}

export async function createLocalUserPin(
  input: CreateLocalUserPinInput,
): Promise<LocalUserPin> {
  assertCreateInput(input)
  const now = new Date().toISOString()
  const pin: LocalUserPin = {
    local_pin_id: createLocalPinId(),
    latitude: input.latitude,
    longitude: input.longitude,
    last_seen_at: input.lastSeenAt ?? now,
    created_at: now,
    updated_at: now,
    source: 'local',
    kind: 'user_seen_basket',
  }

  try {
    await putIndexedDbPin(pin)
  } catch (error) {
    try {
      writeFallbackPins([...readFallbackPins(), pin])
    } catch (fallbackError) {
      throw new LocalUserPinStoreError(
        'The local pin could not be saved in browser storage.',
        fallbackError ?? error,
      )
    }
  }

  return pin
}

export async function reconfirmLocalUserPin(
  pin: LocalUserPin,
  lastSeenAt: string = new Date().toISOString(),
): Promise<LocalUserPin> {
  if (!isLocalUserPin(pin) || !isValidDateText(lastSeenAt)) {
    throw new LocalUserPinStoreError(
      'The local pin could not be reconfirmed because its data is invalid.',
    )
  }

  const updatedPin: LocalUserPin = {
    ...pin,
    last_seen_at: lastSeenAt,
    updated_at: new Date().toISOString(),
  }

  try {
    await putIndexedDbPin(updatedPin)
  } catch (error) {
    try {
      const pins = readFallbackPins()
      const index = pins.findIndex((item) => item.local_pin_id === pin.local_pin_id)
      if (index < 0) {
        throw new Error('The local pin was not found in browser storage.')
      }
      pins[index] = updatedPin
      writeFallbackPins(pins)
    } catch (fallbackError) {
      throw new LocalUserPinStoreError(
        'The local pin could not be reconfirmed in browser storage.',
        fallbackError ?? error,
      )
    }
  }

  return updatedPin
}

export async function deleteLocalUserPin(pin: LocalUserPin): Promise<void> {
  if (!isLocalUserPin(pin)) {
    throw new LocalUserPinStoreError(
      'The local pin could not be removed because its data is invalid.',
    )
  }

  try {
    await deleteIndexedDbPin(pin.local_pin_id)
  } catch (error) {
    try {
      writeFallbackPins(
        readFallbackPins().filter((item) => item.local_pin_id !== pin.local_pin_id),
      )
    } catch (fallbackError) {
      throw new LocalUserPinStoreError(
        'The local pin could not be removed from browser storage.',
        fallbackError ?? error,
      )
    }
  }
}
