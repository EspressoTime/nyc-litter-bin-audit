import { getBasketPinPresentation, PIN_GLYPHS, type LocalObservation } from './status'

const now = new Date('2026-11-12T17:00:00.000Z')

function observation(
  status: LocalObservation['status'],
  observedAt: string,
): LocalObservation {
  return { basketId: 'B-1', status, observedAt }
}

describe('basket pin status', () => {
  it('uses the unconfirmed glyph when there is no local observation', () => {
    expect(getBasketPinPresentation('B-1', [], now)).toEqual({
      status: 'unconfirmed',
      glyph: PIN_GLYPHS.unconfirmed,
      accessibleLabel: 'Not confirmed recently',
    })
  })

  it('uses the confirmed glyph through the 30-day calendar boundary', () => {
    expect(
      getBasketPinPresentation(
        'B-1',
        [observation('exists', '2026-10-14T17:00:00.000Z')],
        now,
      ),
    ).toMatchObject({ status: 'confirmed', glyph: PIN_GLYPHS.confirmed })
    expect(
      getBasketPinPresentation(
        'B-1',
        [observation('exists', '2026-10-13T17:00:00.000Z')],
        now,
      ),
    ).toMatchObject({ status: 'confirmed', glyph: PIN_GLYPHS.confirmed })
    expect(
      getBasketPinPresentation(
        'B-1',
        [observation('exists', '2026-10-12T17:00:00.000Z')],
        now,
      ),
    ).toMatchObject({ status: 'unconfirmed', glyph: PIN_GLYPHS.unconfirmed })
  })

  it('uses the confirmed glyph for an observation from today', () => {
    expect(
      getBasketPinPresentation(
        'B-1',
        [observation('exists', '2026-11-12T16:00:00.000Z')],
        now,
      ),
    ).toMatchObject({ status: 'confirmed', glyph: PIN_GLYPHS.confirmed })
  })

  it('uses New York calendar dates rather than elapsed milliseconds', () => {
    const lateNightObservation = new Date('2026-10-13T03:30:00.000Z')
    const earlyMorningNow = new Date('2026-11-12T04:30:00.000Z')

    expect(
      getBasketPinPresentation(
        'B-1',
        [observation('exists', lateNightObservation.toISOString())],
        earlyMorningNow,
      ),
    ).toMatchObject({ status: 'confirmed', glyph: PIN_GLYPHS.confirmed })
  })

  it('uses the missing glyph for the latest missing observation', () => {
    expect(
      getBasketPinPresentation(
        'B-1',
        [observation('missing', '2026-11-12T16:00:00.000Z')],
        now,
      ),
    ).toMatchObject({ status: 'missing', glyph: PIN_GLYPHS.missing })
  })

  it('lets the latest observation supersede an earlier observation', () => {
    expect(
      getBasketPinPresentation(
        'B-1',
        [
          observation('missing', '2026-11-01T16:00:00.000Z'),
          observation('exists', '2026-11-12T16:00:00.000Z'),
        ],
        now,
      ),
    ).toMatchObject({ status: 'confirmed', glyph: PIN_GLYPHS.confirmed })
  })

  it('lets a later missing observation supersede an earlier exists observation', () => {
    expect(
      getBasketPinPresentation(
        'B-1',
        [
          observation('exists', '2026-11-01T16:00:00.000Z'),
          observation('missing', '2026-11-12T16:00:00.000Z'),
        ],
        now,
      ),
    ).toMatchObject({ status: 'missing', glyph: PIN_GLYPHS.missing })
  })
})
