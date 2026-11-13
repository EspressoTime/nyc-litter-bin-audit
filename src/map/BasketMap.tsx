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
const PIN_CIRCLE_FILL = '#3C7203'
const PIN_CIRCLE_STROKE = '#000000'
const PIN_EMOJI_FONT_FAMILY =
  'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji, sans-serif'
const PIN_ICON_SIZE = 0.6
const SELECTED_PIN_ICON_SIZE = 0.75
const PIN_FALLBACK_CIRCLE_RADIUS = 10
const PIN_FALLBACK_TEXT_SIZE = 16
const pinSvg = (glyph: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="${PIN_CIRCLE_FILL}" stroke="${PIN_CIRCLE_STROKE}" stroke-width="3"/><text x="32" y="47" text-anchor="middle" font-family="${PIN_EMOJI_FONT_FAMILY}" font-size="40">${glyph}</text></svg>`
const PIN_IMAGE_URLS = {
  unconfirmed: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg('🗑️'))}`,
  confirmed: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg('🚮'))}`,
  missing: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg('🚨'))}`,
} as const
const USER_PIN_IMAGE_ID = 'local-user-pin'
const USER_PIN_IMAGE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg('📍'))}`

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

function loadBasketPinImages(map: maplibregl.Map): Promise<void[]> {
  return Promise.all(
    (Object.keys(PIN_IMAGE_IDS) as Array<keyof typeof PIN_IMAGE_IDS>).map((status) => {
      const imageId = PIN_IMAGE_IDS[status]
      if (map.hasImage(imageId)) {
        return Promise.resolve()
      }

      return map.loadImage(PIN_IMAGE_URLS[status]).then((image) => {
        if (!map.hasImage(imageId)) {
          map.addImage(imageId, image.data, { pixelRatio: 2 })
        }
      })
    }),
  )
}

function loadUserPinImage(map: maplibregl.Map): Promise<void> {
  if (map.hasImage(USER_PIN_IMAGE_ID)) {
    return Promise.resolve()
  }

  return map.loadImage(USER_PIN_IMAGE_URL).then((image) => {
    if (!map.hasImage(USER_PIN_IMAGE_ID)) {
      map.addImage(USER_PIN_IMAGE_ID, image.data, { pixelRatio: 2 })
    }
  })
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
    onLocationStateChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  const onSelectUserPinRef = useRef(onSelectUserPin)
  const onLongPressRef = useRef(onLongPress)
  const onLocationStateChangeRef = useRef(onLocationStateChange)
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
    if (!navigator.geolocation) {
      onLocationStateChangeRef.current?.('unavailable')
      return
    }

    onLocationStateChangeRef.current?.('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude])
        onLocationStateChangeRef.current?.('located')
      },
      (error) => {
        onLocationStateChangeRef.current?.(getLocationErrorState(error.code))
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
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

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
                'icon-size': [
                  'case',
                  ['boolean', ['feature-state', 'selected'], false],
                  SELECTED_PIN_ICON_SIZE,
                  PIN_ICON_SIZE,
                ],
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
            id: `${BASKET_LAYER_ID}-fallback-background`,
            type: 'circle',
            source: BASKET_SOURCE_ID,
            paint: {
              'circle-radius': PIN_FALLBACK_CIRCLE_RADIUS,
              'circle-color': PIN_CIRCLE_FILL,
              'circle-stroke-color': PIN_CIRCLE_STROKE,
              'circle-stroke-width': 2,
            },
          })
          map.addLayer({
            id: BASKET_LAYER_ID,
            type: 'symbol',
            source: BASKET_SOURCE_ID,
            layout: {
              'text-field': ['get', 'glyph'],
              'text-size': PIN_FALLBACK_TEXT_SIZE,
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
              'icon-size': PIN_ICON_SIZE,
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
              id: `${USER_PIN_LAYER_ID}-fallback-background`,
              type: 'circle',
              source: USER_PIN_SOURCE_ID,
              paint: {
                'circle-radius': PIN_FALLBACK_CIRCLE_RADIUS,
                'circle-color': PIN_CIRCLE_FILL,
                'circle-stroke-color': PIN_CIRCLE_STROKE,
                'circle-stroke-width': 2,
              },
            })
            map.addLayer({
              id: USER_PIN_LAYER_ID,
              type: 'symbol',
              source: USER_PIN_SOURCE_ID,
              layout: {
                'text-field': ['get', 'glyph'],
                'text-size': PIN_FALLBACK_TEXT_SIZE,
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
