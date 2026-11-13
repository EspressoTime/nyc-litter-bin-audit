import { render, screen } from '@testing-library/react'

import App from './App'

describe('App scaffold', () => {
  it('renders the project title', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'NYC Litter Baskets' }),
    ).toBeInTheDocument()
  })

  it('renders the development JSON verification control', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Load sample JSON' })).toBeInTheDocument()
  })

  it('shows an offline shell status when the browser is offline', () => {
    const originalOnLine = window.navigator.onLine
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    try {
      render(<App />)

      expect(screen.getByText(/You’re offline/)).toBeInTheDocument()
    } finally {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value: originalOnLine,
      })
    }
  })
})
