import type { NormalizedBasket } from '../baskets/model'
import { formatObservationDate } from '../observations/status'

export type ComplaintDraftInput = {
  basket: NormalizedBasket
  observedAt: string
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

function getLocationContext(basket: NormalizedBasket): string {
  const streetName1 = nonEmpty(basket.streetName1)
  const streetName2 = nonEmpty(basket.streetName2)
  const direction = nonEmpty(basket.direction)
  const streets = [streetName1, streetName2].filter(
    (value): value is string => value !== null,
  )

  if (streets.length === 0) {
    return 'the listed official location'
  }

  const location = streets.join(' and ')
  return direction ? `${location} (${direction})` : location
}

export function buildComplaintDraft({
  basket,
  observedAt,
}: ComplaintDraftInput): string {
  const lines = [
    `I could not find the public litter basket listed in the DSNY Litter Basket Inventory at ${getLocationContext(basket)}.`,
  ]
  const basketId = nonEmpty(basket.basketId)
  const borough = nonEmpty(basket.borough)
  const district = nonEmpty(basket.district)

  if (basketId) {
    lines.push(`Basket ID: ${basketId}.`)
  }
  if (borough) {
    lines.push(`Borough: ${borough}.`)
  }
  if (district) {
    lines.push(`District: ${district}.`)
  }

  lines.push(
    `I observed this on ${formatObservationDate(observedAt)}.`,
    'Please investigate the location and replace the basket if appropriate.',
  )

  return lines.join('\n')
}
