export const GEOSEARCH_CONFIG = {
  baseUrl: 'https://geosearch.planninglabs.nyc/v2',
  autocompletePath: '/autocomplete',
  searchPath: '/search',
  autocompleteDefaultSize: 5,
  searchDefaultSize: 10,
  debounceMs: 250,
} as const

export type GeoSearchFocus = {
  latitude: number
  longitude: number
}

export type GeoSearchOptions = {
  size?: number
  focus?: GeoSearchFocus
  signal?: AbortSignal
}

export type PlaceSearchResult = {
  id?: string
  label: string
  latitude: number
  longitude: number
  confidence?: number
}

type GeoSearchPayload = {
  type?: unknown
  features?: unknown
}

type GeoSearchFeature = {
  id?: unknown
  geometry?: {
    type?: unknown
    coordinates?: unknown
  }
  properties?: {
    label?: unknown
    name?: unknown
    confidence?: unknown
  }
}

export function buildGeoSearchUrl(
  path: string,
  text: string,
  options: GeoSearchOptions = {},
): string {
  const normalizedText = text.trim()

  if (!normalizedText) {
    throw new Error('GeoSearch text must not be empty')
  }

  const url = new URL(`${GEOSEARCH_CONFIG.baseUrl}${path}`)
  url.searchParams.set('text', normalizedText)

  if (options.size !== undefined) {
    url.searchParams.set('size', String(options.size))
  }

  if (options.focus) {
    url.searchParams.set('focus.point.lat', String(options.focus.latitude))
    url.searchParams.set('focus.point.lon', String(options.focus.longitude))
  }

  return url.toString()
}

export function normalizeGeoSearchPayload(
  payload: GeoSearchPayload,
): PlaceSearchResult[] {
  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('GeoSearch response was not a FeatureCollection')
  }

  return payload.features.flatMap((feature): PlaceSearchResult[] => {
    if (!feature || typeof feature !== 'object') return []

    const candidate = feature as GeoSearchFeature
    const coordinates = candidate.geometry?.coordinates
    const properties = candidate.properties

    if (
      candidate.geometry?.type !== 'Point' ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      return []
    }

    const longitude = Number(coordinates[0])
    const latitude = Number(coordinates[1])
    const label = properties?.label ?? properties?.name

    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      typeof label !== 'string' ||
      !label.trim()
    ) {
      return []
    }

    const confidence = Number(properties?.confidence)

    return [
      {
        id: typeof candidate.id === 'string' ? candidate.id : undefined,
        label: label.trim(),
        latitude,
        longitude,
        confidence: Number.isFinite(confidence) ? confidence : undefined,
      },
    ]
  })
}

export function createGeoSearchClient(fetcher: typeof fetch = fetch) {
  async function request(
    path: string,
    text: string,
    options: GeoSearchOptions,
  ): Promise<PlaceSearchResult[]> {
    const response = await fetcher(buildGeoSearchUrl(path, text, options), {
      signal: options.signal,
    })

    if (!response.ok) {
      throw new Error(`GeoSearch request failed with HTTP ${response.status}`)
    }

    return normalizeGeoSearchPayload((await response.json()) as GeoSearchPayload)
  }

  return {
    autocomplete: (text: string, options: GeoSearchOptions = {}) =>
      request(GEOSEARCH_CONFIG.autocompletePath, text, {
        ...options,
        size: options.size ?? GEOSEARCH_CONFIG.autocompleteDefaultSize,
      }),
    search: (text: string, options: GeoSearchOptions = {}) =>
      request(GEOSEARCH_CONFIG.searchPath, text, {
        ...options,
        size: options.size ?? GEOSEARCH_CONFIG.searchDefaultSize,
      }),
  }
}

export type GeoSearchClient = ReturnType<typeof createGeoSearchClient>
