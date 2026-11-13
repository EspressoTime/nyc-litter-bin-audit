import {
  prefersReducedMotion,
  toBasketFeatureCollection,
  toUserPinFeatureCollection,
} from './BasketMap'

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
})
