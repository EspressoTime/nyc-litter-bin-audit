import { deleteDB } from 'idb'

import {
  clearLocalObservations,
  LOCAL_PIN_DB_NAME,
  LOCAL_PIN_FALLBACK_KEY,
  LocalObservationStoreError,
} from './observations-store'

export async function clearLocalUserData(): Promise<void> {
  const errors: unknown[] = []

  try {
    await clearLocalObservations()
  } catch (error) {
    errors.push(error)
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      await deleteDB(LOCAL_PIN_DB_NAME)
    } catch (error) {
      errors.push(error)
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_PIN_FALLBACK_KEY)
    }
  } catch (error) {
    errors.push(error)
  }

  if (errors.length > 0) {
    throw new LocalObservationStoreError(
      'Local observation and added-pin data could not be cleared.',
      errors[0],
    )
  }
}
