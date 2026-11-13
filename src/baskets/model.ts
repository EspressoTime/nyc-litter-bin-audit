import { SOCRATA_CONFIG } from '../data-loader/config'

export const INVENTORY_SNAPSHOT_FORMAT_VERSION = 1 as const

export type SocrataBasketRecord = {
  basketid?: unknown
  objectid?: unknown
  baskettype?: unknown
  direction?: unknown
  streetname1?: unknown
  streetname2?: unknown
  latitude?: unknown
  longitude?: unknown
  borough?: unknown
  district?: unknown
  point?: unknown
}

export type BasketPoint = {
  type: 'Point'
  coordinates: [number, number]
}

export type NormalizedBasket = {
  basketId: string
  objectId: string | null
  basketType: string | null
  direction: string | null
  streetName1: string | null
  streetName2: string | null
  latitude: number
  longitude: number
  borough: string | null
  district: string | null
  point: BasketPoint
}

export type InventorySnapshotMetadata = {
  sourceDatasetId: string
  fetchedAt: string
  sourceVersion: string
}

export type NormalizedInventorySnapshot = {
  formatVersion: typeof INVENTORY_SNAPSHOT_FORMAT_VERSION
  metadata: InventorySnapshotMetadata
  baskets: NormalizedBasket[]
}

function asNullableText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return String(value)
}

export function mapSocrataBasket(record: SocrataBasketRecord): NormalizedBasket {
  const latitude = Number(record.latitude)
  const longitude = Number(record.longitude)

  return {
    basketId: String(record.basketid ?? ''),
    objectId: asNullableText(record.objectid),
    basketType: asNullableText(record.baskettype),
    direction: asNullableText(record.direction),
    streetName1: asNullableText(record.streetname1),
    streetName2: asNullableText(record.streetname2),
    latitude,
    longitude,
    borough: asNullableText(record.borough),
    district: asNullableText(record.district),
    point: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  }
}

export function createInventorySnapshot(
  baskets: NormalizedBasket[],
  metadata: Omit<InventorySnapshotMetadata, 'sourceDatasetId'> & {
    sourceDatasetId?: string
  },
): NormalizedInventorySnapshot {
  return {
    formatVersion: INVENTORY_SNAPSHOT_FORMAT_VERSION,
    metadata: {
      sourceDatasetId: metadata.sourceDatasetId ?? SOCRATA_CONFIG.datasetId,
      fetchedAt: metadata.fetchedAt,
      sourceVersion: metadata.sourceVersion,
    },
    baskets,
  }
}
