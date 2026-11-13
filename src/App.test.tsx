import { render, screen } from '@testing-library/react'

import App from './App'

describe('App scaffold', () => {
  it('renders the project title', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '🗑️ NYC Litter Binventory 🗑️' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'NYC Litter Binventory helps identify and report missing litter baskets around NYC. Collaborative features coming soon :)',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'NYC Open Data DSNY Litter Basket Inventory' }),
    ).toHaveAttribute(
      'href',
      'https://data.cityofnewyork.us/dataset/DSNY-Litter-Basket-Inventory/8znf-7b2c',
    )
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
