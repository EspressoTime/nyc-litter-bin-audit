import {
  findBasketForMapFeature,
  getPinFallbackTextSizeForZoom,
  getPinIconSizeForZoom,
  prefersReducedMotion,
  toBasketFeatureCollection,
  toUserPinFeatureCollection,
} from './BasketMap'
import { validateAndNormalizeInventory } from '../baskets/validation'

describe('basket map data source', () => {
  it('converts every normalized basket to a selectable point feature', () => {
    const result = toBasketFeatureCollection([
      {
        basketId: 'B-1',
        objectId: null,
        basketType: 'Public Litter Basket',
        direction: null,
        streetName1: 'Main Street',
        streetName2: null,
        latitude: 40.7128,
        longitude: -74.006,
        borough: 'MANHATTAN',
        district: 'MN01',
        point: { type: 'Point', coordinates: [-74.006, 40.7128] },
      },
      {
        basketId: 'B-2',
        objectId: null,
        basketType: null,
        direction: null,
        streetName1: null,
        streetName2: null,
        latitude: 40.7,
        longitude: -73.99,
        borough: null,
        district: null,
        point: { type: 'Point', coordinates: [-73.99, 40.7] },
      },
    ])

    expect(result.features).toHaveLength(2)
    expect(result.features[0]).toMatchObject({
      id: 'B-1',
      properties: {
        basketId: 'B-1',
        pinImageId: 'basket-pin-unconfirmed',
        glyph: '🗑️',
        accessibleLabel: 'Not confirmed recently',
      },
      geometry: {
        type: 'Point',
        coordinates: [-74.006, 40.7128],
      },
    })
    expect(Object.keys(result.features[0]?.properties ?? {})).toEqual([
      'basketId',
      'pinImageId',
      'glyph',
      'accessibleLabel',
    ])
  })

  it('assigns the local observation glyph without adding map text labels', () => {
    const result = toBasketFeatureCollection(
      [
        {
          basketId: 'B-1',
          objectId: null,
          basketType: null,
          direction: null,
          streetName1: null,
          streetName2: null,
          latitude: 40.7,
          longitude: -73.99,
          borough: null,
          district: null,
          point: { type: 'Point', coordinates: [-73.99, 40.7] },
        },
      ],
      [{ basketId: 'B-1', status: 'missing', observedAt: '2026-11-12T16:00:00.000Z' }],
      new Date('2026-11-12T17:00:00.000Z'),
    )

    expect(result.features[0]?.properties).toEqual({
      basketId: 'B-1',
      pinImageId: 'basket-pin-missing',
      glyph: '🚨',
      accessibleLabel: 'Reported missing today',
    })
  })

  it('excludes invalid inventory records before converting records to map pins', () => {
    const normalized = validateAndNormalizeInventory([
      {
        basketid: 'B-valid',
        latitude: '40.7',
        longitude: '-74',
      },
      {
        basketid: 'B-invalid',
        latitude: 'not-a-coordinate',
        longitude: '-74',
      },
    ])

    const result = toBasketFeatureCollection(normalized.baskets)

    expect(result.features.map((feature) => feature.id)).toEqual(['B-valid'])
    expect(normalized.diagnostics.invalidCoordinateCount).toBe(1)
  })

  it('resolves a selected emoji pin to the correct basket details record', () => {
    const baskets = [
      {
        basketId: 'B-1',
        objectId: null,
        basketType: null,
        direction: null,
        streetName1: 'First Street',
        streetName2: null,
        latitude: 40.7,
        longitude: -74,
        borough: null,
        district: null,
        point: { type: 'Point' as const, coordinates: [-74, 40.7] as [number, number] },
      },
      {
        basketId: 'B-2',
        objectId: null,
        basketType: null,
        direction: null,
        streetName1: 'Second Street',
        streetName2: null,
        latitude: 40.71,
        longitude: -73.99,
        borough: null,
        district: null,
        point: {
          type: 'Point' as const,
          coordinates: [-73.99, 40.71] as [number, number],
        },
      },
    ]
    const features = toBasketFeatureCollection(baskets)
    const selectedFeature = features.features[1]

    expect(selectedFeature?.properties.glyph).toBe('🗑️')
    expect(findBasketForMapFeature(selectedFeature?.properties, baskets)).toBe(
      baskets[1],
    )
  })

  it('converts local user pins to emoji-only map features', () => {
    const result = toUserPinFeatureCollection([
      {
        local_pin_id: 'P-1',
        latitude: 40.7484,
        longitude: -73.9857,
        last_seen_at: '2026-11-12T15:00:00.000Z',
        created_at: '2026-11-12T15:00:00.000Z',
        updated_at: '2026-11-12T15:00:00.000Z',
        source: 'local',
        kind: 'user_seen_basket',
      },
    ])

    expect(result.features).toEqual([
      {
        type: 'Feature',
        id: 'P-1',
        properties: {
          localPinId: 'P-1',
          pinImageId: 'local-user-pin',
          glyph: '📍',
          accessibleLabel: 'Litter basket seen on November 12, 2026',
        },
        geometry: { type: 'Point', coordinates: [-73.9857, 40.7484] },
      },
    ])
  })

  it('detects the browser reduced-motion preference', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as typeof window.matchMedia

    expect(prefersReducedMotion()).toBe(true)

    window.matchMedia = originalMatchMedia
  })

  it('changes marker sizes dramatically across zoom levels', () => {
    expect(getPinIconSizeForZoom(8)).toBe(0.2)
    expect(getPinIconSizeForZoom(14)).toBe(0.9)
    expect(getPinIconSizeForZoom(17)).toBe(1.4)
    expect(getPinFallbackTextSizeForZoom(8)).toBe(8)
    expect(getPinFallbackTextSizeForZoom(14)).toBe(28)
    expect(getPinFallbackTextSizeForZoom(17)).toBe(42)
  })
})
