import {
  forwardRef,
  type FormEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { NYC_COORDINATE_BOUNDS } from '../baskets/validation'
import {
  createGeoSearchClient,
  GEOSEARCH_CONFIG,
  type GeoSearchClient,
  type PlaceSearchResult,
} from './geosearch'

const SEARCH_TIMEOUT_MS = 8_000
const AUTOCOMPLETE_RESULT_LIMIT = 10
const BROADER_AUTOCOMPLETE_RESULT_LIMIT = 20
const defaultClient = createGeoSearchClient()

export type PlaceSearchProps = {
  client?: GeoSearchClient
  onSelect: (result: PlaceSearchResult) => void
}

export type PlaceSearchHandle = {
  clearStatus: () => void
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

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function getSearchMatchScore(result: PlaceSearchResult, query: string): number {
  const normalizedLabel = normalizeSearchText(result.label)
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedLabel || !normalizedQuery) {
    return 0
  }

  if (normalizedLabel.startsWith(normalizedQuery)) {
    return 3
  }

  if (normalizedLabel.includes(normalizedQuery)) {
    return 2
  }

  const queryTokens = normalizedQuery.split(' ')
  const labelTokens = normalizedLabel.split(' ')
  if (
    queryTokens.every((queryToken) =>
      labelTokens.some((labelToken) => labelToken.startsWith(queryToken)),
    )
  ) {
    return 1
  }

  return 0
}

function rankSearchResults(
  results: PlaceSearchResult[],
  query: string,
): PlaceSearchResult[] {
  return results
    .map((result, index) => ({
      result,
      index,
      score: getSearchMatchScore(result, query),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const rightConfidence = right.result.confidence ?? 0
      const leftConfidence = left.result.confidence ?? 0
      if (rightConfidence !== leftConfidence) {
        return rightConfidence - leftConfidence
      }

      return left.index - right.index
    })
    .map(({ result }) => result)
}

function getBroaderNumericQuery(query: string): string | null {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ')
  const tokens = normalizedQuery.split(' ')
  const lastToken = tokens.at(-1)

  if (
    tokens.length < 2 ||
    !lastToken ||
    !/^\d+$/.test(lastToken) ||
    lastToken.length > 2
  ) {
    return null
  }

  return tokens.slice(0, -1).join(' ')
}

async function fetchAutocompleteResults(
  client: GeoSearchClient,
  query: string,
  signal: AbortSignal,
): Promise<PlaceSearchResult[]> {
  const normalizedQuery = normalizeSearchText(query)
  let results = await client.autocomplete(normalizedQuery, {
    signal,
    size: AUTOCOMPLETE_RESULT_LIMIT,
  })

  const broaderQuery = getBroaderNumericQuery(normalizedQuery)
  if (results.length === 0 && broaderQuery) {
    results = await client.autocomplete(broaderQuery, {
      signal,
      size: BROADER_AUTOCOMPLETE_RESULT_LIMIT,
    })
  }

  return rankSearchResults(results, normalizedQuery)
}

const PlaceSearch = forwardRef<PlaceSearchHandle, PlaceSearchProps>(
  function PlaceSearch({ client = defaultClient, onSelect }, ref) {
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState<PlaceSearchResult[]>([])
    const [state, setState] = useState<SearchState>('idle')
    const [message, setMessage] = useState('')
    const [activeIndex, setActiveIndex] = useState(-1)
    const requestIdRef = useRef(0)
    const controllerRef = useRef<AbortController | null>(null)
    const skipNextQueryEffectRef = useRef(false)

    useImperativeHandle(
      ref,
      () => ({
        clearStatus() {
          requestIdRef.current += 1
          controllerRef.current?.abort()
          setSuggestions([])
          setActiveIndex(-1)
          setState('idle')
          setMessage('')
        },
      }),
      [],
    )

    useEffect(() => {
      if (skipNextQueryEffectRef.current) {
        skipNextQueryEffectRef.current = false
        controllerRef.current?.abort()
        return
      }

      const text = normalizeSearchText(query)
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

        void fetchAutocompleteResults(client, text, controller.signal)
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
      const text = normalizeSearchText(query)
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
        const results = rankSearchResults(
          (await client.search(text, { signal: controller.signal })).filter(
            isNycResult,
          ),
          text,
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
      setMessage('')
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
  },
)

export default PlaceSearch
