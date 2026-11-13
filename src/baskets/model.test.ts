import { createInventorySnapshot, mapSocrataBasket } from './model'

describe('normalized basket model', () => {
  it('maps every official inventory field to the normalized model', () => {
    const basket = mapSocrataBasket({
      basketid: 'B-100',
      objectid: '200',
      baskettype: 'Public Litter Basket',
      direction: 'North',
      streetname1: 'Main Street',
      streetname2: 'First Avenue',
      latitude: '40.7128',
      longitude: '-74.0060',
      borough: 'Manhattan',
      district: '01',
      point: { type: 'Point', coordinates: [-74.006, 40.7128] },
    })

    expect(basket).toEqual({
      basketId: 'B-100',
      objectId: '200',
      basketType: 'Public Litter Basket',
      direction: 'North',
      streetName1: 'Main Street',
      streetName2: 'First Avenue',
      latitude: 40.7128,
      longitude: -74.006,
      borough: 'Manhattan',
      district: '01',
      point: {
        type: 'Point',
        coordinates: [-74.006, 40.7128],
      },
    })
  })

  it('normalizes empty optional fields to null', () => {
    const basket = mapSocrataBasket({
      basketid: 'B-101',
      latitude: '40.7',
      longitude: '-74',
      streetname2: '',
    })

    expect(basket.objectId).toBeNull()
    expect(basket.streetName2).toBeNull()
    expect(basket.direction).toBeNull()
  })

  it('creates a locally storable snapshot with source metadata', () => {
    const basket = mapSocrataBasket({
      basketid: 'B-102',
      latitude: '40.7',
      longitude: '-74',
    })

    expect(
      createInventorySnapshot([basket], {
        fetchedAt: '2026-11-10T12:00:00.000Z',
        sourceVersion: '1794244182',
      }),
    ).toEqual({
      formatVersion: 1,
      metadata: {
        sourceDatasetId: '8znf-7b2c',
        fetchedAt: '2026-11-10T12:00:00.000Z',
        sourceVersion: '1794244182',
      },
      baskets: [basket],
    })
  })
})
