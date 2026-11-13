import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'

import type { NormalizedBasket } from '../baskets/model'
import {
  formatObservationDate,
  getBasketPinPresentation,
  getLatestObservation,
  type LocalObservation,
} from '../observations/status'
import { useDialogFocus } from '../accessibility/useDialogFocus'
import { copyComplaintDraft } from '../reporting/clipboard'
import { NYC_311_COMPLAINT_FORM_URL } from '../reporting/nyc311'

const DATASET_URL =
  'https://data.cityofnewyork.us/dataset/DSNY-Litter-Basket-Inventory/8znf-7b2c'

type BasketDetailsDialogProps = {
  basket: NormalizedBasket
  observations?: LocalObservation[]
  onClose: () => void
  onConfirmExists?: () => void | Promise<void | string>
  onReportMissing?: () => void | Promise<void | string>
}

function displayValue(value: string | null): string {
  return value === null || value === '' ? 'Basket location' : value
}

export default function BasketDetailsDialog({
  basket,
  observations = [],
  onClose,
  onConfirmExists,
  onReportMissing,
}: BasketDetailsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reportDraft, setReportDraft] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const presentation = getBasketPinPresentation(basket.basketId, observations)
  const latestObservation = getLatestObservation(basket.basketId, observations)

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (!isSaving) {
      onClose()
    }
  }

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  const handleCopyDraft = async () => {
    if (!reportDraft) {
      return
    }

    const copied = await copyComplaintDraft(reportDraft)
    setCopyState(copied ? 'copied' : 'failed')
  }

  const handleObservationAction = async (action: 'exists' | 'missing') => {
    const callback = action === 'exists' ? onConfirmExists : onReportMissing
    if (!callback) {
      return
    }

    setIsSaving(true)
    setActionError(null)

    try {
      const result = await callback()
      if (action === 'missing' && typeof result === 'string') {
        setReportDraft(result)
      }
    } catch {
      setActionError(
        action === 'exists'
          ? 'The confirmation could not be saved locally. No success was recorded. Please try again.'
          : 'The missing-basket report could not be saved locally. No success was recorded. Please try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  useDialogFocus(dialogRef, closeButtonRef, () => {
    if (!isSaving) {
      onClose()
    }
  })

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        className="basket-details-dialog"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="basket-details-title"
        aria-describedby="basket-details-description"
      >
        <div className="dialog-heading">
          <h2 id="basket-details-title">{displayValue(basket.streetName1)}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="dialog-close-button"
            onClick={onClose}
            aria-label="Close basket details"
          >
            ×
          </button>
        </div>

        <p id="basket-details-description" className="dialog-status">
          Current local status: {presentation.glyph} {presentation.accessibleLabel}
        </p>
        {latestObservation && (
          <p className="dialog-observation-date">
            Last local observation:{' '}
            {formatObservationDate(latestObservation.observedAt)}
          </p>
        )}

        <div className="dialog-actions" aria-label="Basket observation actions">
          <button
            type="button"
            className="dialog-primary-button"
            onClick={() => void handleObservationAction('exists')}
            disabled={!onConfirmExists || isSaving}
          >
            {isSaving ? 'Saving…' : 'Confirm Exists'}
          </button>
          <button
            type="button"
            className="dialog-secondary-button"
            onClick={() => void handleObservationAction('missing')}
            disabled={!onReportMissing || isSaving}
          >
            {isSaving ? 'Saving…' : 'Report Missing'}
          </button>
        </div>
        {actionError && (
          <p className="dialog-error" role="alert">
            {actionError}
          </p>
        )}
        {reportDraft && (
          <div className="report-preview">
            <h3>311 draft preview</h3>
            <p>
              Review and edit this text before submitting it on NYC 311. This app has
              not submitted a complaint.
            </p>
            <textarea
              aria-label="311 complaint draft"
              value={reportDraft}
              onChange={(event) => {
                setReportDraft(event.target.value)
                setCopyState('idle')
              }}
              rows={8}
            />
            <button
              type="button"
              className="dialog-primary-button"
              onClick={() => void handleCopyDraft()}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy draft'}
            </button>
            {copyState === 'failed' && (
              <p className="dialog-supporting-text" role="status">
                Clipboard access was unavailable. Select the complete draft above and
                copy it manually.
              </p>
            )}
            <a
              className="dialog-primary-button dialog-link"
              href={NYC_311_COMPLAINT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open official NYC 311 complaint form
            </a>
          </div>
        )}

        <p className="dialog-attribution">
          Source:{' '}
          <a href={DATASET_URL} target="_blank" rel="noreferrer">
            NYC Open Data DSNY Litter Basket Inventory
          </a>
        </p>
      </section>
    </div>
  )
}
