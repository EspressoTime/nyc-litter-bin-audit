import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import {
  INVENTORY_SNAPSHOT_FORMAT_VERSION,
  type NormalizedBasket,
  type NormalizedInventorySnapshot,
} from '../baskets/model'
import { NYC_COORDINATE_BOUNDS } from '../baskets/validation'
import { SOCRATA_CONFIG } from '../data-loader/config'
import { BUNDLED_INVENTORY_SNAPSHOT_PATH } from '../data-loader/snapshot'
import { recordClientDiagnostic } from '../diagnostics/client-diagnostics'

export const INVENTORY_CACHE_DB_NAME = 'nyc-litter-basket-locator'
export const INVENTORY_CACHE_DB_VERSION = 2
export const INVENTORY_CACHE_STORE_NAME = 'inventory-snapshots'
export const INVENTORY_CACHE_KEY = 'current'
export const INVENTORY_REFRESH_STATE_STORE_NAME = 'inventory-refresh-state'
export const INVENTORY_REFRESH_STATE_KEY = 'current'

export type InventoryRefreshState = {
  lastCheckedDate?: string
  appliedSourceVersion?: string
  completedMonth?: string
}

type InventoryCacheSchema = DBSchema & {
  [INVENTORY_CACHE_STORE_NAME]: {
    key: string
    value: NormalizedInventorySnapshot
  }
  [INVENTORY_REFRESH_STATE_STORE_NAME]: {
    key: string
    value: InventoryRefreshState
  }
}

export type InventorySnapshotSource = 'indexeddb' | 'bundled'

export type InventorySnapshotLoadResult = {
  snapshot: NormalizedInventorySnapshot
  source: InventorySnapshotSource
  cacheReadError?: unknown
  cacheWriteError?: unknown
}

export type SnapshotFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type InventoryCacheErrorReason = 'invalid' | 'empty' | 'request'

