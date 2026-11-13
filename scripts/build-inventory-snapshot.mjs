import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const config = {
  datasetId: '8znf-7b2c',
  resourceEndpoint: 'https://data.cityofnewyork.us/resource/8znf-7b2c.json',
  metadataEndpoint: 'https://data.cityofnewyork.us/api/views/8znf-7b2c',
  fields: [
    'basketid',
    'baskettype',
    'direction',
    'streetname1',
    'streetname2',
    'objectid',
    'latitude',
    'longitude',
    'borough',
    'district',
    'point',
  ],
  orderBy: 'basketid',
  preferredLimit: 50_000,
  fallbackPageSize: 1_000,
  snapshotFormatVersion: 1,
  outputPath: resolve(process.cwd(), 'public/data/basket-inventory.json'),
}

const nycBounds = {
  minLatitude: 40.49,
  maxLatitude: 40.92,
  minLongitude: -74.26,
  maxLongitude: -73.69,
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }

  return { response, data: await response.json() }
}

function buildInventoryUrl({ limit, offset } = {}) {
  const url = new URL(config.resourceEndpoint)
  url.searchParams.set('$select', config.fields.join(','))
  url.searchParams.set('$order', config.orderBy)
  url.searchParams.set('$limit', String(limit))

  if (offset > 0) {
    url.searchParams.set('$offset', String(offset))
  }

  return url.toString()
}

async function fetchInventoryRows() {
  try {
    const highLimitResult = await fetchJson(
      buildInventoryUrl({ limit: config.preferredLimit }),
    )

    if (!Array.isArray(highLimitResult.data)) {
      throw new Error('The high-limit inventory response was not an array.')
    }

    if (highLimitResult.data.length < config.preferredLimit) {
      return {
        rows: highLimitResult.data,
        strategy: 'high-limit',
        requestCount: 1,
      }
    }
  } catch (error) {
    console.warn(`High-limit inventory request unavailable: ${error.message}`)
  }

  const rows = []
  let offset = 0
  let requestCount = 1

  while (true) {
    const pageResult = await fetchJson(
      buildInventoryUrl({
        limit: config.fallbackPageSize,
        offset,
      }),
    )

    if (!Array.isArray(pageResult.data)) {
      throw new Error(`Inventory page at offset ${offset} was not an array.`)
    }

    rows.push(...pageResult.data)
    requestCount += 1

    if (pageResult.data.length < config.fallbackPageSize) {
      return { rows, strategy: 'offset-pagination', requestCount }
    }

    offset += pageResult.data.length
  }
}

function asNullableText(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return String(value)
}

function parseCoordinate(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null
  }

  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : null
}

function isWithinNycBounds(latitude, longitude) {
  return (
    latitude >= nycBounds.minLatitude &&
    latitude <= nycBounds.maxLatitude &&
    longitude >= nycBounds.minLongitude &&
    longitude <= nycBounds.maxLongitude
  )
}

function normalizeRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { kind: 'unnormalizable' }
  }

  if (
    (typeof record.basketid !== 'string' && typeof record.basketid !== 'number') ||
    String(record.basketid).trim() === ''
  ) {
    return { kind: 'unnormalizable' }
  }

  const latitude = parseCoordinate(record.latitude)
  const longitude = parseCoordinate(record.longitude)

  if (
    latitude === null ||
    longitude === null ||
    !isWithinNycBounds(latitude, longitude)
  ) {
    return { kind: 'invalid-coordinate' }
  }

  return {
    kind: 'valid',
    basket: {
      basketId: String(record.basketid),
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
    },
  }
}

const metadataResult = await fetchJson(config.metadataEndpoint)
if (metadataResult.data.id !== config.datasetId) {
  throw new Error(`Unexpected dataset ID: ${metadataResult.data.id}`)
}

const sourceVersion = String(metadataResult.data.rowsUpdatedAt ?? '').trim()
if (!sourceVersion) {
  throw new Error('The Socrata metadata did not include rowsUpdatedAt.')
}

const inventory = await fetchInventoryRows()
const seenBasketIds = new Set()
const baskets = []
let duplicateCount = 0
let invalidCoordinateCount = 0
let unnormalizableRecordCount = 0

for (const record of inventory.rows) {
  const basketId =
    record &&
    (typeof record.basketid === 'string' || typeof record.basketid === 'number')
      ? String(record.basketid).trim()
      : ''

  if (basketId && seenBasketIds.has(basketId)) {
    duplicateCount += 1
    continue
  }

  const normalized = normalizeRecord(record)
  if (normalized.kind === 'invalid-coordinate') {
    invalidCoordinateCount += 1
    continue
  }

  if (normalized.kind === 'unnormalizable') {
    unnormalizableRecordCount += 1
    continue
  }

  seenBasketIds.add(basketId)
  baskets.push(normalized.basket)
}

if (baskets.length === 0) {
  throw new Error('No valid baskets were available; refusing to write a snapshot.')
}

const snapshot = {
  formatVersion: config.snapshotFormatVersion,
  metadata: {
    sourceDatasetId: config.datasetId,
    fetchedAt: new Date().toISOString(),
    sourceVersion,
  },
  baskets,
}

await mkdir(dirname(config.outputPath), { recursive: true })
await writeFile(config.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

console.log(
  JSON.stringify(
    {
      outputPath: config.outputPath,
      strategy: inventory.strategy,
      requestCount: inventory.requestCount,
      rawRecordCount: inventory.rows.length,
      validRecordCount: baskets.length,
      invalidCoordinateCount,
      duplicateCount,
      unnormalizableRecordCount,
      sourceVersion,
    },
    null,
    2,
  ),
)
