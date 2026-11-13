import { copyComplaintDraft } from './clipboard'

describe('copyComplaintDraft', () => {
  const originalClipboard = navigator.clipboard

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
  })

  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(copyComplaintDraft('draft text')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('draft text')
  })

  it('returns false when clipboard permission is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(copyComplaintDraft('draft text')).resolves.toBe(false)
  })

  it('returns false when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })

    await expect(copyComplaintDraft('draft text')).resolves.toBe(false)
  })
})
