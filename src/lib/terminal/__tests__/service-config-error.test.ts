import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TerminalBridgeService } from '../service'

// Mock fetch
global.fetch = vi.fn()

// Mock the Terminal plugin
vi.mock('../index', () => ({
  default: {
    initialize: vi.fn(),
    isSupported: vi.fn(),
    addListener: vi.fn(),
    supplyConnectionToken: vi.fn(),
    supplyConnectionTokenError: vi.fn(),
    connectTapToPay: vi.fn(),
    createTerminalPayment: vi.fn(),
    collectPayment: vi.fn(),
    cancel: vi.fn(),
    disconnect: vi.fn(),
    teardown: vi.fn(),
  },
  isNativeCapacitor: vi.fn(() => true),
}))

describe('Terminal service - configuration error message formatting', () => {
  let service: TerminalBridgeService

  beforeEach(() => {
    vi.clearAllMocks()
    service = TerminalBridgeService.getInstance()
  })

  it('should include error code in message for terminal_location_address_required', async () => {
    const mockErrorResponse = {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: 'terminal_location_address_required',
        message: 'A valid business address is required before Tap to Pay can be enabled.'
      })
    }

    vi.mocked(global.fetch).mockResolvedValueOnce(mockErrorResponse as any)

    await expect(service.fetchTerminalLocation()).rejects.toThrow(
      'terminal_location_address_required: A valid business address is required before Tap to Pay can be enabled.'
    )
  })

  it('should include error code in message for terminal_location_address_invalid', async () => {
    const mockErrorResponse = {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: 'terminal_location_address_invalid',
        message: 'Add a valid business address before using Tap to Pay.'
      })
    }

    vi.mocked(global.fetch).mockResolvedValueOnce(mockErrorResponse as any)

    await expect(service.fetchTerminalLocation()).rejects.toThrow(
      'terminal_location_address_invalid: Add a valid business address before using Tap to Pay.'
    )
  })

  it('should handle non-JSON error response', async () => {
    const mockErrorResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal server error'
    }

    vi.mocked(global.fetch).mockResolvedValueOnce(mockErrorResponse as any)

    await expect(service.fetchTerminalLocation()).rejects.toThrow(
      'unknown: Internal server error'
    )
  })
})