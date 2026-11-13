const config = {
  origin: 'http://127.0.0.1:5173',
  endpoints: [
    'https://geosearch.planninglabs.nyc/v2/search?text=100%20East%20Broadway&size=2',
    'https://geosearch.planninglabs.nyc/v2/autocomplete?text=100%20East%20Broadway&size=2',
  ],
}

for (const endpoint of config.endpoints) {
  const response = await fetch(endpoint, {
    headers: { Origin: config.origin },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${endpoint}`)
  }

  const payload = await response.json()
  const feature = payload.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  const label = feature?.properties?.label ?? feature?.properties?.name
  const corsOrigin = response.headers.get('access-control-allow-origin')

  if (payload.type !== 'FeatureCollection') {
    throw new Error(`Expected FeatureCollection: ${endpoint}`)
  }

  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(Number(coordinates[0])) ||
    !Number.isFinite(Number(coordinates[1])) ||
    typeof label !== 'string'
  ) {
    throw new Error(`Expected labeled point feature: ${endpoint}`)
  }

  if (corsOrigin !== '*' && corsOrigin !== config.origin) {
    throw new Error(`Expected browser CORS access, received ${corsOrigin ?? 'missing'}`)
  }

  console.log(
    JSON.stringify({
      endpoint,
      status: response.status,
      corsOrigin,
      type: payload.type,
      featureCount: payload.features.length,
      label,
      longitude: Number(coordinates[0]),
      latitude: Number(coordinates[1]),
    }),
  )
}
