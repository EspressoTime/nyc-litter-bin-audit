import {
  getLocationErrorMessage,
  getLocationErrorState,
  LOCATION_OPTIONS,
} from './location'

describe('location behavior', () => {
  it('uses a one-time, moderate-accuracy location request', () => {
    expect(LOCATION_OPTIONS).toEqual({
      enableHighAccuracy: false,
      maximumAge: 300_000,
      timeout: 10_000,
    })
  })

  it('maps browser geolocation errors to recoverable states', () => {
    expect(getLocationErrorState(1)).toBe('denied')
    expect(getLocationErrorState(2)).toBe('unavailable')
    expect(getLocationErrorState(3)).toBe('timeout')
    expect(getLocationErrorMessage('denied')).toContain('panning')
    expect(getLocationErrorMessage('timeout')).toContain('Try Locate me again')
  })
})
