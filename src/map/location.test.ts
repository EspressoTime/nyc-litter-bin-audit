import {
  getLocationErrorMessage,
  getLocationErrorState,
  LOCATION_OPTIONS,
  requestCurrentLocation,
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

  it('requests one location and reports the granted coordinates', () => {
    let success: PositionCallback | undefined
    let failure: PositionErrorCallback | undefined
    const geolocation = {
      getCurrentPosition: vi.fn(
        (onSuccess: PositionCallback, onError: PositionErrorCallback) => {
          success = onSuccess
          failure = onError
        },
      ),
    } as unknown as Geolocation
    const coordinates: Array<[number, number]> = []
    const states: string[] = []

    requestCurrentLocation(
      geolocation,
      (value) => coordinates.push(value),
      (state) => states.push(state),
    )

    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      LOCATION_OPTIONS,
    )
    expect(states).toEqual(['requesting'])

    success?.({
      coords: { longitude: -73.99, latitude: 40.75 },
    } as GeolocationPosition)

    expect(coordinates).toEqual([[-73.99, 40.75]])
    expect(states).toEqual(['requesting', 'located'])
    expect(failure).toBeDefined()
  })

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('reports geolocation error code %s as %s', (code, expectedState) => {
    let failure: PositionErrorCallback | undefined
    const geolocation = {
      getCurrentPosition: vi.fn(
        (_: PositionCallback, onError: PositionErrorCallback) => {
          failure = onError
        },
      ),
    } as unknown as Geolocation
    const states: string[] = []

    requestCurrentLocation(
      geolocation,
      () => undefined,
      (state) => states.push(state),
    )
    failure?.({ code } as GeolocationPositionError)

    expect(states).toEqual(['requesting', expectedState])
  })

  it('reports unavailable when geolocation is not provided', () => {
    const states: string[] = []

    requestCurrentLocation(
      undefined,
      () => undefined,
      (state) => states.push(state),
    )

    expect(states).toEqual(['unavailable'])
  })
})
