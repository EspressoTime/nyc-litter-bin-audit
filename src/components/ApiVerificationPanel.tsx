import { useState } from 'react'

import { buildInventoryQueryUrl } from '../data-loader/config'
import { GEOSEARCH_CONFIG } from '../search/geosearch'

type VerificationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Record<string, unknown> }
  | { status: 'error'; message: string }

const geosearchSampleUrl = `${GEOSEARCH_CONFIG.baseUrl}${GEOSEARCH_CONFIG.searchPath}?text=100%20East%20Broadway&size=2`

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json()
}

export default function ApiVerificationPanel() {
  const [state, setState] = useState<VerificationState>({ status: 'idle' })

  async function loadSamples() {
    setState({ status: 'loading' })

    try {
      const [socrata, geosearch] = await Promise.all([
        fetchJson(buildInventoryQueryUrl({ limit: 2 })),
        fetchJson(geosearchSampleUrl),
      ])

      setState({
        status: 'success',
        data: { socrata, geosearch },
      })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  return (
    <section className="verification-card" aria-labelledby="verification-title">
      <div className="verification-heading">
        <div>
          <p className="eyebrow">Development verification</p>
          <h2 id="verification-title">Sample API JSON</h2>
        </div>
        <button
          type="button"
          onClick={loadSamples}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? 'Loading…' : 'Load sample JSON'}
        </button>
      </div>

      <p>
        This development-only panel requests two read-only records from Socrata and NYC
        GeoSearch so the response shape can be inspected in the browser.
      </p>

      {state.status === 'idle' && (
        <p className="verification-message">Click the button to load sample data.</p>
      )}
      {state.status === 'error' && (
        <p className="verification-error" role="alert">
          Could not load sample data: {state.message}
        </p>
      )}
      {state.status === 'success' && (
        <pre className="json-block" aria-label="Sample API JSON">
          {JSON.stringify(state.data, null, 2)}
        </pre>
      )}
    </section>
  )
}
