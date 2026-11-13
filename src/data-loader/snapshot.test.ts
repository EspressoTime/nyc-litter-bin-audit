import {
  BUNDLED_INVENTORY_SNAPSHOT_FORMAT_VERSION,
  BUNDLED_INVENTORY_SNAPSHOT_PATH,
} from './snapshot'

describe('bundled inventory snapshot', () => {
  it('uses a versioned static application asset path', () => {
    expect(BUNDLED_INVENTORY_SNAPSHOT_PATH).toBe('/data/basket-inventory.json')
    expect(BUNDLED_INVENTORY_SNAPSHOT_FORMAT_VERSION).toBe(1)
  })
})
