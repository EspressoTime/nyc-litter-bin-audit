import {
  mapSocrataBasket,
  type NormalizedBasket,
  type SocrataBasketRecord,
} from './model'

export const NYC_COORDINATE_BOUNDS = {
  minLatitude: 40.49,
  maxLatitude: 40.92,
  minLongitude: -74.26,
  maxLongitude: -73.69,
} as const

export type InventoryTerminationReason = 'completed' | 'empty-input' | 'schema-error'

export type InventoryValidationDiagnostics = {
  inputRecordCount: number
  validRecordCount: number
  invalidCoordinateCount: number
  duplicateCount: number
  unnormalizableRecordCount: number
  terminationReason: InventoryTerminationReason
}

export type InventoryValidationResult = {
  baskets: NormalizedBasket[]
  diagnostics: InventoryValidationDiagnostics
  canPublish: boolean
}

export class InventoryValidationError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: InventoryValidationDiagnostics,
  ) {
    super(message)
    this.name = 'InventoryValidationError'
  }
}

function isRecord(value: unknown): value is SocrataBasketRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasUsableIdentifier(value: unknown): boolean {
  return (
    (typeof value === 'string' ||
      (typeof value === 'number' && Number.isFinite(value))) &&
    String(value).trim().length > 0
  )
}

function parseCoordinate(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== 'string' && typeof value !== 'number')
  ) {
    return null
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null
  }

  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : null
}

function isWithinNycBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= NYC_COORDINATE_BOUNDS.minLatitude &&
    latitude <= NYC_COORDINATE_BOUNDS.maxLatitude &&
    longitude >= NYC_COORDINATE_BOUNDS.minLongitude &&
    longitude <= NYC_COORDINATE_BOUNDS.maxLongitude
  )
}

export function validateAndNormalizeInventory(
  input: unknown,
): InventoryValidationResult {
  if (!Array.isArray(input)) {
    throw new InventoryValidationError(
      'The inventory response was not an array of records.',
      {
        inputRecordCount: 0,
        validRecordCount: 0,
        invalidCoordinateCount: 0,
        duplicateCount: 0,
        unnormalizableRecordCount: 1,
        terminationReason: 'schema-error',
      },
    )
  }

  const diagnostics: InventoryValidationDiagnostics = {
    inputRecordCount: input.length,
    validRecordCount: 0,
    invalidCoordinateCount: 0,
    duplicateCount: 0,
    unnormalizableRecordCount: 0,
    terminationReason: input.length === 0 ? 'empty-input' : 'completed',
  }
  const baskets: NormalizedBasket[] = []
  const seenBasketIds = new Set<string>()

  for (const value of input) {
    if (!isRecord(value) || !hasUsableIdentifier(value.basketid)) {
      diagnostics.unnormalizableRecordCount += 1
      continue
    }

    const latitude = parseCoordinate(value.latitude)
    const longitude = parseCoordinate(value.longitude)

    if (
      latitude === null ||
      longitude === null ||
      !isWithinNycBounds(latitude, longitude)
    ) {
      diagnostics.invalidCoordinateCount += 1
      continue
    }

    const basketId = String(value.basketid)
    if (seenBasketIds.has(basketId)) {
      diagnostics.duplicateCount += 1
      continue
    }

    const basket = mapSocrataBasket({ ...value, latitude, longitude })
    seenBasketIds.add(basketId)
    baskets.push(basket)
    diagnostics.validRecordCount += 1
  }

  if (input.length > 0 && baskets.length === 0) {
    diagnostics.terminationReason = 'schema-error'
    throw new InventoryValidationError(
      'No valid basket records were available; the inventory was not published.',
      diagnostics,
    )
  }

  return {
    baskets,
    diagnostics,
    canPublish: baskets.length > 0,
  }
}
