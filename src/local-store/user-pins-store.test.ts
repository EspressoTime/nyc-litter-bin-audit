import { deleteDB } from 'idb'

import {
  createLocalUserPin,
  deleteLocalUserPin,
  getLocalUserPins,
  LocalUserPinStoreError,
  LOCAL_PIN_DB_NAME,
  LOCAL_PIN_FALLBACK_KEY,
  reconfirmLocalUserPin,
} from './user-pins-store'

describe('local user pin store', () => {
  beforeEach(async () => {
    await deleteDB(LOCAL_PIN_DB_NAME)
    localStorage.clear()
  })

  it('creates, reconfirms, reads, and removes a local pin', async () => {
    const pin = await createLocalUserPin({
      latitude: 40.7484,
      longitude: -73.9857,
      lastSeenAt: '2026-11-12T15:00:00.000Z',
    })

    expect(pin).toMatchObject({
      latitude: 40.7484,
      longitude: -73.9857,
      last_seen_at: '2026-11-12T15:00:00.000Z',
      source: 'local',
      kind: 'user_seen_basket',
    })
    await expect(getLocalUserPins()).resolves.toEqual([pin])

    const updatedPin = await reconfirmLocalUserPin(pin, '2026-11-13T15:00:00.000Z')
    expect(updatedPin.last_seen_at).toBe('2026-11-13T15:00:00.000Z')
    await expect(getLocalUserPins()).resolves.toEqual([updatedPin])

    await deleteLocalUserPin(updatedPin)
    await expect(getLocalUserPins()).resolves.toEqual([])
  })

  it('uses localStorage when IndexedDB is unavailable', async () => {
    const originalIndexedDb = window.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    })

    try {
      const pin = await createLocalUserPin({
        latitude: 40.7,
        longitude: -74,
        lastSeenAt: '2026-11-12T15:00:00.000Z',
      })

      expect(localStorage.getItem(LOCAL_PIN_FALLBACK_KEY)).not.toBeNull()
      await expect(getLocalUserPins()).resolves.toEqual([pin])
    } finally {
      vi.unstubAllGlobals()
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: originalIndexedDb,
      })
    }
  })

  it('reports a storage error when the localStorage fallback is full', async () => {
    const originalIndexedDb = window.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    try {
      await expect(
        createLocalUserPin({ latitude: 40.7, longitude: -74 }),
      ).rejects.toBeInstanceOf(LocalUserPinStoreError)
    } finally {
      setItem.mockRestore()
      vi.unstubAllGlobals()
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: originalIndexedDb,
      })
    }
  })

  it('rejects coordinates outside the geographic range', async () => {
    await expect(createLocalUserPin({ latitude: 91, longitude: -74 })).rejects.toThrow(
      'coordinates or date are invalid',
    )
  })
})
