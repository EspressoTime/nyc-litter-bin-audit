import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  )
}

export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const initialFocus = initialFocusRef.current ?? getFocusableElements(dialog)[0]

    if (initialFocus) {
      initialFocus.focus()
    } else {
      dialog.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscapeRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (
        event.shiftKey &&
        (activeElement === firstElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault()
        lastElement.focus()
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [dialogRef, initialFocusRef])
}
