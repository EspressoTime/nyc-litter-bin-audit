import {
  buildGeoSearchUrl,
  createGeoSearchClient,
  GEOSEARCH_CONFIG,
  normalizeGeoSearchPayload,
} from './geosearch'

const fixture = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'address.1',
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.99, 40.75] },
      properties: { label: '100 Broadway, New York, NY', confidence: 0.98 },
    },
    {
      id: 'address.2',
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-74.01, 40.71] },
      properties: { name: 'Second result' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ['not-a-number', 40.7] },
      properties: { label: 'Invalid result' },
    },
  ],
}

describe('NYC GeoSearch adapter', () => {
  it('builds autocomplete URLs with encoded text and local focus', () => {
    const url = new URL(
      buildGeoSearchUrl(GEOSEARCH_CONFIG.autocompletePath, '100 Broadway', {
        size: 5,
        focus: { latitude: 40.75, longitude: -73.99 },
      }),
    )

    expect(url.pathname).toBe('/v2/autocomplete')
    expect(url.searchParams.get('text')).toBe('100 Broadway')
    expect(url.searchParams.get('size')).toBe('5')
    expect(url.searchParams.get('focus.point.lat')).toBe('40.75')
    expect(url.searchParams.get('focus.point.lon')).toBe('-73.99')
  })

  it('normalizes GeoJSON coordinates in longitude, latitude order', () => {
    expect(normalizeGeoSearchPayload(fixture)).toEqual([
      {
        id: 'address.1',
        label: '100 Broadway, New York, NY',
        latitude: 40.75,
        longitude: -73.99,
        confidence: 0.98,
      },
      {
        id: 'address.2',
        label: 'Second result',
        latitude: 40.71,
        longitude: -74.01,
        confidence: undefined,
      },
    ])
  })

  it('uses separate autocomplete and search paths and passes abort signals', async () => {
    const requestedUrls: string[] = []
    const requestedSignals: Array<AbortSignal | null | undefined> = []
    const signal = new AbortController().signal
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrls.push(String(input))
      requestedSignals.push(init?.signal)
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const client = createGeoSearchClient(fetcher)

    await client.autocomplete('Broadway', { signal })
    await client.search('100 Broadway', { signal })

    expect(requestedUrls[0]).toContain('/v2/autocomplete')
    expect(requestedUrls[1]).toContain('/v2/search')
    expect(requestedSignals[0]).toBe(signal)
  })

  it('rejects empty text before making a request', () => {
    expect(() => buildGeoSearchUrl('/search', '   ')).toThrow(
      'GeoSearch text must not be empty',
    )
  })
})
