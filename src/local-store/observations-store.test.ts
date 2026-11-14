import { deleteDB } from 'idb'

import {
  getLocalObservationRecords,
  getLocalObservations,
  LocalObservationStoreError,
  isStoredLocalObservation,
  LOCAL_OBSERVATION_DB_NAME,
  LOCAL_OBSERVATION_FALLBACK_KEY,
  saveLocalObservation,
} from './observations-store'

describe('local observation store', () => {
  beforeEach(async () => {
    await deleteDB(LOCAL_OBSERVATION_DB_NAME)
    localStorage.clear()
  })

  it('stores the required local observation fields in IndexedDB', async () => {
    const record = await saveLocalObservation({
      basketId: 'B-100',
      status: 'exists',
      observedAt: '2026-11-12T15:00:00.000Z',
      createdAt: '2026-11-12T15:01:00.000Z',
    })

    expect(record).toMatchObject({
      basket_id: 'B-100',
      status: 'exists',
      observed_at: '2026-11-12T15:00:00.000Z',
      created_at: '2026-11-12T15:01:00.000Z',
      source: 'local',
    })
    expect(record.local_observation_id).toBeTruthy()
    expect(isStoredLocalObservation(record)).toBe(true)
    await expect(getLocalObservationRecords()).resolves.toEqual([record])
  })

  it('keeps observations separate and adapts them for status calculation', async () => {
    await saveLocalObservation({
      basketId: 'B-100',
      status: 'missing',
      observedAt: '2026-11-12T15:00:00.000Z',
    })

    await expect(getLocalObservations()).resolves.toEqual([
      {
        basketId: 'B-100',
        status: 'missing',
        observedAt: '2026-11-12T15:00:00.000Z',
      },
    ])
  })

  it('uses the localStorage fallback when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)

    try {
      const record = await saveLocalObservation({
        basketId: 'B-200',
        status: 'exists',
        observedAt: '2026-11-12T15:00:00.000Z',
      })

      expect(localStorage.getItem(LOCAL_OBSERVATION_FALLBACK_KEY)).not.toBeNull()
      await expect(getLocalObservationRecords()).resolves.toEqual([record])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports a storage error when IndexedDB and localStorage are unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    try {
      await expect(
        saveLocalObservation({
          basketId: 'B-201',
          status: 'exists',
          observedAt: '2026-11-12T15:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(LocalObservationStoreError)
    } finally {
      setItem.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('does not send observations to remote services', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await saveLocalObservation({
      basketId: 'B-202',
      status: 'missing',
      observedAt: '2026-11-12T15:00:00.000Z',
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('rejects invalid observation input before writing', async () => {
    await expect(
      saveLocalObservation({
        basketId: '',
        status: 'exists',
        observedAt: 'not-a-date',
      }),
    ).rejects.toThrow('fields are invalid')

    expect(localStorage.getItem(LOCAL_OBSERVATION_FALLBACK_KEY)).toBeNull()
  })
})
