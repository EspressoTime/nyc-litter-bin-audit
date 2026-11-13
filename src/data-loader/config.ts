export const SOCRATA_CONFIG = {
  domain: 'data.cityofnewyork.us',
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
  refreshStartDay: 7,
  refreshTimeZone: 'America/New_York',
  updateMarkers: {
    metadataTimestampField: 'rowsUpdatedAt',
    truthLastModifiedHeader: 'X-SODA2-Truth-Last-Modified',
    dataOutOfDateHeader: 'X-SODA2-Data-Out-Of-Date',
  },
} as const

export type SocrataQueryOptions = {
  limit?: number
  offset?: number
}

export function buildInventoryQueryUrl({
  limit = SOCRATA_CONFIG.preferredLimit,
  offset = 0,
}: SocrataQueryOptions = {}): string {
  const url = new URL(SOCRATA_CONFIG.resourceEndpoint)

  url.searchParams.set('$select', SOCRATA_CONFIG.fields.join(','))
  url.searchParams.set('$order', SOCRATA_CONFIG.orderBy)
  url.searchParams.set('$limit', String(limit))

  if (offset > 0) {
    url.searchParams.set('$offset', String(offset))
  }

  return url.toString()
}
