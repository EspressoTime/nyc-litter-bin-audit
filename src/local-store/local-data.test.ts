import { deleteDB } from 'idb'

import {
  getLocalObservationRecords,
  LOCAL_OBSERVATION_DB_NAME,
  LOCAL_PIN_DB_NAME,
  LOCAL_PIN_FALLBACK_KEY,
  saveLocalObservation,
} from './observations-store'
import { clearLocalUserData } from './local-data'

describe('local user data controls', () => {
  beforeEach(async () => {
    await deleteDB(LOCAL_OBSERVATION_DB_NAME)
    await deleteDB(LOCAL_PIN_DB_NAME)
    localStorage.clear()
  })

  it('clears observations and reserved added-pin storage', async () => {
    await saveLocalObservation({
      basketId: 'B-100',
      status: 'exists',
      observedAt: '2026-11-12T15:00:00.000Z',
    })
    localStorage.setItem(LOCAL_PIN_FALLBACK_KEY, '[{"local_pin_id":"P-1"}]')

    await clearLocalUserData()

    await expect(getLocalObservationRecords()).resolves.toEqual([])
    expect(localStorage.getItem(LOCAL_PIN_FALLBACK_KEY)).toBeNull()
  })
})
