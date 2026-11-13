import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'

import { formatObservationDate } from '../observations/status'
import type { LocalUserPin } from '../local-store/user-pins-store'
import { useDialogFocus } from '../accessibility/useDialogFocus'

type UserPinDialogProps =
  | {
      mode: 'create'
      onCancel: () => void
      onConfirm: () => void | Promise<void>
    }
  | {
      mode: 'manage'
      pin: LocalUserPin
      onClose: () => void
      onReconfirm: () => void | Promise<void>
      onRemove: () => void | Promise<void>
    }

export default function UserPinDialog(props: UserPinDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const isCreate = props.mode === 'create'
  const onClose = isCreate ? props.onCancel : props.onClose

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!isSaving && event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  useDialogFocus(dialogRef, closeButtonRef, () => {
    if (!isSaving) {
      onClose()
    }
  })

  const handleCreate = async () => {
    if (!isCreate) {
      return
    }

    setIsSaving(true)
    setActionError(null)
    try {
      await props.onConfirm()
      props.onCancel()
    } catch {
      setActionError(
        'The local pin could not be saved. No pin was added. Please try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleReconfirm = async () => {
    if (isCreate) {
      return
    }

    setIsSaving(true)
    setActionError(null)
    try {
      await props.onReconfirm()
    } catch {
      setActionError(
        'The last-seen date could not be updated locally. Please try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (isCreate) {
      return
    }

    setIsSaving(true)
    setActionError(null)
    try {
      await props.onRemove()
      props.onClose()
    } catch {
      setActionError('The local pin could not be removed. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        className="basket-details-dialog user-pin-dialog"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="user-pin-dialog-title"
        aria-describedby="user-pin-dialog-description"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Local observation</p>
            <h2 id="user-pin-dialog-title">
              {isCreate ? 'Add basket pin' : 'Local basket pin'}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="dialog-close-button"
            onClick={onClose}
            disabled={isSaving}
            aria-label={
              isCreate ? 'Cancel adding basket pin' : 'Close local basket pin'
            }
          >
            ×
          </button>
        </div>

        {isCreate ? (
          <>
            <p id="user-pin-dialog-description" className="dialog-status">
              Did you see a litter basket at this location?
            </p>
            <p className="dialog-note">
              Confirming adds a local 📍 pin with today’s date. It does not change the
              official DSNY inventory.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-primary-button"
                onClick={() => void handleCreate()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="dialog-cancel-button"
                onClick={props.onCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="user-pin-dialog-description" className="dialog-status">
              📍 You confirmed seeing a litter basket here on{' '}
              {formatObservationDate(props.pin.last_seen_at)}.
            </p>
            <p className="dialog-note">
              This pin is stored only in this browser profile and is not an official
              DSNY inventory record.
            </p>
            <div className="dialog-actions" aria-label="Local pin actions">
              <button
                type="button"
                className="dialog-primary-button"
                onClick={() => void handleReconfirm()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Reconfirm / update date last seen'}
              </button>
              <button
                type="button"
                className="dialog-secondary-button"
                onClick={() => {
                  setActionError(null)
                  setIsConfirmingRemoval(true)
                }}
                disabled={isSaving}
              >
                Remove pin
              </button>
            </div>
            {isConfirmingRemoval && (
              <div className="dialog-confirmation" aria-live="polite">
                <p>Remove this local 📍 pin from this browser profile?</p>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="dialog-secondary-button"
                    onClick={() => void handleRemove()}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Removing…' : 'Remove pin'}
                  </button>
                  <button
                    type="button"
                    className="dialog-cancel-button"
                    onClick={() => setIsConfirmingRemoval(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {actionError && (
          <p className="dialog-error" role="alert">
            {actionError}
          </p>
        )}
      </section>
    </div>
  )
}