export class InventoryCacheError extends Error {
  constructor(
    message: string,
    public readonly reason: InventoryCacheErrorReason = 'invalid',
  ) {
    super(message)
    this.name = 'InventoryCacheError'
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isValidBasket(value: unknown): value is NormalizedBasket {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const basket = value as Partial<NormalizedBasket>
  const point = basket.point

  return (
    isNonEmptyText(basket.basketId) &&
    isNullableText(basket.objectId) &&
    isNullableText(basket.basketType) &&
    isNullableText(basket.direction) &&
    isNullableText(basket.streetName1) &&
    isNullableText(basket.streetName2) &&
    typeof basket.latitude === 'number' &&
    Number.isFinite(basket.latitude) &&
    typeof basket.longitude === 'number' &&
    Number.isFinite(basket.longitude) &&
    basket.latitude >= NYC_COORDINATE_BOUNDS.minLatitude &&
    basket.latitude <= NYC_COORDINATE_BOUNDS.maxLatitude &&
    basket.longitude >= NYC_COORDINATE_BOUNDS.minLongitude &&
    basket.longitude <= NYC_COORDINATE_BOUNDS.maxLongitude &&
    isNullableText(basket.borough) &&
    isNullableText(basket.district) &&
    typeof point === 'object' &&
    point !== null &&
    point.type === 'Point' &&
    Array.isArray(point.coordinates) &&
    point.coordinates.length === 2 &&
    point.coordinates.every(
      (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  )
}

export function isValidInventorySnapshot(
  value: unknown,
): value is NormalizedInventorySnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const snapshot = value as Partial<NormalizedInventorySnapshot>
  const metadata = snapshot.metadata

  if (
    snapshot.formatVersion !== INVENTORY_SNAPSHOT_FORMAT_VERSION ||
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata) ||
    metadata.sourceDatasetId !== SOCRATA_CONFIG.datasetId ||
    !isNonEmptyText(metadata.fetchedAt) ||
    !Number.isFinite(Date.parse(metadata.fetchedAt)) ||
    !isNonEmptyText(metadata.sourceVersion) ||
    !Array.isArray(snapshot.baskets) ||
    snapshot.baskets.length === 0
  ) {
    return false
  }

  const basketIds = new Set<string>()
  for (const basket of snapshot.baskets) {
    if (!isValidBasket(basket) || basketIds.has(basket.basketId)) {
      return false
    }

    basketIds.add(basket.basketId)
  }

  return true
}

function assertValidInventorySnapshot(
  value: unknown,
): asserts value is NormalizedInventorySnapshot {
  if (!isValidInventorySnapshot(value)) {
    const baskets =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as { baskets?: unknown }).baskets
        : undefined
    const reason = Array.isArray(baskets) && baskets.length === 0 ? 'empty' : 'invalid'
    throw new InventoryCacheError(
      'The inventory snapshot failed validation and was not cached.',
      reason,
    )
  }
}

async function openInventoryCache(): Promise<IDBPDatabase<InventoryCacheSchema>> {
  const database = await openDB<InventoryCacheSchema>(
    INVENTORY_CACHE_DB_NAME,
    INVENTORY_CACHE_DB_VERSION,
    {
      upgrade(db) {
        if (!db.objectStoreNames.contains(INVENTORY_CACHE_STORE_NAME)) {
          db.createObjectStore(INVENTORY_CACHE_STORE_NAME)
        }

        if (!db.objectStoreNames.contains(INVENTORY_REFRESH_STATE_STORE_NAME)) {
          db.createObjectStore(INVENTORY_REFRESH_STATE_STORE_NAME)
        }
      },
    },
  )

  database.onversionchange = () => database.close()
  return database
}

export async function getCachedInventorySnapshot(): Promise<
  NormalizedInventorySnapshot | undefined
> {
  const database = await openInventoryCache()
  try {
    const cached = await database.get(INVENTORY_CACHE_STORE_NAME, INVENTORY_CACHE_KEY)

    return isValidInventorySnapshot(cached) ? cached : undefined
  } finally {
    database.close()
  }
}

export async function replaceCachedInventorySnapshot(
  snapshot: unknown,
): Promise<NormalizedInventorySnapshot> {
  assertValidInventorySnapshot(snapshot)

  const database = await openInventoryCache()
  const transaction = database.transaction(
    [INVENTORY_CACHE_STORE_NAME, INVENTORY_REFRESH_STATE_STORE_NAME],
    'readwrite',
  )
  try {
    const snapshotStore = transaction.objectStore(INVENTORY_CACHE_STORE_NAME)
    const refreshStore = transaction.objectStore(INVENTORY_REFRESH_STATE_STORE_NAME)
    const refreshState = await refreshStore.get(INVENTORY_REFRESH_STATE_KEY)

    await snapshotStore.put(snapshot, INVENTORY_CACHE_KEY)
    await refreshStore.put(
      {
        ...refreshState,
        appliedSourceVersion: snapshot.metadata.sourceVersion,
      },
      INVENTORY_REFRESH_STATE_KEY,
    )
    await transaction.done

    return snapshot
  } finally {
    database.close()
  }
}

export async function replaceCachedInventorySnapshotAndMarkRefresh(
  snapshot: unknown,
  completedMonth: string,
): Promise<NormalizedInventorySnapshot> {
  assertValidInventorySnapshot(snapshot)

  const database = await openInventoryCache()
  const transaction = database.transaction(
    [INVENTORY_CACHE_STORE_NAME, INVENTORY_REFRESH_STATE_STORE_NAME],
    'readwrite',
  )
  try {
    const snapshotStore = transaction.objectStore(INVENTORY_CACHE_STORE_NAME)
    const refreshStore = transaction.objectStore(INVENTORY_REFRESH_STATE_STORE_NAME)
    const refreshState = await refreshStore.get(INVENTORY_REFRESH_STATE_KEY)

    await snapshotStore.put(snapshot, INVENTORY_CACHE_KEY)
    await refreshStore.put(
      {
        ...refreshState,
        appliedSourceVersion: snapshot.metadata.sourceVersion,
        completedMonth,
      },
      INVENTORY_REFRESH_STATE_KEY,
    )
    await transaction.done

    return snapshot
  } finally {
    database.close()
  }
}

export async function getInventoryRefreshState(): Promise<
  InventoryRefreshState | undefined
> {
  const database = await openInventoryCache()
  try {
    return await database.get(
      INVENTORY_REFRESH_STATE_STORE_NAME,
      INVENTORY_REFRESH_STATE_KEY,
    )
  } finally {
    database.close()
  }
}

export type RefreshCheckClaim =
  | { claimed: true; state: InventoryRefreshState }
  | {
      claimed: false
      reason: 'already-checked' | 'completed-month'
      state: InventoryRefreshState | undefined
    }

export async function claimInventoryMetadataCheck(
  dateKey: string,
  monthKey: string,
): Promise<RefreshCheckClaim> {
  const database = await openInventoryCache()
  try {
    const transaction = database.transaction(
      INVENTORY_REFRESH_STATE_STORE_NAME,
      'readwrite',
    )
    const store = transaction.store
    const state = await store.get(INVENTORY_REFRESH_STATE_KEY)

    if (state?.completedMonth === monthKey) {
      await transaction.done
      return { claimed: false, reason: 'completed-month', state }
    }

    if (state?.lastCheckedDate === dateKey) {
      await transaction.done
      return { claimed: false, reason: 'already-checked', state }
    }

    const nextState: InventoryRefreshState = {
      ...state,
      lastCheckedDate: dateKey,
    }
    await store.put(nextState, INVENTORY_REFRESH_STATE_KEY)
    await transaction.done

    return { claimed: true, state: nextState }
  } finally {
    database.close()
  }
}

async function fetchBundledInventorySnapshotWithDiagnostics(
  fetcher: SnapshotFetcher = fetch,
): Promise<{ snapshot: NormalizedInventorySnapshot; responseSizeBytes: number }> {
  const response = await fetcher(BUNDLED_INVENTORY_SNAPSHOT_PATH)

  if (!response.ok) {
    throw new InventoryCacheError(
      `Bundled inventory request failed: ${response.status} ${response.statusText}`,
      'request',
    )
  }

  const body = await response.arrayBuffer()
  const responseSizeBytes = body.byteLength
  let snapshot: unknown

  try {
    snapshot = JSON.parse(new TextDecoder().decode(body))
  } catch {
    throw new InventoryCacheError(
      'Bundled inventory response was not valid JSON.',
      'invalid',
    )
  }

  assertValidInventorySnapshot(snapshot)
  return { snapshot, responseSizeBytes }
}

export async function fetchBundledInventorySnapshot(
  fetcher: SnapshotFetcher = fetch,
): Promise<NormalizedInventorySnapshot> {
  const result = await fetchBundledInventorySnapshotWithDiagnostics(fetcher)
  return result.snapshot
}

export async function loadInventorySnapshot(
  fetcher: SnapshotFetcher = fetch,
): Promise<InventorySnapshotLoadResult> {
  const startedAt = Date.now()
  let cached: NormalizedInventorySnapshot | undefined
  let cacheReadError: unknown

  try {
    cached = await getCachedInventorySnapshot()
  } catch (error) {
    cacheReadError = error
  }

  if (cached) {
    recordClientDiagnostic({
      operation: 'inventory-load',
      status: 'cached',
      durationMs: Math.max(0, Date.now() - startedAt),
      sourceRowCount: cached.baskets.length,
      validRowCount: cached.baskets.length,
      invalidRowCount: 0,
      duplicateCount: 0,
      terminationReason: 'indexeddb-cache',
      sourceVersion: cached.metadata.sourceVersion,
    })
    return { snapshot: cached, source: 'indexeddb' }
  }

  let bundledResult: {
    snapshot: NormalizedInventorySnapshot
    responseSizeBytes: number
  }

  try {
    bundledResult = await fetchBundledInventorySnapshotWithDiagnostics(fetcher)
  } catch (error) {
    recordClientDiagnostic({
      operation: 'inventory-load',
      status: 'error',
      durationMs: Math.max(0, Date.now() - startedAt),
      terminationReason: 'bundled-inventory-load-failure',
      errorCode:
        error instanceof InventoryCacheError && error.reason === 'invalid'
          ? 'schema-failure'
          : error instanceof InventoryCacheError && error.reason === 'empty'
            ? 'empty-response'
            : 'inventory-request-failure',
    })
    throw error
  }

  const bundled = bundledResult.snapshot
  let cacheWriteError: unknown

  try {
    await replaceCachedInventorySnapshot(bundled)
  } catch (error) {
    cacheWriteError = error
  }

  recordClientDiagnostic({
    operation: 'inventory-load',
    status: 'success',
    durationMs: Math.max(0, Date.now() - startedAt),
    responseSizeBytes: bundledResult.responseSizeBytes,
    sourceRowCount: bundled.baskets.length,
    validRowCount: bundled.baskets.length,
    invalidRowCount: 0,
    duplicateCount: 0,
    terminationReason: 'bundled-inventory',
    sourceVersion: bundled.metadata.sourceVersion,
    ...(cacheWriteError ? { errorCode: 'cache-write-failure' as const } : {}),
  })

  return {
    snapshot: bundled,
    source: 'bundled',
    ...(cacheReadError ? { cacheReadError } : {}),
    ...(cacheWriteError ? { cacheWriteError } : {}),
  }
}
