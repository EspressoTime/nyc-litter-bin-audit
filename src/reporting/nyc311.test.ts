import { NYC_311_COMPLAINT_FORM_URL } from './nyc311'

describe('NYC 311 handoff', () => {
  it('uses the exact official complaint submission form URL', () => {
    expect(NYC_311_COMPLAINT_FORM_URL).toBe(
      'https://portal.311.nyc.gov/servicerequest-create/What?caid=794e51a3-3f16-ec11-b6e5-0022481cc62d&kasid=10a2780b-6161-ef11-bfe2-7c1e5217eb2d',
    )
  })
})
