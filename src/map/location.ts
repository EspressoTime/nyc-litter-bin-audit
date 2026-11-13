export const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 5 * 60 * 1000,
  timeout: 10_000,
}

export type LocationState =
  'idle' | 'requesting' | 'located' | 'denied' | 'unavailable' | 'timeout'

export function getLocationErrorState(
  code: number,
): Exclude<LocationState, 'idle' | 'requesting' | 'located'> {
  if (code === 1) {
    return 'denied'
  }

  if (code === 3) {
    return 'timeout'
  }

  return 'unavailable'
}

export function getLocationErrorMessage(
  state: Exclude<LocationState, 'idle' | 'requesting' | 'located'>,
): string {
  if (state === 'denied') {
    return 'Location access was denied. You can continue by panning and zooming the map.'
  }

  if (state === 'timeout') {
    return 'The location request timed out. Try Locate me again or continue browsing the map.'
  }

  return 'Your location could not be determined. Try Locate me again or continue browsing the map.'
}
