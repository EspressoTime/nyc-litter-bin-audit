import {
  clearClientDiagnostics,
  getClientDiagnostics,
  recordClientDiagnostic,
  type ClientDiagnosticInput,
} from './client-diagnostics'

function input(overrides: Partial<ClientDiagnosticInput> = {}): ClientDiagnosticInput {
  return {
    operation: 'inventory-refresh',
    status: 'success',
    durationMs: 120,
    sourceRowCount: 100,
    validRowCount: 100,
    invalidRowCount: 0,
    duplicateCount: 0,
    terminationReason: 'short-high-limit-page',
    ...overrides,
  }
}

describe('client diagnostics', () => {
  beforeEach(() => {
    clearClientDiagnostics()
  })

  it('stores only bounded, non-content inventory diagnostics locally', () => {
    recordClientDiagnostic(
      input({
        sourceVersion: '1794244182',
        responseSizeBytes: 2048,
      }),
    )

    const [diagnostic] = getClientDiagnostics()
    expect(diagnostic).toMatchObject({
      operation: 'inventory-refresh',
      status: 'success',
      durationMs: 120,
      responseSizeBytes: 2048,
      sourceRowCount: 100,
      validRowCount: 100,
      invalidRowCount: 0,
      duplicateCount: 0,
    })
    expect(JSON.stringify(diagnostic)).not.toContain('basket_id')
    expect(JSON.stringify(diagnostic)).not.toContain('latitude')
    expect(JSON.stringify(diagnostic)).not.toContain('longitude')
  })

  it('flags schema failures and zero-row responses', () => {
    const diagnostic = recordClientDiagnostic(
      input({
        status: 'error',
        sourceRowCount: 0,
        validRowCount: 0,
        invalidRowCount: 0,
        terminationReason: 'schema-error',
        errorCode: 'schema-failure',
      }),
    )

    expect(diagnostic.anomalyCodes).toEqual(
      expect.arrayContaining(['schema-failure', 'zero-row-response']),
    )
  })

  it('flags the third consecutive refresh failure', () => {
    recordClientDiagnostic(
      input({ status: 'error', errorCode: 'inventory-request-failure' }),
    )
    recordClientDiagnostic(
      input({ status: 'error', errorCode: 'inventory-request-failure' }),
    )
    const third = recordClientDiagnostic(
      input({ status: 'error', errorCode: 'inventory-request-failure' }),
    )

    expect(third.anomalyCodes).toContain('repeated-refresh-failure')
  })

  it('flags a row-count change of at least fifty percent', () => {
    recordClientDiagnostic(input({ sourceRowCount: 100 }))
    const changed = recordClientDiagnostic(input({ sourceRowCount: 49 }))

    expect(changed.anomalyCodes).toContain('abnormal-row-count-change')
  })
})
