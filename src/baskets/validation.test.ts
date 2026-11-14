import { InventoryValidationError, validateAndNormalizeInventory } from './validation'

const validRecord = {
  basketid: 'B-100',
  latitude: '40.7128',
  longitude: '-74.006',
  baskettype: 'Public Litter Basket',
}

describe('inventory validation', () => {
  it('parses valid coordinates and returns normalized records', () => {
    const result = validateAndNormalizeInventory([validRecord])

    expect(result.canPublish).toBe(true)
    expect(result.baskets[0]?.latitude).toBe(40.7128)
    expect(result.baskets[0]?.longitude).toBe(-74.006)
    expect(result.diagnostics).toMatchObject({
      inputRecordCount: 1,
      validRecordCount: 1,
      invalidCoordinateCount: 0,
      duplicateCount: 0,
      unnormalizableRecordCount: 0,
    })
  })

  it('rejects missing, non-finite, and out-of-bounds coordinates', () => {
    const result = validateAndNormalizeInventory([
      validRecord,
      { basketid: 'B-101', latitude: '', longitude: '-74' },
      { basketid: 'B-102', latitude: 'NaN', longitude: '-74' },
      { basketid: 'B-103', latitude: '41', longitude: '-74' },
    ])

    expect(result.baskets).toHaveLength(1)
    expect(result.diagnostics.invalidCoordinateCount).toBe(3)
  })

  it('accepts the inclusive NYC coordinate bounds and rejects just-outside values', () => {
    const result = validateAndNormalizeInventory([
      { basketid: 'B-min', latitude: '40.49', longitude: '-74.26' },
      { basketid: 'B-max', latitude: 40.92, longitude: -73.69 },
      { basketid: 'B-west', latitude: '40.70', longitude: '-74.261' },
      { basketid: 'B-east', latitude: '40.70', longitude: '-73.689' },
    ])

    expect(result.baskets.map((basket) => basket.basketId)).toEqual(['B-min', 'B-max'])
    expect(result.diagnostics.invalidCoordinateCount).toBe(2)
  })

  it('keeps the first deterministic record and counts duplicate basket IDs', () => {
    const result = validateAndNormalizeInventory([
      validRecord,
      { ...validRecord, baskettype: 'Replacement value' },
    ])

    expect(result.baskets).toHaveLength(1)
    expect(result.baskets[0]?.basketType).toBe('Public Litter Basket')
    expect(result.diagnostics.duplicateCount).toBe(1)
  })

  it('counts unnormalizable records', () => {
    const result = validateAndNormalizeInventory([
      validRecord,
      null,
      { latitude: '40.7', longitude: '-74' },
    ])

    expect(result.baskets).toHaveLength(1)
    expect(result.diagnostics.unnormalizableRecordCount).toBe(2)
  })

  it('fails safely when the response shape cannot produce any basket', () => {
    expect(() =>
      validateAndNormalizeInventory([{ id: 'wrong-schema', latitude: '40.7' }]),
    ).toThrow(InventoryValidationError)

    try {
      validateAndNormalizeInventory([{ id: 'wrong-schema', latitude: '40.7' }])
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryValidationError)
      expect((error as InventoryValidationError).diagnostics).toMatchObject({
        validRecordCount: 0,
        unnormalizableRecordCount: 1,
        terminationReason: 'schema-error',
      })
    }
  })

  it('fails safely when the response is not an array', () => {
    expect(() => validateAndNormalizeInventory({ records: [validRecord] })).toThrow(
      InventoryValidationError,
    )

    try {
      validateAndNormalizeInventory({ records: [validRecord] })
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryValidationError)
      expect((error as InventoryValidationError).diagnostics).toMatchObject({
        inputRecordCount: 0,
        unnormalizableRecordCount: 1,
        terminationReason: 'schema-error',
      })
    }
  })

  it('does not publish an empty response', () => {
    const result = validateAndNormalizeInventory([])

    expect(result).toEqual({
      baskets: [],
      diagnostics: {
        inputRecordCount: 0,
        validRecordCount: 0,
        invalidCoordinateCount: 0,
        duplicateCount: 0,
        unnormalizableRecordCount: 0,
        terminationReason: 'empty-input',
      },
      canPublish: false,
    })
  })
})
