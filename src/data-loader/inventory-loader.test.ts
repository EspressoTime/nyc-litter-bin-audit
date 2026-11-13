import { loadCompleteInventory, type InventoryFetcher } from './inventory-loader'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function record(basketid: string) {
  return {
    basketid,
    latitude: '40.7',
    longitude: '-74',
  }
}

describe('complete Socrata inventory loader', () => {
  it('uses the explicit high-limit request when it returns a short page', async () => {
    const requests: URL[] = []
    const fetcher: InventoryFetcher = async (input) => {
      requests.push(new URL(input.toString()))
      return jsonResponse([record('B-1'), record('B-2')])
    }

    const result = await loadCompleteInventory(fetcher, { preferredLimit: 50_000 })

    expect(result.records).toHaveLength(2)
    expect(result.diagnostics).toMatchObject({
      strategy: 'high-limit',
      requestCount: 1,
      pageCount: 1,
      rawRecordCount: 2,
      uniqueRecordCount: 2,
      terminationReason: 'short-high-limit-page',
    })
    expect(requests[0]?.searchParams.get('$limit')).toBe('50000')
    expect(requests[0]?.searchParams.get('$offset')).toBeNull()
  })

  it('falls back to 1000-row offset pagination after a rejected high-limit request', async () => {
    const requests: URL[] = []
    const firstPage = Array.from({ length: 1_000 }, (_, index) => record(`B-${index}`))
    const secondPage = Array.from({ length: 237 }, (_, index) =>
      record(`B-${index + 1_000}`),
    )
    const fetcher: InventoryFetcher = async (input) => {
      const url = new URL(input.toString())
      requests.push(url)

      if (url.searchParams.get('$limit') === '50000') {
        return jsonResponse({ error: 'limit rejected' }, 400)
      }

      return jsonResponse(
        url.searchParams.get('$offset') === null ? firstPage : secondPage,
      )
    }

    const result = await loadCompleteInventory(fetcher, {
      preferredLimit: 50_000,
      pageSize: 1_000,
    })

    expect(result.records).toHaveLength(1_237)
    expect(result.diagnostics).toMatchObject({
      strategy: 'offset-pagination',
      requestCount: 3,
      pageCount: 2,
      rawRecordCount: 1_237,
      uniqueRecordCount: 1_237,
      duplicateCount: 0,
      terminationReason: 'short-offset-page',
    })
    expect(
      requests.map((url) => [
        url.searchParams.get('$limit'),
        url.searchParams.get('$offset'),
      ]),
    ).toEqual([
      ['50000', null],
      ['1000', null],
      ['1000', '1000'],
    ])
  })

  it('continues pagination after a full page and deduplicates basket IDs', async () => {
    const firstPage = Array.from({ length: 2 }, (_, index) => record(`B-${index}`))
    const secondPage = [record('B-1'), record('B-2')]
    const fetcher: InventoryFetcher = async (input) => {
      const url = new URL(input.toString())
      const limit = Number(url.searchParams.get('$limit'))
      const offset = Number(url.searchParams.get('$offset') ?? '0')

      if (limit === 2 && url.searchParams.get('$offset') === null) {
        return jsonResponse(firstPage)
      }

      if (offset === 0) {
        return jsonResponse(firstPage)
      }

      if (offset === 2) {
        return jsonResponse(secondPage)
      }

      return jsonResponse([])
    }

    const result = await loadCompleteInventory(fetcher, {
      preferredLimit: 2,
      pageSize: 2,
    })

    expect(result.records.map((item) => item.basketid)).toEqual(['B-0', 'B-1', 'B-2'])
    expect(result.diagnostics).toMatchObject({
      strategy: 'offset-pagination',
      rawRecordCount: 4,
      uniqueRecordCount: 3,
      duplicateCount: 1,
      terminationReason: 'empty-offset-page',
    })
  })

  it('uses the fallback when the high-limit response is exactly full', async () => {
    const requests: URL[] = []
    const fetcher: InventoryFetcher = async (input) => {
      const url = new URL(input.toString())
      requests.push(url)

      if (
        url.searchParams.get('$limit') === '2' &&
        url.searchParams.get('$offset') === null
      ) {
        return jsonResponse([record('B-0'), record('B-1')])
      }

      return jsonResponse([record('B-0')])
    }

    const result = await loadCompleteInventory(fetcher, {
      preferredLimit: 2,
      pageSize: 1,
    })

    expect(result.diagnostics.strategy).toBe('offset-pagination')
    expect(result.records).toHaveLength(1)
    expect(requests).toHaveLength(2)
  })
})
