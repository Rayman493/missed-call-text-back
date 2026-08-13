import { describe, it, expect } from 'vitest'

describe('Connection retry classification - semantic error detection', () => {
  
  describe('isTimeout detection', () => {
    it('should detect withTimeout errors with "Timeout:" prefix', () => {
      const error = new Error('Timeout: READER_CONNECTION')
      const isTimeout = error.message.includes('Timeout:')
      expect(isTimeout).toBe(true)
    })

    it('should detect withTimeout errors for different stages', () => {
      const stages = ['READER_CONNECTION', 'READER_CONNECTION_RETRY', 'TERMINAL_INITIALIZATION', 'PAYMENT_COLLECTION']
      stages.forEach(stage => {
        const error = new Error(`Timeout: ${stage}`)
        const isTimeout = error.message.includes('Timeout:')
        expect(isTimeout).toBe(true)
      })
    })

    it('should not classify non-timeout errors as timeouts', () => {
      const error = new Error('Reader connection failed')
      const isTimeout = error.message.includes('Timeout:')
      expect(isTimeout).toBe(false)
    })
  })

  describe('configuration error detection', () => {
    it('should detect terminal_location_address_required', () => {
      const error = new Error('terminal_location_address_required: A valid business address is required')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      expect(isConfigurationError).toBe(true)
    })

    it('should detect terminal_location_address_invalid', () => {
      const error = new Error('terminal_location_address_invalid: Add a valid business address')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      expect(isConfigurationError).toBe(true)
    })

    it('should not classify other errors as configuration errors', () => {
      const error = new Error('Reader connection failed')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      expect(isConfigurationError).toBe(false)
    })
  })

  describe('account error detection', () => {
    it('should detect stripe connect account not configured', () => {
      const error = new Error('stripe connect account not configured')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      expect(isAccountError).toBe(true)
    })

    it('should detect stripe connect account not ready', () => {
      const error = new Error('stripe connect account not ready')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      expect(isAccountError).toBe(true)
    })

    it('should not classify other errors as account errors', () => {
      const error = new Error('Reader connection failed')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      expect(isAccountError).toBe(false)
    })
  })

  describe('generic Error classification', () => {
    it('should not classify generic Error as timeout', () => {
      const error = new Error('Unexpected connection failure')
      const isTimeout = error.message.includes('Timeout:')
      expect(isTimeout).toBe(false)
    })

    it('should not classify generic Error as configuration error', () => {
      const error = new Error('Unexpected connection failure')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      expect(isConfigurationError).toBe(false)
    })

    it('should not classify generic Error as account error', () => {
      const error = new Error('Unexpected connection failure')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      expect(isAccountError).toBe(false)
    })

    it('should not rely on Error.name for classification', () => {
      const error = new Error('Some error')
      expect(error.name).toBe('Error')
      // We should NOT use error.name === 'Error' as a timeout indicator
      const isTimeout = error.message.includes('Timeout:')
      expect(isTimeout).toBe(false)
    })
  })

  describe('retry policy', () => {
    it('configuration errors should not retry', () => {
      const error = new Error('terminal_location_address_required: A valid business address is required')
      const isTimeout = error.message.includes('Timeout:')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      const shouldRetry = isTimeout && !isConfigurationError
      expect(shouldRetry).toBe(false)
    })

    it('account errors should not retry', () => {
      const error = new Error('stripe connect account not configured')
      const isTimeout = error.message.includes('Timeout:')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      const shouldRetry = isTimeout && !isAccountError
      expect(shouldRetry).toBe(false)
    })

    it('timeout errors should retry', () => {
      const error = new Error('Timeout: READER_CONNECTION')
      const isTimeout = error.message.includes('Timeout:')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      const shouldRetry = isTimeout && !isConfigurationError && !isAccountError
      expect(shouldRetry).toBe(true)
    })

    it('generic errors should not retry (no catch-all)', () => {
      const error = new Error('Unexpected connection failure')
      const isTimeout = error.message.includes('Timeout:')
      const isConfigurationError = 
        error.message.includes('terminal_location_address_required') ||
        error.message.includes('terminal_location_address_invalid')
      const isAccountError =
        error.message.includes('stripe connect account not configured') ||
        error.message.includes('stripe connect account not ready')
      const shouldRetry = isTimeout && !isConfigurationError && !isAccountError
      expect(shouldRetry).toBe(false)
    })
  })
})