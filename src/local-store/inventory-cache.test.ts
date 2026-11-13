import { deleteDB } from 'idb'

import {
  createInventorySnapshot,
  type NormalizedInventorySnapshot,
} from '../baskets/model'
import {
  getCachedInventorySnapshot,
  INVENTORY_CACHE_DB_NAME,
  isValidInventorySnapshot,
  loadInventorySnapshot,
  replaceCachedInventorySnapshot,
} from './inventory-cache'

const snapshot: NormalizedInventorySnapshot = createInventorySnapshot(
  [
    {
      basketId: 'B-1',
      objectId: 'O-1',
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
  ],
  {
    fetchedAt: '2026-11-11T12:00:00.000Z',
    sourceVersion: '1794244182',
  },
)

describe('local inventory cache', () => {
  beforeEach(async () => {
    await deleteDB(INVENTORY_CACHE_DB_NAME)
  })

  it('atomically stores and reads a validated snapshot', async () => {
    await replaceCachedInventorySnapshot(snapshot)

    await expect(getCachedInventorySnapshot()).resolves.toEqual(snapshot)
  })

  it('rejects an empty snapshot and preserves the previous valid snapshot', async () => {
    await replaceCachedInventorySnapshot(snapshot)

    await expect(
      replaceCachedInventorySnapshot({ ...snapshot, baskets: [] }),
    ).rejects.toThrow('failed validation')
    await expect(getCachedInventorySnapshot()).resolves.toEqual(snapshot)
  })

  it('uses the bundled snapshot on first load and caches it', async () => {
    let fetchCount = 0
    const fetcher = async () => {
      fetchCount += 1
      return new Response(JSON.stringify(snapshot), { status: 200 })
    }

    const firstLoad = await loadInventorySnapshot(fetcher)
    const secondLoad = await loadInventorySnapshot(fetcher)

    expect(firstLoad.source).toBe('bundled')
    expect(secondLoad.source).toBe('indexeddb')
    expect(fetchCount).toBe(1)
  })

  it('uses the cached snapshot without requesting the network', async () => {
    await replaceCachedInventorySnapshot(snapshot)
    const fetcher = vi.fn(async () => {
      throw new Error('network unavailable')
    })

    await expect(loadInventorySnapshot(fetcher)).resolves.toMatchObject({
      source: 'indexeddb',
      snapshot,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not accept malformed or duplicate snapshots', () => {
    expect(isValidInventorySnapshot({})).toBe(false)
    expect(
      isValidInventorySnapshot({
        ...snapshot,
        baskets: [snapshot.baskets[0], snapshot.baskets[0]],
      }),
    ).toBe(false)
  })

  it('classifies an empty snapshot as no returned data', async () => {
    await expect(
      replaceCachedInventorySnapshot({ ...snapshot, baskets: [] }),
    ).rejects.toMatchObject({ reason: 'empty' })
  })
})
