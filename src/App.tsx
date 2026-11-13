import { useCallback, useEffect, useRef, useState } from 'react'

import type { NormalizedBasket, NormalizedInventorySnapshot } from './baskets/model'
import ApiVerificationPanel from './components/ApiVerificationPanel'
import BasketDetailsDialog from './components/BasketDetailsDialog'
import UserPinDialog from './components/UserPinDialog'
import {
  InventoryCacheError,
  loadInventorySnapshot,
} from './local-store/inventory-cache'
import {
  getLocalObservations,
  saveLocalObservation,
} from './local-store/observations-store'
import BasketMap, { type BasketMapHandle } from './map/BasketMap'
import {
  createLocalUserPin,
  deleteLocalUserPin,
  getLocalUserPins,
  reconfirmLocalUserPin,
  type LocalUserPin,
} from './local-store/user-pins-store'
import type { LocationState } from './map/location'
import type { LocalObservation, LocalObservationStatus } from './observations/status'
import { buildComplaintDraft } from './reporting/complaint-draft'
import PlaceSearch from './search/PlaceSearch'
import { checkForMonthlyInventoryUpdate } from './data-loader/monthly-refresh'

type InventoryState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: NormalizedInventorySnapshot }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string }

function getInventoryErrorMessage(error: unknown): string {
  if (error instanceof InventoryCacheError && error.reason === 'empty') {
    return 'No basket data was returned. Retry to check the bundled inventory again.'
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'No locally cached inventory is available while offline. Reconnect and retry to load the bundled inventory.'
  }

  return 'The basket map could not load. Retry to use the bundled inventory.'
}

