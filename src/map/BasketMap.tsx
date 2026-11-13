import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import maplibregl, { type MapMouseEvent } from 'maplibre-gl'

import type { NormalizedBasket } from '../baskets/model'
import {
  formatObservationDate,
  getBasketPinPresentation,
  type LocalObservation,
} from '../observations/status'
import type { LocalUserPin } from '../local-store/user-pins-store'
import { MAP_CONFIG } from './config'
import { getLocationErrorState, LOCATION_OPTIONS, type LocationState } from './location'
import 'maplibre-gl/dist/maplibre-gl.css'

const BASKET_SOURCE_ID = 'official-baskets'
const BASKET_LAYER_ID = 'official-basket-pins'
const USER_PIN_SOURCE_ID = 'local-user-pins'
const USER_PIN_LAYER_ID = 'local-user-pin-markers'
export const LONG_PRESS_DURATION_MS = 500
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8
const PIN_IMAGE_IDS = {
  unconfirmed: 'basket-pin-unconfirmed',
  confirmed: 'basket-pin-confirmed',
  missing: 'basket-pin-missing',
} as const
const PIN_EMOJI_FONT_FAMILY =
  '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
const PIN_ICON_SIZE_STOPS = [
  [8, 0.2],
  [11, 0.45],
  [14, 0.9],
  [17, 1.4],
] as const
const PIN_FALLBACK_TEXT_SIZE_STOPS = [
  [8, 8],
  [11, 14],
  [14, 28],
  [17, 42],
] as const
const PIN_GLYPHS = {
  unconfirmed: '🗑️',
  confirmed: '🚮',
  missing: '🚨',
} as const
const USER_PIN_IMAGE_ID = 'local-user-pin'
const USER_PIN_GLYPH = '📍'

function interpolateZoomValue(
  zoom: number,
  stops: readonly (readonly [number, number])[],
): number {
  const firstStop = stops[0]
  const lastStop = stops[stops.length - 1]
  if (!firstStop || !lastStop) {
    return 0
  }

  if (zoom <= firstStop[0]) {
    return firstStop[1]
  }
  if (zoom >= lastStop[0]) {
    return lastStop[1]
  }

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1]
    const current = stops[index]
    if (!previous || !current || zoom > current[0]) {
      continue
    }

    const progress = (zoom - previous[0]) / (current[0] - previous[0])
    return previous[1] + progress * (current[1] - previous[1])
  }

  return lastStop[1]
}

export function getPinIconSizeForZoom(zoom: number): number {
  return interpolateZoomValue(zoom, PIN_ICON_SIZE_STOPS)
}

export function getPinFallbackTextSizeForZoom(zoom: number): number {
  return interpolateZoomValue(zoom, PIN_FALLBACK_TEXT_SIZE_STOPS)
}

export type BasketFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    properties: {
      basketId: string
      pinImageId: string
      glyph: string
      accessibleLabel: string
    }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }>
}

export type UserPinFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    properties: {
      localPinId: string
      pinImageId: string
      glyph: string
      accessibleLabel: string
    }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }>
}

export type BasketMapProps = {
  baskets: NormalizedBasket[]
  observations?: LocalObservation[]
  userPins?: LocalUserPin[]
  onSelect?: (basket: NormalizedBasket) => void
  onSelectUserPin?: (pin: LocalUserPin) => void
  onLongPress?: (coordinates: [number, number]) => void
  onLocate?: () => void
  onLocationStateChange?: (state: LocationState) => void
}

export type BasketMapHandle = {
  requestLocation: () => void
  flyToLocation: (coordinates: [number, number]) => void
}

export function toBasketFeatureCollection(
  baskets: NormalizedBasket[],
  observations: LocalObservation[] = [],
  now: Date = new Date(),
): BasketFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: baskets.map((basket) => {
      const presentation = getBasketPinPresentation(basket.basketId, observations, now)
      return {
        type: 'Feature',
        id: basket.basketId,
        properties: {
          basketId: basket.basketId,
          pinImageId: PIN_IMAGE_IDS[presentation.status],
          glyph: presentation.glyph,
          accessibleLabel: presentation.accessibleLabel,
        },
        geometry: basket.point,
      }
    }),
  }
}

export function toUserPinFeatureCollection(
  userPins: LocalUserPin[],
): UserPinFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: userPins.map((pin) => ({
      type: 'Feature',
      id: pin.local_pin_id,
      properties: {
        localPinId: pin.local_pin_id,
        pinImageId: USER_PIN_IMAGE_ID,
        glyph: '📍',
        accessibleLabel: `Litter basket seen on ${formatObservationDate(pin.last_seen_at)}`,
      },
      geometry: {
        type: 'Point',
        coordinates: [pin.longitude, pin.latitude],
      },
    })),
  }
}

