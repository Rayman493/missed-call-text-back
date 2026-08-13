import { describe, it, expect } from 'vitest'
import { mapTapToPayError } from './error-mapper'

describe('Terminal error mapper - address configuration errors', () => {
  it('terminal_location_address_required should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'terminal_location_address_required',
      message: 'A valid business address is required before Tap to Pay can be enabled.',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
    expect(error.technicalCode).toBe('terminal_location_address_required')
  })

  it('terminal_location_address_invalid should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'terminal_location_address_invalid',
      message: 'Add a valid business address before using Tap to Pay.',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
    expect(error.technicalCode).toBe('terminal_location_address_invalid')
  })

  it('message containing business address required should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'unknown_error',
      message: 'a valid business address is required before Tap to Pay can be enabled',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
  })

  it('message containing add a valid business address should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'unknown_error',
      message: 'add a valid business address before using Tap to Pay',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
  })

  it('other errors should continue to return retry action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'reader_connection_failed',
      message: 'Failed to connect to reader',
    })

    expect(error.action).toBe('retry')
    expect(error.title).not.toBe('Business Address Required')
  })
})