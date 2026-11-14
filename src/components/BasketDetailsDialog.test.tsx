import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { NormalizedBasket } from '../baskets/model'
import { NYC_311_COMPLAINT_FORM_URL } from '../reporting/nyc311'
import BasketDetailsDialog from './BasketDetailsDialog'

const basket: NormalizedBasket = {
  basketId: 'B-100',
  objectId: 'O-100',
  basketType: 'Public Litter Basket',
  direction: 'NE corner',
  streetName1: 'Broadway',
  streetName2: 'W 34th St',
  latitude: 40.7484,
  longitude: -73.9857,
  borough: 'MANHATTAN',
  district: 'MN05',
  point: { type: 'Point', coordinates: [-73.9857, 40.7484] },
}

const originalClipboard = navigator.clipboard

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
})

describe('BasketDetailsDialog', () => {
  it('shows compact official details without exposing the basket ID', () => {
    render(<BasketDetailsDialog basket={basket} onClose={() => undefined} />)

    expect(screen.getByRole('dialog', { name: 'Broadway' })).toBeInTheDocument()
    expect(screen.queryByText('Official basket details')).not.toBeInTheDocument()
    expect(screen.queryByText('Public Litter Basket')).not.toBeInTheDocument()
    expect(screen.queryByText('W 34th St')).not.toBeInTheDocument()
    expect(
      screen.queryByText('This is a local user observation'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('B-100')).not.toBeInTheDocument()
  })

  it('shows the local status and observation action labels', () => {
    render(<BasketDetailsDialog basket={basket} onClose={() => undefined} />)

    expect(screen.getByText(/Current local status: 🗑️/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Exists' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Report Missing' })).toBeDisabled()
  })

  it('closes through the close button callback', () => {
    const onClose = vi.fn()
    render(<BasketDetailsDialog basket={basket} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close basket details' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('traps keyboard focus and restores focus to the opener when unmounted', () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.textContent = 'Open details'
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <BasketDetailsDialog basket={basket} onClose={() => undefined} />,
    )

    expect(screen.getByRole('button', { name: 'Close basket details' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Close basket details' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close basket details' })).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('dismisses on Escape and restores focus to the opener', () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.textContent = 'Open details'
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()

    const { unmount } = render(
      <BasketDetailsDialog basket={basket} onClose={onClose} />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('cycles keyboard focus through every available dialog action', async () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.textContent = 'Open details'
    document.body.appendChild(opener)
    opener.focus()

    const draft = 'Draft complaint text'
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={() => undefined}
        onReportMissing={() => Promise.resolve(draft)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report Missing' }))
    await screen.findByRole('textbox', { name: '311 complaint draft' })

    const closeButton = screen.getByRole('button', { name: 'Close basket details' })
    const confirmButton = screen.getByRole('button', { name: 'Confirm Exists' })
    const reportButton = screen.getByRole('button', { name: 'Report Missing' })
    const copyButton = screen.getByRole('button', { name: 'Copy draft' })
    const handoffLink = screen.getByRole('link', {
      name: 'Open official NYC 311 complaint form',
    })

    handoffLink.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    closeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(handoffLink).toHaveFocus()

    expect(confirmButton).toBeInTheDocument()
    expect(reportButton).toBeInTheDocument()
    expect(copyButton).toBeInTheDocument()

    opener.remove()
  })

  it('dismisses when the backdrop outside the modal is clicked', () => {
    const onClose = vi.fn()
    const onPageClick = vi.fn()
    render(
      <div onClick={onPageClick}>
        <BasketDetailsDialog basket={basket} onClose={onClose} />
      </div>,
    )

    fireEvent.click(screen.getByRole('presentation'))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onPageClick).not.toHaveBeenCalled()
  })

  it('shows the latest local observation date', () => {
    render(
      <BasketDetailsDialog
        basket={basket}
        observations={[
          {
            basketId: 'B-100',
            status: 'exists',
            observedAt: '2026-11-11T17:00:00.000Z',
          },
        ]}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText(/Current local status: 🚮/)).toBeInTheDocument()
    expect(
      screen.getByText('Last local observation: November 11, 2026'),
    ).toBeInTheDocument()
  })

  it('saves an exists observation immediately', async () => {
    const onConfirmExists = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={onClose}
        onConfirmExists={onConfirmExists}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Exists' }))

    await waitFor(() => expect(onConfirmExists).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('shows a recoverable error when an exists observation fails', async () => {
    const onConfirmExists = vi.fn().mockRejectedValue(new Error('storage full'))
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={() => undefined}
        onConfirmExists={onConfirmExists}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Exists' }))

    expect(
      await screen.findByText(
        'The confirmation could not be saved locally. No success was recorded. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('saves a missing observation immediately without a secondary confirmation', async () => {
    const onReportMissing = vi.fn().mockResolvedValue(undefined)
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={() => undefined}
        onReportMissing={onReportMissing}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report Missing' }))

    await waitFor(() => expect(onReportMissing).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('shows an editable 311 draft returned after reporting missing', async () => {
    const draft =
      'On November 12, 2026, I observed a missing public litter basket at Broadway.'
    const onReportMissing = vi.fn().mockResolvedValue(draft)
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={() => undefined}
        onReportMissing={onReportMissing}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report Missing' }))

    expect(
      await screen.findByRole('textbox', { name: '311 complaint draft' }),
    ).toHaveValue(draft)
    expect(
      screen.getByText(/Review and edit this text before submitting it/),
    ).toBeInTheDocument()
    const handoffLink = screen.getByRole('link', {
      name: 'Open official NYC 311 complaint form',
    })
    expect(handoffLink).toHaveAttribute('href', NYC_311_COMPLAINT_FORM_URL)
    expect(handoffLink).toHaveAttribute('target', '_blank')
    expect(handoffLink).toHaveAttribute('rel', 'noopener noreferrer')

    const clickEvent = createEvent.click(handoffLink)
    fireEvent(handoffLink, clickEvent)
    expect(clickEvent.defaultPrevented).toBe(false)
  })

  it('keeps the 311 handoff visible when clipboard access is blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const draft =
      'On November 12, 2026, I observed a missing public litter basket at Broadway.'
    const onReportMissing = vi.fn().mockResolvedValue(draft)
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={() => undefined}
        onReportMissing={onReportMissing}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report Missing' }))
    await screen.findByRole('textbox', { name: '311 complaint draft' })
    fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }))

    expect(
      await screen.findByText(/Clipboard access was unavailable/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open official NYC 311 complaint form' }),
    ).toBeVisible()
    expect(
      screen.getByText(/This app has not submitted a complaint/),
    ).toBeInTheDocument()
  })

  it('copies the visible 311 draft when clipboard access is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const draft =
      'On November 12, 2026, I observed a missing public litter basket at Broadway.'
    const onReportMissing = vi.fn().mockResolvedValue(draft)
    render(
      <BasketDetailsDialog
        basket={basket}
        onClose={() => undefined}
        onReportMissing={onReportMissing}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report Missing' }))
    await screen.findByRole('textbox', { name: '311 complaint draft' })
    fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(draft))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