async function createPinImage(glyph: string): Promise<ImageData> {
  if (typeof document === 'undefined') {
    throw new Error('Pin images require a browser document.')
  }

  if (typeof document.fonts?.load === 'function') {
    try {
      await document.fonts.load(`40px ${PIN_EMOJI_FONT_FAMILY}`)
    } catch {
      // Canvas will still render using the next available emoji fallback.
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Pin images require canvas support.')
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  context.font = `40px ${PIN_EMOJI_FONT_FAMILY}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(glyph, 32, 32)

  return context.getImageData(0, 0, canvas.width, canvas.height)
}

async function loadBasketPinImages(map: maplibregl.Map): Promise<void[]> {
  return Promise.all(
    (Object.keys(PIN_IMAGE_IDS) as Array<keyof typeof PIN_IMAGE_IDS>).map((status) => {
      const imageId = PIN_IMAGE_IDS[status]
      if (map.hasImage(imageId)) {
        return Promise.resolve()
      }

      return createPinImage(PIN_GLYPHS[status]).then((imageData) => {
        if (!map.hasImage(imageId)) {
          map.addImage(imageId, imageData, { pixelRatio: 2 })
        }
      })
    }),
  )
}

async function loadUserPinImage(map: maplibregl.Map): Promise<void> {
  if (map.hasImage(USER_PIN_IMAGE_ID)) {
    return Promise.resolve()
  }

  const imageData = await createPinImage(USER_PIN_GLYPH)
  if (!map.hasImage(USER_PIN_IMAGE_ID)) {
    map.addImage(USER_PIN_IMAGE_ID, imageData, { pixelRatio: 2 })
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function moveMapToLocation(
  map: maplibregl.Map,
  coordinates: [number, number],
  zoom: number,
): void {
  if (prefersReducedMotion()) {
    map.jumpTo({ center: coordinates, zoom })
    return
  }

  map.flyTo({ center: coordinates, zoom, essential: true })
}

const BasketMap = forwardRef<BasketMapHandle, BasketMapProps>(function BasketMap(
  {
    baskets,
    observations = [],
    userPins = [],
    onSelect,
    onSelectUserPin,
    onLongPress,
    onLocate,
    onLocationStateChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  const onSelectUserPinRef = useRef(onSelectUserPin)
  const onLongPressRef = useRef(onLongPress)
  const onLocateRef = useRef(onLocate)
  const onLocationStateChangeRef = useRef(onLocationStateChange)
  const locateButtonRef = useRef<HTMLButtonElement | null>(null)
  const basketsRef = useRef(baskets)
  const observationsRef = useRef(observations)
  const userPinsRef = useRef(userPins)
  const selectedFeatureIdRef = useRef<string | number | undefined>(undefined)
  const userLocationRef = useRef<[number, number] | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    coordinates: [number, number]
    triggered: boolean
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    onSelectUserPinRef.current = onSelectUserPin
  }, [onSelectUserPin])

  useEffect(() => {
    onLongPressRef.current = onLongPress
  }, [onLongPress])

  useEffect(() => {
    onLocateRef.current = onLocate
  }, [onLocate])

  useEffect(() => {
    onLocationStateChangeRef.current = onLocationStateChange
  }, [onLocationStateChange])

  const setUserLocation = (coordinates: [number, number]) => {
    userLocationRef.current = coordinates
    const map = mapRef.current
    const source = map?.getSource('current-user-location')
    if (source?.type === 'geojson') {
      ;(source as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates },
          },
        ],
      })
    }

    if (map) {
      moveMapToLocation(map, coordinates, Math.max(map.getZoom(), 14))
    }
  }

  const requestLocation = () => {
    onLocateRef.current?.()

    const updateLocationState = (state: LocationState) => {
      const locateButton = locateButtonRef.current
      if (locateButton) {
        locateButton.disabled = state === 'requesting'
        locateButton.setAttribute(
          'aria-label',
          state === 'requesting' ? 'Locating your position' : 'Locate me',
        )
      }
      onLocationStateChangeRef.current?.(state)
    }

    if (!navigator.geolocation) {
      updateLocationState('unavailable')
      return
    }

    updateLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude])
        updateLocationState('located')
      },
      (error) => {
        updateLocationState(getLocationErrorState(error.code))
      },
      LOCATION_OPTIONS,
    )
  }

  const flyToLocation = (coordinates: [number, number]) => {
    const map = mapRef.current
    if (map) {
      moveMapToLocation(map, coordinates, Math.max(map.getZoom(), 15))
    }
  }

  useImperativeHandle(ref, () => ({ requestLocation, flyToLocation }), [])

  useEffect(() => {
    basketsRef.current = baskets
    observationsRef.current = observations
    userPinsRef.current = userPins
    const source = mapRef.current?.getSource(BASKET_SOURCE_ID)
    if (source?.type === 'geojson') {
      ;(source as maplibregl.GeoJSONSource).setData(
        toBasketFeatureCollection(baskets, observations),
      )
    }
    const userPinSource = mapRef.current?.getSource(USER_PIN_SOURCE_ID)
    if (userPinSource?.type === 'geojson') {
      ;(userPinSource as maplibregl.GeoJSONSource).setData(
        toUserPinFeatureCollection(userPins),
      )
    }
  }, [baskets, observations, userPins])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_CONFIG.styleUrl,
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
    })
    mapRef.current = map

    let pinSizeFrame: number | null = null
    const updatePinSizes = () => {
      if (pinSizeFrame !== null) {
        return
      }

      pinSizeFrame = window.requestAnimationFrame(() => {
        pinSizeFrame = null
        const iconSize = getPinIconSizeForZoom(map.getZoom())
        const fallbackTextSize = getPinFallbackTextSizeForZoom(map.getZoom())

        for (const layerId of [BASKET_LAYER_ID, USER_PIN_LAYER_ID]) {
          if (!map.getLayer(layerId)) {
            continue
          }

          if (map.getLayoutProperty(layerId, 'icon-image') !== undefined) {
            map.setLayoutProperty(layerId, 'icon-size', iconSize)
          }
          if (map.getLayoutProperty(layerId, 'text-field') !== undefined) {
            map.setLayoutProperty(layerId, 'text-size', fallbackTextSize)
          }
        }
      })
    }

    map.on('zoom', updatePinSizes)
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const locateButton = document.createElement('button')
    locateButton.type = 'button'
    locateButton.className = 'maplibregl-ctrl-locate'
    locateButton.setAttribute('aria-label', 'Locate me')
    locateButton.title = 'Locate me'
    const locateIcon = document.createElement('span')
    locateIcon.setAttribute('aria-hidden', 'true')
    locateIcon.textContent = '𖦏'
    locateButton.append(locateIcon)
    locateButton.addEventListener('click', requestLocation)

    const navigationGroup = map
      .getContainer()
      .querySelector<HTMLElement>('.maplibregl-ctrl-top-right .maplibregl-ctrl-group')
    navigationGroup?.append(locateButton)
    locateButtonRef.current = locateButton

    const handlePinClick = (
      event: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const feature = event.features?.[0]
      if (!feature) {
        return
      }
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false
        return
      }
      const basketId = feature?.properties?.basketId
      if (typeof basketId !== 'string') {
        return
      }

      if (selectedFeatureIdRef.current !== undefined) {
        map.removeFeatureState(
          { source: BASKET_SOURCE_ID, id: selectedFeatureIdRef.current },
          'selected',
        )
      }

      if (feature.id !== undefined) {
        map.setFeatureState(
          { source: BASKET_SOURCE_ID, id: feature.id },
          { selected: true },
        )
        selectedFeatureIdRef.current = feature.id
      }

      const basket = basketsRef.current.find((item) => item.basketId === basketId)
      if (basket) {
        onSelectRef.current?.(basket)
      }
    }

    const handleUserPinClick = (
      event: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const feature = event.features?.[0]
      if (!feature || suppressNextClickRef.current) {
        suppressNextClickRef.current = false
        return
      }

      const localPinId = feature.properties?.localPinId
      if (typeof localPinId !== 'string') {
        return
      }

      const pin = userPinsRef.current.find((item) => item.local_pin_id === localPinId)
      if (pin) {
        onSelectUserPinRef.current?.(pin)
      }
    }

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
    }

    const clearLongPress = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
        return
      }

      if (longPressStateRef.current) {
        clearLongPress()
        longPressStateRef.current = null
        return
      }

      clearLongPress()
      const rect = map.getCanvas().getBoundingClientRect()
      const point = [event.clientX - rect.left, event.clientY - rect.top] as [
        number,
        number,
      ]
      const center = map.unproject(point)
      longPressStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        coordinates: [center.lng, center.lat],
        triggered: false,
      }
      longPressTimerRef.current = window.setTimeout(() => {
        const state = longPressStateRef.current
        if (!state || state.pointerId !== event.pointerId) {
          return
        }

        state.triggered = true
        longPressTimerRef.current = null
        onLongPressRef.current?.(state.coordinates)
      }, LONG_PRESS_DURATION_MS)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const state = longPressStateRef.current
      if (!state || state.pointerId !== event.pointerId || state.triggered) {
        return
      }

      const distance = Math.hypot(
        event.clientX - state.startX,
        event.clientY - state.startY,
      )
      if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
        clearLongPress()
        longPressStateRef.current = null
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      const state = longPressStateRef.current
      if (!state || state.pointerId !== event.pointerId) {
        return
      }

      clearLongPress()
      if (state.triggered) {
        suppressNextClickRef.current = true
        window.setTimeout(() => {
          suppressNextClickRef.current = false
        }, 300)
      }
      longPressStateRef.current = null
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (longPressStateRef.current?.pointerId === event.pointerId) {
        clearLongPress()
        longPressStateRef.current = null
      }
    }

    const canvas = map.getCanvas()
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerCancel)

    const handleLoad = () => {
      map.addSource(BASKET_SOURCE_ID, {
        type: 'geojson',
        data: toBasketFeatureCollection(basketsRef.current, observationsRef.current),
        generateId: false,
      })
      map.addSource(USER_PIN_SOURCE_ID, {
        type: 'geojson',
        data: toUserPinFeatureCollection(userPinsRef.current),
        generateId: false,
      })
      map.addSource('current-user-location', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })
      map.addLayer({
        id: 'current-user-location-dot',
        type: 'circle',
        source: 'current-user-location',
        paint: {
          'circle-radius': 7,
          'circle-color': '#2563eb',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })

      if (userLocationRef.current) {
        setUserLocation(userLocationRef.current)
      }

      void loadBasketPinImages(map)
        .then(() => {
          if (map.getSource(BASKET_SOURCE_ID) && !map.getLayer(BASKET_LAYER_ID)) {
            map.addLayer({
              id: BASKET_LAYER_ID,
              type: 'symbol',
              source: BASKET_SOURCE_ID,
              layout: {
                'icon-image': ['get', 'pinImageId'],
                'icon-size': getPinIconSizeForZoom(map.getZoom()),
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              },
            })

            map.on('click', BASKET_LAYER_ID, handlePinClick)
            map.on('mouseenter', BASKET_LAYER_ID, handleMouseEnter)
            map.on('mouseleave', BASKET_LAYER_ID, handleMouseLeave)
          }
        })
        .catch(() => {
          map.addLayer({
            id: BASKET_LAYER_ID,
            type: 'symbol',
            source: BASKET_SOURCE_ID,
            layout: {
              'text-field': ['get', 'glyph'],
              'text-size': getPinFallbackTextSizeForZoom(map.getZoom()),
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
          })
          map.on('click', BASKET_LAYER_ID, handlePinClick)
          map.on('mouseenter', BASKET_LAYER_ID, handleMouseEnter)
          map.on('mouseleave', BASKET_LAYER_ID, handleMouseLeave)
        })

      const addUserPinLayer = () => {
        if (map.getSource(USER_PIN_SOURCE_ID) && !map.getLayer(USER_PIN_LAYER_ID)) {
          map.addLayer({
            id: USER_PIN_LAYER_ID,
            type: 'symbol',
            source: USER_PIN_SOURCE_ID,
            layout: {
              'icon-image': ['get', 'pinImageId'],
              'icon-size': getPinIconSizeForZoom(map.getZoom()),
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          })

          map.on('click', USER_PIN_LAYER_ID, handleUserPinClick)
          map.on('mouseenter', USER_PIN_LAYER_ID, handleMouseEnter)
          map.on('mouseleave', USER_PIN_LAYER_ID, handleMouseLeave)
        }
      }

      void loadUserPinImage(map)
        .then(addUserPinLayer)
        .catch(() => {
          if (map.getSource(USER_PIN_SOURCE_ID) && !map.getLayer(USER_PIN_LAYER_ID)) {
            map.addLayer({
              id: USER_PIN_LAYER_ID,
              type: 'symbol',
              source: USER_PIN_SOURCE_ID,
              layout: {
                'text-field': ['get', 'glyph'],
                'text-size': getPinFallbackTextSizeForZoom(map.getZoom()),
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
            })
            map.on('click', USER_PIN_LAYER_ID, handleUserPinClick)
            map.on('mouseenter', USER_PIN_LAYER_ID, handleMouseEnter)
            map.on('mouseleave', USER_PIN_LAYER_ID, handleMouseLeave)
          }
        })
    }

    map.once('load', handleLoad)

    return () => {
      clearLongPress()
      longPressStateRef.current = null
      const canvas = map.getCanvas()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      map.off('zoom', updatePinSizes)
      if (pinSizeFrame !== null) {
        window.cancelAnimationFrame(pinSizeFrame)
      }
      locateButton.removeEventListener('click', requestLocation)
      locateButton.remove()
      locateButtonRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        className="basket-map"
        aria-label="Official NYC litter basket map"
        aria-describedby="basket-map-description"
      />
      <p id="basket-map-description" className="visually-hidden">
        Each basket pin is one emoji: 🗑️ means unconfirmed, 🚮 means confirmed by this
        user within 30 days, and 🚨 means reported missing by this user. A 📍 pin is a
        local user-added basket observation; hold on the map to add one.
      </p>
    </>
  )
})

export default BasketMap
