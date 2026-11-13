import { type FormEvent, useEffect, useRef, useState } from 'react'

import { NYC_COORDINATE_BOUNDS } from '../baskets/validation'
import {
  createGeoSearchClient,
  GEOSEARCH_CONFIG,
  type GeoSearchClient,
  type PlaceSearchResult,
} from './geosearch'

const SEARCH_TIMEOUT_MS = 8_000
const defaultClient = createGeoSearchClient()

export type PlaceSearchProps = {
  client?: GeoSearchClient
  onSelect: (result: PlaceSearchResult) => void
}

type SearchState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

function isNycResult(result: PlaceSearchResult): boolean {
  return (
    result.latitude >= NYC_COORDINATE_BOUNDS.minLatitude &&
    result.latitude <= NYC_COORDINATE_BOUNDS.maxLatitude &&
    result.longitude >= NYC_COORDINATE_BOUNDS.minLongitude &&
    result.longitude <= NYC_COORDINATE_BOUNDS.maxLongitude
  )
}

function getSearchErrorMessage(error: unknown, timedOut: boolean): string {
  if (timedOut) {
    return 'Search timed out. Try a street address, intersection, or place name again.'
  }

  if (error instanceof Error && error.message) {
    return 'Search is temporarily unavailable. Try again in a moment.'
  }

  return 'Search could not be completed. Try a street address, intersection, or place name.'
}

export default function PlaceSearch({
  client = defaultClient,
  onSelect,
}: PlaceSearchProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSearchResult[]>([])
  const [state, setState] = useState<SearchState>('idle')
  const [message, setMessage] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const skipNextQueryEffectRef = useRef(false)

  useEffect(() => {
    if (skipNextQueryEffectRef.current) {
      skipNextQueryEffectRef.current = false
      controllerRef.current?.abort()
      return
    }

    const text = query.trim()
    const requestId = ++requestIdRef.current
    const controller = new AbortController()
    let timeoutId: number | undefined
    let timedOut = false

    controllerRef.current?.abort()
    controllerRef.current = controller

    if (!text) {
      setSuggestions([])
      setActiveIndex(-1)
      setState('idle')
      setMessage('')
      return () => controller.abort()
    }

    setState('loading')
    setMessage('')
    const debounceId = window.setTimeout(() => {
      timeoutId = window.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, SEARCH_TIMEOUT_MS)

      void client
        .autocomplete(text, { signal: controller.signal })
        .then((results) => {
          if (requestId !== requestIdRef.current) {
            return
          }

          const nycResults = results.filter(isNycResult)
          setSuggestions(nycResults)
          setActiveIndex(-1)
          setState(nycResults.length > 0 ? 'ready' : 'empty')
          setMessage(
            nycResults.length > 0
              ? ''
              : 'No NYC locations found. Try a street address, intersection, or place name.',
          )
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted && !timedOut) {
            return
          }
          if (requestId !== requestIdRef.current) {
            return
          }

          setSuggestions([])
          setState('error')
          setMessage(getSearchErrorMessage(error, timedOut))
        })
        .finally(() => {
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId)
          }
        })
    }, GEOSEARCH_CONFIG.debounceMs)

    return () => {
      window.clearTimeout(debounceId)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
      controller.abort()
    }
  }, [client, query])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = query.trim()
    if (!text) {
      return
    }

    if (activeIndex >= 0 && suggestions[activeIndex]) {
      handleSelect(suggestions[activeIndex])
      return
    }

    const requestId = ++requestIdRef.current
    const controller = new AbortController()
    let timedOut = false
    controllerRef.current?.abort()
    controllerRef.current = controller
    setSuggestions([])
    setActiveIndex(-1)
    setState('loading')
    setMessage('')
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, SEARCH_TIMEOUT_MS)

    try {
      const results = (await client.search(text, { signal: controller.signal })).filter(
        isNycResult,
      )
      if (requestId !== requestIdRef.current) {
        return
      }

      setSuggestions(results)
      setState(results.length > 0 ? 'ready' : 'empty')
      setMessage(
        results.length > 0
          ? 'Select a result to center the map.'
          : 'No NYC locations found. Try a street address, intersection, or place name.',
      )
    } catch (error: unknown) {
      if (controller.signal.aborted && !timedOut) {
        return
      }
      if (requestId !== requestIdRef.current) {
        return
      }

      setState('error')
      setMessage(getSearchErrorMessage(error, timedOut))
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  function handleSelect(result: PlaceSearchResult) {
    if (result.label !== query) {
      skipNextQueryEffectRef.current = true
    }
    setQuery(result.label)
    setSuggestions([])
    setActiveIndex(-1)
    setState('ready')
    setMessage(`Map centered on ${result.label}.`)
    onSelect(result)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
    } else if (event.key === 'Escape') {
      setSuggestions([])
      setActiveIndex(-1)
    }
  }

  return (
    <section className="search-card map-search" aria-labelledby="place-search-title">
      <h2 id="place-search-title" className="visually-hidden">
        Search NYC address or place
      </h2>
      <form className="search-form" onSubmit={handleSubmit} role="search">
        <label htmlFor="place-search-input" className="visually-hidden">
          NYC address or place
        </label>
        <div className="search-row">
          <input
            id="place-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Try an address or place name"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="place-search-suggestions"
            aria-expanded={suggestions.length > 0}
            aria-activedescendant={
              activeIndex >= 0 ? `place-result-${activeIndex}` : undefined
            }
          />
          <button
            type="submit"
            className="search-button"
            disabled={state === 'loading'}
          >
            {state === 'loading' ? 'Searching…' : 'Search'}
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul
            id="place-search-suggestions"
            className="search-suggestions"
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.id ?? suggestion.label}-${index}`} role="option">
                <button
                  id={`place-result-${index}`}
                  type="button"
                  className={
                    index === activeIndex
                      ? 'search-suggestion active'
                      : 'search-suggestion'
                  }
                  onClick={() => handleSelect(suggestion)}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      {message && (
        <p
          className={state === 'error' ? 'search-error' : 'search-message'}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
    </section>
  )
}
