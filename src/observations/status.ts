export const PIN_GLYPHS = {
  unconfirmed: '🗑️',
  confirmed: '🚮',
  missing: '🚨',
} as const

export type LocalObservationStatus = 'exists' | 'missing'

export type LocalObservation = {
  basketId: string
  status: LocalObservationStatus
  observedAt: string
}

export type BasketPinStatus = 'unconfirmed' | 'confirmed' | 'missing'

export type BasketPinPresentation = {
  status: BasketPinStatus
  glyph: (typeof PIN_GLYPHS)[BasketPinStatus]
  accessibleLabel: string
}

const OBSERVATION_TIME_ZONE = 'America/New_York'
const CONFIRMATION_WINDOW_DAYS = 30
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

function getCalendarDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OBSERVATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value
    if (!value) {
      throw new Error(`Could not determine the New York ${type} date part.`)
    }

    return Number(value)
  }

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
  }
}

function calendarDayKey(date: Date): string {
  const parts = getCalendarDateParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function calendarDayAge(now: Date, observedAt: Date): number {
  const current = getCalendarDateParts(now)
  const observed = getCalendarDateParts(observedAt)
  const currentUtc = Date.UTC(current.year, current.month - 1, current.day)
  const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day)
  return Math.floor((currentUtc - observedUtc) / MILLISECONDS_PER_DAY)
}

export function getLatestObservation(
  basketId: string,
  observations: LocalObservation[],
): LocalObservation | undefined {
  return observations
    .filter((observation) => observation.basketId === basketId)
    .filter((observation) =>
      Number.isFinite(new Date(observation.observedAt).getTime()),
    )
    .reduce<LocalObservation | undefined>((latest, observation) => {
      if (!latest) {
        return observation
      }

      return new Date(observation.observedAt).getTime() >=
        new Date(latest.observedAt).getTime()
        ? observation
        : latest
    }, undefined)
}

export function formatObservationDate(observedAt: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OBSERVATION_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(observedAt))
}

export function getBasketPinPresentation(
  basketId: string,
  observations: LocalObservation[] = [],
  now: Date = new Date(),
): BasketPinPresentation {
  const latest = getLatestObservation(basketId, observations)

  if (!latest) {
    return {
      status: 'unconfirmed',
      glyph: PIN_GLYPHS.unconfirmed,
      accessibleLabel: 'Not confirmed recently',
    }
  }

  const ageInDays = calendarDayAge(now, new Date(latest.observedAt))
  if (latest.status === 'missing') {
    return {
      status: 'missing',
      glyph: PIN_GLYPHS.missing,
      accessibleLabel:
        ageInDays === 0
          ? 'Reported missing today'
          : `Reported missing on ${formatObservationDate(latest.observedAt)}`,
    }
  }

  if (ageInDays >= 0 && ageInDays <= CONFIRMATION_WINDOW_DAYS) {
    return {
      status: 'confirmed',
      glyph: PIN_GLYPHS.confirmed,
      accessibleLabel:
        ageInDays === 0
          ? 'Confirmed exists today'
          : `Confirmed exists ${ageInDays} ${ageInDays === 1 ? 'day' : 'days'} ago`,
    }
  }

  return {
    status: 'unconfirmed',
    glyph: PIN_GLYPHS.unconfirmed,
    accessibleLabel: `Not confirmed recently (last check ${calendarDayKey(new Date(latest.observedAt))})`,
  }
}
