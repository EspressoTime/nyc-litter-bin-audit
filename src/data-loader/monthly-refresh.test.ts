import { deleteDB } from 'idb'

import { createInventorySnapshot } from '../baskets/model'
import {
  getCachedInventorySnapshot,
  getInventoryRefreshState,
  INVENTORY_CACHE_DB_NAME,
  replaceCachedInventorySnapshot,
} from '../local-store/inventory-cache'
import {
  checkForMonthlyInventoryUpdate,
  getNewYorkCalendarContext,
  isNewerSourceVersion,
} from './monthly-refresh'

const currentSnapshot = createInventorySnapshot(
  [
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
  ],
  {
    fetchedAt: '2026-11-06T12:00:00.000Z',
    sourceVersion: '10',
  },
)

function metadataResponse(sourceVersion: string): Response {
  return new Response(
    JSON.stringify({ id: '8znf-7b2c', rowsUpdatedAt: sourceVersion }),
    { status: 200 },
  )
}

function inventoryLoadResult() {
  return {
    records: [
      {
        basketid: 'B-1',
        latitude: '40.7128',
        longitude: '-74.006',
      },
    ],
    diagnostics: {
      strategy: 'high-limit' as const,
      requestCount: 1,
      pageCount: 1,
      responseSizeBytes: 128,
      rawRecordCount: 1,
      uniqueRecordCount: 1,
      duplicateCount: 0,
      terminationReason: 'short-high-limit-page' as const,
    },
  }
}

