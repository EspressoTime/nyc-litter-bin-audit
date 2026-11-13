import type { NormalizedBasket } from '../baskets/model'
import { buildComplaintDraft } from './complaint-draft'

const basket: NormalizedBasket = {
  basketId: 'B-100',
  objectId: 'O-100',
  basketType: 'Public Litter Basket',
  direction: 'NE corner',
  streetName1: 'Broadway',
  streetName2: 'W 34th St',
  latitude: 40.7484,
  longitude: -73.9857,
  borough: 'MANHATTAN',
  district: 'MN05',
  point: { type: 'Point', coordinates: [-73.9857, 40.7484] },
}

describe('buildComplaintDraft', () => {
  it('includes the official location context and available identifiers', () => {
    expect(
      buildComplaintDraft({
        basket,
        observedAt: '2026-11-12T15:00:00.000Z',
      }),
    ).toBe(
      'I could not find the public litter basket listed in the DSNY Litter Basket Inventory at Broadway and W 34th St (NE corner).\n' +
        'Basket ID: B-100.\n' +
        'Borough: MANHATTAN.\n' +
        'District: MN05.\n' +
        'I observed this on November 12, 2026.\n' +
        'Please investigate the location and replace the basket if appropriate.',
    )
  })

  it('omits missing optional fields without inventing values', () => {
    expect(
      buildComplaintDraft({
        basket: {
          ...basket,
          basketId: '',
          streetName1: null,
          streetName2: null,
          direction: null,
          borough: null,
          district: null,
        },
        observedAt: '2026-11-12T15:00:00.000Z',
      }),
    ).toBe(
      'I could not find the public litter basket listed in the DSNY Litter Basket Inventory at the listed official location.\n' +
        'I observed this on November 12, 2026.\n' +
        'Please investigate the location and replace the basket if appropriate.',
    )
  })
})
