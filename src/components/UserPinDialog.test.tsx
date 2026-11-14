import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { LocalUserPin } from '../local-store/user-pins-store'
import UserPinDialog from './UserPinDialog'

const pin: LocalUserPin = {
  local_pin_id: 'P-1',
  latitude: 40.7484,
  longitude: -73.9857,
  last_seen_at: '2026-11-12T15:00:00.000Z',
  created_at: '2026-11-12T15:00:00.000Z',
  updated_at: '2026-11-12T15:00:00.000Z',
  source: 'local',
  kind: 'user_seen_basket',
}

describe('UserPinDialog', () => {
  it('asks for confirmation before creating a local pin', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    render(<UserPinDialog mode="create" onConfirm={onConfirm} onCancel={onCancel} />)

    expect(
      screen.getByText('Did you see a litter basket at this location?'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce())
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('dismisses when the backdrop outside the modal is clicked', () => {
    const onCancel = vi.fn()
    const onPageClick = vi.fn()
    render(
      <div onClick={onPageClick}>
        <UserPinDialog mode="create" onConfirm={() => undefined} onCancel={onCancel} />
      </div>,
    )

    fireEvent.click(screen.getByRole('presentation'))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onPageClick).not.toHaveBeenCalled()
  })

  it('dismisses on Escape and restores focus to the opener', () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.textContent = 'Open local pin'
    document.body.appendChild(opener)
    opener.focus()
    const onCancel = vi.fn()

    const { unmount } = render(
      <UserPinDialog mode="create" onConfirm={() => undefined} onCancel={onCancel} />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('traps focus across local-pin dialog actions', () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.textContent = 'Open local pin'
    document.body.appendChild(opener)
    opener.focus()

    render(
      <UserPinDialog
        mode="manage"
        pin={pin}
        onClose={() => undefined}
        onReconfirm={() => undefined}
        onRemove={() => undefined}
      />,
    )

    const closeButton = screen.getByRole('button', { name: 'Close local basket pin' })
    const reconfirmButton = screen.getByRole('button', {
      name: 'Reconfirm / update date last seen',
    })
    const removeButton = screen.getByRole('button', { name: 'Remove pin' })

    removeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    closeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(removeButton).toHaveFocus()

    expect(reconfirmButton).toBeInTheDocument()
    opener.remove()
  })

  it('shows the previous confirmation date and supports reconfirmation', async () => {
    const onReconfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <UserPinDialog
        mode="manage"
        pin={pin}
        onClose={() => undefined}
        onReconfirm={onReconfirm}
        onRemove={() => undefined}
      />,
    )

    expect(
      screen.getByText(
        /You confirmed seeing a litter basket here on November 12, 2026/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/stored only in this browser profile/)).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconfirm / update date last seen' }),
    )

    await waitFor(() => expect(onReconfirm).toHaveBeenCalledOnce())
  })

  it('requires confirmation before removing a local pin', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    render(
      <UserPinDialog
        mode="manage"
        pin={pin}
        onClose={() => undefined}
        onReconfirm={() => undefined}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove pin' }))
    expect(screen.getByText(/Remove this local 📍 pin/)).toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove pin' })[1]!)

    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce())
  })

  it('keeps a failed create action visible without claiming success', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('storage failed'))
    render(
      <UserPinDialog mode="create" onConfirm={onConfirm} onCancel={() => undefined} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(
      await screen.findByText(/The local pin could not be saved/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Did you see a litter basket at this location?'),
    ).toBeInTheDocument()
  })
})
