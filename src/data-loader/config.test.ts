import { buildInventoryQueryUrl, SOCRATA_CONFIG } from './config'

describe('Socrata configuration', () => {
  it('keeps the official dataset endpoints centralized', () => {
    expect(SOCRATA_CONFIG.datasetId).toBe('8znf-7b2c')
    expect(SOCRATA_CONFIG.resourceEndpoint).toBe(
      'https://data.cityofnewyork.us/resource/8znf-7b2c.json',
    )
    expect(SOCRATA_CONFIG.metadataEndpoint).toBe(
      'https://data.cityofnewyork.us/api/views/8znf-7b2c',
    )
  })

  it('builds a deterministic full-inventory query', () => {
    const url = new URL(buildInventoryQueryUrl())

    expect(url.searchParams.get('$order')).toBe('basketid')
    expect(url.searchParams.get('$limit')).toBe('50000')
    expect(url.searchParams.get('$offset')).toBeNull()
    expect(url.searchParams.get('$select')).toContain('latitude')
    expect(url.searchParams.get('$select')).toContain('longitude')
  })

  it('supports the documented offset fallback', () => {
    const url = new URL(buildInventoryQueryUrl({ limit: 1_000, offset: 2_000 }))

    expect(url.searchParams.get('$limit')).toBe('1000')
    expect(url.searchParams.get('$offset')).toBe('2000')
  })
})
