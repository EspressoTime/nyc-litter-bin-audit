const config = {
  metadataUrl: 'https://data.cityofnewyork.us/api/views/8znf-7b2c',
  resourceUrl: 'https://data.cityofnewyork.us/resource/8znf-7b2c.json',
  origin: 'http://127.0.0.1:5173',
  fields: ['basketid', 'baskettype', 'latitude', 'longitude'],
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Origin: config.origin,
    },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }

  return { response, data: await response.json() }
}

const metadataResult = await fetchJson(config.metadataUrl)
const sampleUrl = new URL(config.resourceUrl)
sampleUrl.searchParams.set('$select', config.fields.join(','))
sampleUrl.searchParams.set('$order', 'basketid')
sampleUrl.searchParams.set('$limit', '2')
const sampleResult = await fetchJson(sampleUrl)
const sampleRows = Array.isArray(sampleResult.data) ? sampleResult.data : []

const corsOrigin = sampleResult.response.headers.get('access-control-allow-origin')
const sampleFields = Object.keys(sampleRows[0] ?? {})
const missingFields = config.fields.filter((field) => !sampleFields.includes(field))

if (corsOrigin !== '*' && corsOrigin !== config.origin) {
  throw new Error(
    `Expected browser CORS access, received Access-Control-Allow-Origin: ${corsOrigin ?? 'missing'}`,
  )
}

if (missingFields.length > 0) {
  throw new Error(`Missing expected sample fields: ${missingFields.join(', ')}`)
}

const result = {
  metadataStatus: metadataResult.response.status,
  resourceStatus: sampleResult.response.status,
  corsOrigin,
  datasetId: metadataResult.data.id,
  datasetName: metadataResult.data.name,
  assetType: metadataResult.data.assetType,
  rowsUpdatedAt: metadataResult.data.rowsUpdatedAt,
  sampleRowCount: sampleRows.length,
  sampleFields,
  sodaTruthLastModified: sampleResult.response.headers.get(
    'x-soda2-truth-last-modified',
  ),
  sodaDataOutOfDate: sampleResult.response.headers.get('x-soda2-data-out-of-date'),
  socrataRequestId: sampleResult.response.headers.get('x-socrata-requestid'),
}

console.log(JSON.stringify(result, null, 2))
