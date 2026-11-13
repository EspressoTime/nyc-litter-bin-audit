import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import PlaceSearch from './PlaceSearch'
import type { GeoSearchClient } from './geosearch'

function createClient(): GeoSearchClient {
  return {
    autocomplete: vi.fn().mockResolvedValue([
      {
        id: 'place-1',
        label: '100 EAST B WAY, Staten Island, NY, USA',
        latitude: 40.56945,
        longitude: -74.129953,
      },
      {
        id: 'outside-nyc',
        label: 'Albany, NY, USA',
        latitude: 42.6526,
        longitude: -73.7562,
      },
    ]),
    search: vi.fn().mockResolvedValue([]),
  }
}

describe('PlaceSearch', () => {
  it('debounces autocomplete, filters non-NYC results, and selects a place', async () => {
    const client = createClient()
    const onSelect = vi.fn()
    render(<PlaceSearch client={client} onSelect={onSelect} />)

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '100 East Broadway' },
    })

    await waitFor(() => expect(client.autocomplete).toHaveBeenCalledTimes(1), {
      timeout: 1_000,
    })
    expect(screen.getByRole('option')).toHaveTextContent('100 EAST B WAY')
    expect(screen.queryByText('Albany, NY, USA')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: '100 EAST B WAY, Staten Island, NY, USA',
      }),
    )

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        label: '100 EAST B WAY, Staten Island, NY, USA',
        latitude: 40.56945,
        longitude: -74.129953,
      }),
    )
    expect(screen.getByRole('combobox')).toHaveValue(
      '100 EAST B WAY, Staten Island, NY, USA',
    )
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows a recovery message when forward search returns no NYC results', async () => {
    const client = createClient()
    const formSearch = client.search as ReturnType<typeof vi.fn>
    formSearch.mockResolvedValueOnce([])
    render(<PlaceSearch client={client} onSelect={vi.fn()} />)

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Unknown place' },
    })
    fireEvent.submit(screen.getByRole('search'))

    await waitFor(() => expect(client.search).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('No NYC locations found')
  })
})