export default function App() {
  const [inventoryState, setInventoryState] = useState<InventoryState>({
    status: 'loading',
  })
  const [selectedBasket, setSelectedBasket] = useState<NormalizedBasket | null>(null)
  const [observations, setObservations] = useState<LocalObservation[]>([])
  const [observationError, setObservationError] = useState<string | null>(null)
  const [userPins, setUserPins] = useState<LocalUserPin[]>([])
  const [selectedUserPin, setSelectedUserPin] = useState<LocalUserPin | null>(null)
  const [isBasketDialogOpen, setIsBasketDialogOpen] = useState(false)
  const [isUserPinDialogOpen, setIsUserPinDialogOpen] = useState(false)
  const [pendingUserPinCoordinates, setPendingUserPinCoordinates] = useState<
    [number, number] | null
  >(null)
  const [userPinError, setUserPinError] = useState<string | null>(null)
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const mapRef = useRef<BasketMapHandle>(null)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  const loadLocalInventory = useCallback(async (checkForScheduledUpdate: boolean) => {
    setInventoryState({ status: 'loading' })
    setRefreshError(null)

    try {
      const result = await loadInventorySnapshot()
      if (result.snapshot.baskets.length === 0) {
        setInventoryState({
          status: 'empty',
          message: 'The loaded inventory contains no basket locations.',
        })
        return
      }

      setInventoryState({ status: 'ready', snapshot: result.snapshot })

      const shouldCheckForScheduledUpdate =
        checkForScheduledUpdate &&
        (typeof navigator === 'undefined' || navigator.onLine !== false)

      if (shouldCheckForScheduledUpdate) {
        try {
          const refreshResult = await checkForMonthlyInventoryUpdate({
            currentSnapshot: result.snapshot,
          })
          if (refreshResult.outcome === 'updated') {
            setInventoryState({ status: 'ready', snapshot: refreshResult.snapshot })
          }
        } catch {
          setRefreshError(
            'The scheduled inventory update could not be completed. The saved map remains available, and a later eligible check can retry.',
          )
        }
      }
    } catch (error) {
      setInventoryState({
        status: 'error',
        message: getInventoryErrorMessage(error),
      })
    }
  }, [])

  useEffect(() => {
    void loadLocalInventory(true)
  }, [loadLocalInventory])

  useEffect(() => {
    let isMounted = true

    void getLocalObservations()
      .then((savedObservations) => {
        if (isMounted) {
          setObservations(savedObservations)
        }
      })
      .catch(() => {
        if (isMounted) {
          setObservationError(
            'Previously saved local observations could not be loaded. You can continue browsing, but new confirmations may need to be retried.',
          )
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    void getLocalUserPins()
      .then((savedPins) => {
        if (isMounted) {
          setUserPins(savedPins)
        }
      })
      .catch(() => {
        if (isMounted) {
          setUserPinError(
            'Previously saved local pins could not be loaded. You can continue browsing, but new pins may need to be retried.',
          )
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const saveObservation = useCallback(
    async (status: LocalObservationStatus) => {
      if (!selectedBasket) {
        return
      }

      const observedAt = new Date().toISOString()

      try {
        await saveLocalObservation({
          basketId: selectedBasket.basketId,
          status,
          observedAt,
        })
        setObservations((current) => [
          ...current,
          {
            basketId: selectedBasket.basketId,
            status,
            observedAt,
          },
        ])
        setObservationError(null)
        if (status === 'missing') {
          return buildComplaintDraft({ basket: selectedBasket, observedAt })
        }
      } catch (error) {
        setObservationError(
          'The observation could not be saved locally. No success was recorded. Please try again.',
        )
        throw error
      }
    },
    [selectedBasket],
  )

  const handleConfirmExists = useCallback(
    () => saveObservation('exists'),
    [saveObservation],
  )

  const handleReportMissing = useCallback(
    () => saveObservation('missing'),
    [saveObservation],
  )

  const handleLongPress = useCallback((coordinates: [number, number]) => {
    setSelectedBasket(null)
    setIsBasketDialogOpen(false)
    setSelectedUserPin(null)
    setIsUserPinDialogOpen(false)
    setPendingUserPinCoordinates(coordinates)
    setUserPinError(null)
  }, [])

  const handleSelectBasket = useCallback((basket: NormalizedBasket) => {
    setSelectedUserPin(null)
    setIsUserPinDialogOpen(false)
    setPendingUserPinCoordinates(null)
    setSelectedBasket(basket)
    setIsBasketDialogOpen(true)
  }, [])

  const handleSelectUserPin = useCallback((pin: LocalUserPin) => {
    setSelectedBasket(null)
    setIsBasketDialogOpen(false)
    setPendingUserPinCoordinates(null)
    setSelectedUserPin(pin)
    setIsUserPinDialogOpen(true)
  }, [])

  const handleConfirmUserPin = useCallback(async () => {
    if (!pendingUserPinCoordinates) {
      return
    }

    try {
      const pin = await createLocalUserPin({
        longitude: pendingUserPinCoordinates[0],
        latitude: pendingUserPinCoordinates[1],
      })
      setUserPins((current) => [...current, pin])
      setUserPinError(null)
    } catch (error) {
      setUserPinError(
        'The local pin could not be saved. No pin was added. Please try again.',
      )
      throw error
    }
  }, [pendingUserPinCoordinates])

  const handleReconfirmUserPin = useCallback(async () => {
    if (!selectedUserPin) {
      return
    }

    try {
      const updatedPin = await reconfirmLocalUserPin(selectedUserPin)
      setUserPins((current) =>
        current.map((pin) =>
          pin.local_pin_id === updatedPin.local_pin_id ? updatedPin : pin,
        ),
      )
      setSelectedUserPin(updatedPin)
      setUserPinError(null)
    } catch (error) {
      setUserPinError(
        'The last-seen date could not be updated locally. Please try again.',
      )
      throw error
    }
  }, [selectedUserPin])

  const handleRemoveUserPin = useCallback(async () => {
    if (!selectedUserPin) {
      return
    }

    try {
      await deleteLocalUserPin(selectedUserPin)
      setUserPins((current) =>
        current.filter((pin) => pin.local_pin_id !== selectedUserPin.local_pin_id),
      )
      setSelectedUserPin(null)
      setUserPinError(null)
    } catch (error) {
      setUserPinError('The local pin could not be removed. Please try again.')
      throw error
    }
  }, [selectedUserPin])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <main className="app-shell">
      <div className="app-content">
        {!isOnline && (
          <p className="offline-banner" role="status">
            You’re offline. Cached basket locations, local observations, and local pins
            remain available. Inventory updates and address search will resume when you
            reconnect.
          </p>
        )}
        <header className="app-header">
          <div>
            <p className="app-kicker">NYC civic tools</p>
            <h1 id="app-title">NYC Litter Baskets</h1>
            <p className="app-subtitle">Official DSNY locations, on one quiet map.</p>
          </div>
          {inventoryState.status === 'ready' && (
            <p className="app-location-count">
              {inventoryState.snapshot.baskets.length.toLocaleString()} locations
            </p>
          )}
        </header>
        <section className="map-card" aria-labelledby="map-title">
          <h2 id="map-title" className="visually-hidden">
            Official DSNY basket map
          </h2>
          {inventoryState.status === 'ready' && (
            <PlaceSearch
              onSelect={(result) =>
                mapRef.current?.flyToLocation([result.longitude, result.latitude])
              }
            />
          )}
          {inventoryState.status === 'ready' && (
            <div className="map-overlay-actions" aria-label="Map actions">
              <button
                type="button"
                className="map-action-button"
                aria-label={
                  locationState === 'requesting'
                    ? 'Locating your position'
                    : 'Locate me'
                }
                onClick={() => mapRef.current?.requestLocation()}
                disabled={locationState === 'requesting'}
              >
                <span aria-hidden="true">⌖</span>
              </button>
            </div>
          )}
          {inventoryState.status === 'loading' && (
            <div className="map-state map-state-loading">
              <p className="map-message" role="status">
                Loading official basket locations…
              </p>
            </div>
          )}
          {inventoryState.status === 'error' && (
            <div className="map-state map-error-block">
              <p className="map-error" role="alert">
                {inventoryState.message}
              </p>
              <button
                type="button"
                className="retry-button"
                onClick={() => void loadLocalInventory(false)}
              >
                Retry loading inventory
              </button>
            </div>
          )}
          {inventoryState.status === 'empty' && (
            <div className="map-state map-error-block">
              <p className="map-message" role="status">
                {inventoryState.message}
              </p>
              <p className="map-message">
                No pins are shown until a non-empty official inventory is available.
              </p>
              <button
                type="button"
                className="retry-button"
                onClick={() => void loadLocalInventory(false)}
              >
                Retry loading inventory
              </button>
            </div>
          )}
          {inventoryState.status === 'ready' && (
            <>
              <BasketMap
                ref={mapRef}
                baskets={inventoryState.snapshot.baskets}
                observations={observations}
                userPins={userPins}
                onSelect={handleSelectBasket}
                onSelectUserPin={handleSelectUserPin}
                onLongPress={handleLongPress}
                onLocationStateChange={setLocationState}
              />
              {selectedBasket && (
                <p className="map-selection" role="status">
                  Basket selected near {selectedBasket.streetName1 ?? 'this location'}.
                </p>
              )}
            </>
          )}
          {(refreshError || observationError || userPinError) && (
            <div className="map-status-stack">
              {refreshError && (
                <p className="map-error" role="alert">
                  {refreshError}
                </p>
              )}
              {observationError && (
                <p className="map-error" role="alert">
                  {observationError}
                </p>
              )}
              {userPinError && (
                <p className="map-error" role="alert">
                  {userPinError}
                </p>
              )}
            </div>
          )}
        </section>
        {selectedBasket && isBasketDialogOpen && (
          <BasketDetailsDialog
            basket={selectedBasket}
            observations={observations}
            onClose={() => setIsBasketDialogOpen(false)}
            onConfirmExists={handleConfirmExists}
            onReportMissing={handleReportMissing}
          />
        )}
        {pendingUserPinCoordinates && (
          <UserPinDialog
            mode="create"
            onCancel={() => setPendingUserPinCoordinates(null)}
            onConfirm={handleConfirmUserPin}
          />
        )}
        {selectedUserPin && isUserPinDialogOpen && (
          <UserPinDialog
            mode="manage"
            pin={selectedUserPin}
            onClose={() => setIsUserPinDialogOpen(false)}
            onReconfirm={handleReconfirmUserPin}
            onRemove={handleRemoveUserPin}
          />
        )}
        {import.meta.env.DEV && <ApiVerificationPanel />}
      </div>
    </main>
  )
}