describe('monthly inventory refresh', () => {
  beforeEach(async () => {
    await deleteDB(INVENTORY_CACHE_DB_NAME)
  })

  it('uses America/New_York calendar dates at the month boundary', () => {
    expect(getNewYorkCalendarContext(new Date('2026-11-07T03:30:00.000Z'))).toEqual({
      dateKey: '2026-11-06',
      monthKey: '2026-11',
      day: 6,
    })
    expect(getNewYorkCalendarContext(new Date('2026-11-07T05:30:00.000Z'))).toEqual({
      dateKey: '2026-11-07',
      monthKey: '2026-11',
      day: 7,
    })
  })

  it('does not check Socrata before the 7th', async () => {
    let metadataRequests = 0

    const result = await checkForMonthlyInventoryUpdate({
      currentSnapshot,
      now: new Date('2026-11-06T16:00:00.000Z'),
      fetcher: async () => {
        metadataRequests += 1
        return metadataResponse('11')
      },
    })

    expect(result.outcome).toBe('not-eligible')
    expect(metadataRequests).toBe(0)
  })

  it('checks metadata once per eligible day and skips unchanged full retrieval', async () => {
    let metadataRequests = 0
    let fullLoads = 0
    const options = {
      currentSnapshot,
      now: new Date('2026-11-07T16:00:00.000Z'),
      fetcher: async () => {
        metadataRequests += 1
        return metadataResponse('10')
      },
      loadInventory: async () => {
        fullLoads += 1
        return inventoryLoadResult()
      },
    }

    const first = await checkForMonthlyInventoryUpdate(options)
    const second = await checkForMonthlyInventoryUpdate(options)

    expect(first.outcome).toBe('unchanged')
    expect(second.outcome).toBe('already-checked')
    expect(metadataRequests).toBe(1)
    expect(fullLoads).toBe(0)
  })

  it('does not duplicate a daily metadata check across concurrent callers', async () => {
    let metadataRequests = 0
    const options = {
      currentSnapshot,
      now: new Date('2026-11-07T16:00:00.000Z'),
      fetcher: async () => {
        metadataRequests += 1
        await Promise.resolve()
        return metadataResponse('10')
      },
    }

    const results = await Promise.all([
      checkForMonthlyInventoryUpdate(options),
      checkForMonthlyInventoryUpdate(options),
    ])

    expect(results.map((result) => result.outcome).sort()).toEqual([
      'already-checked',
      'unchanged',
    ])
    expect(metadataRequests).toBe(1)
  })

  it('replaces the cache after a newer version and stops checking for the month', async () => {
    let metadataRequests = 0
    let fullLoads = 0
    const fetcher = async () => {
      metadataRequests += 1
      return metadataResponse('11')
    }
    const loadInventory = async () => {
      fullLoads += 1
      return inventoryLoadResult()
    }

    const updated = await checkForMonthlyInventoryUpdate({
      currentSnapshot,
      now: new Date('2026-11-07T16:00:00.000Z'),
      fetcher,
      loadInventory,
    })
    const afterUpdate = await checkForMonthlyInventoryUpdate({
      currentSnapshot,
      now: new Date('2026-11-08T16:00:00.000Z'),
      fetcher,
      loadInventory,
    })

    expect(updated.outcome).toBe('updated')
    expect(afterUpdate.outcome).toBe('completed-month')
    expect(metadataRequests).toBe(1)
    expect(fullLoads).toBe(1)
    expect((await getCachedInventorySnapshot())?.metadata.sourceVersion).toBe('11')
    expect((await getInventoryRefreshState())?.completedMonth).toBe('2026-11')

    const nextMonth = await checkForMonthlyInventoryUpdate({
      currentSnapshot,
      now: new Date('2026-12-07T16:00:00.000Z'),
      fetcher,
      loadInventory,
    })

    expect(nextMonth.outcome).toBe('unchanged')
    expect(metadataRequests).toBe(2)
  })

  it('allows a later eligible day to retry after a metadata failure', async () => {
    let shouldFail = true
    let metadataRequests = 0
    const fetcher = async () => {
      metadataRequests += 1
      if (shouldFail) {
        throw new Error('temporary outage')
      }

      return metadataResponse('10')
    }

    await expect(
      checkForMonthlyInventoryUpdate({
        currentSnapshot,
        now: new Date('2026-11-07T16:00:00.000Z'),
        fetcher,
      }),
    ).rejects.toThrow('temporary outage')

    shouldFail = false
    const retry = await checkForMonthlyInventoryUpdate({
      currentSnapshot,
      now: new Date('2026-11-08T16:00:00.000Z'),
      fetcher,
    })

    expect(retry.outcome).toBe('unchanged')
    expect(metadataRequests).toBe(2)
  })

  it('preserves the old cache and retries after a full-data failure', async () => {
    await replaceCachedInventorySnapshot(currentSnapshot)
    let shouldFail = true
    let fullLoads = 0
    const fetcher = async () => metadataResponse('11')
    const loadInventory = async () => {
      fullLoads += 1
      if (shouldFail) {
        throw new Error('full inventory unavailable')
      }

      return inventoryLoadResult()
    }

    await expect(
      checkForMonthlyInventoryUpdate({
        currentSnapshot,
        now: new Date('2026-11-07T16:00:00.000Z'),
        fetcher,
        loadInventory,
      }),
    ).rejects.toThrow('full inventory unavailable')
    expect((await getCachedInventorySnapshot())?.metadata.sourceVersion).toBe('10')

    shouldFail = false
    const retry = await checkForMonthlyInventoryUpdate({
      currentSnapshot,
      now: new Date('2026-11-08T16:00:00.000Z'),
      fetcher,
      loadInventory,
    })

    expect(retry.outcome).toBe('updated')
    expect(fullLoads).toBe(2)
    expect((await getCachedInventorySnapshot())?.metadata.sourceVersion).toBe('11')
  })

  it('preserves the old cache after a metadata request failure', async () => {
    await replaceCachedInventorySnapshot(currentSnapshot)

    await expect(
      checkForMonthlyInventoryUpdate({
        currentSnapshot,
        now: new Date('2026-11-07T16:00:00.000Z'),
        fetcher: async () => {
          throw new Error('metadata unavailable')
        },
      }),
    ).rejects.toThrow('metadata unavailable')

    expect((await getCachedInventorySnapshot())?.metadata.sourceVersion).toBe('10')
  })

  it('only treats numerically greater source versions as newer', () => {
    expect(isNewerSourceVersion('11', '10')).toBe(true)
    expect(isNewerSourceVersion('10', '10')).toBe(false)
    expect(isNewerSourceVersion('9', '10')).toBe(false)
  })
})
