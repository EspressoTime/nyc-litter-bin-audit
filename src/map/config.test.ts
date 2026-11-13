import { MAP_CONFIG } from './config'

describe('map configuration', () => {
  it('uses the verified OpenFreeMap Liberty style without a client API key', () => {
    expect(MAP_CONFIG.provider).toBe('OpenFreeMap')
    expect(MAP_CONFIG.styleUrl).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(MAP_CONFIG.requiresApiKey).toBe(false)
    expect(MAP_CONFIG.attributionRequired).toBe(true)
  })

  it('starts at a NYC map extent', () => {
    expect(MAP_CONFIG.center[0]).toBeCloseTo(-73.9857)
    expect(MAP_CONFIG.center[1]).toBeCloseTo(40.7484)
    expect(MAP_CONFIG.zoom).toBe(10)
  })
})
