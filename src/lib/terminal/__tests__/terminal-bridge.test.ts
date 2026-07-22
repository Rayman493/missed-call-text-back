import { describe, it, expect } from 'vitest'
import Terminal, { isNativeCapacitor } from '../index'

describe('Terminal bridge (web fallback)', () => {
  it('ping() exists and reports native unavailable on web', async () => {
    const pingResult = await Terminal.ping()
    expect(pingResult.available).toBe(false)
    expect(pingResult.platform).toBe('web')
  })

  it('is not supported on web', async () => {
    const support = await Terminal.isSupported()
    expect(support.platform).toBe('web')
    expect(support.supported).toBe(false)
  })

  it('does not throw on initialize (web fallback ready)', async () => {
    const r = await Terminal.initialize()
    expect(r.status).toBeDefined()
  })

  it('supplyConnectionToken throws on web', async () => {
    await expect(
      Terminal.supplyConnectionToken({ requestId: 'req-123', secret: 'tok_123' })
    ).rejects.toThrow('Stripe Terminal is not supported on web')
  })

  it('supplyConnectionTokenError throws on web', async () => {
    await expect(
      Terminal.supplyConnectionTokenError({ requestId: 'req-123', message: 'error' })
    ).rejects.toThrow('Stripe Terminal is not supported on web')
  })
})
