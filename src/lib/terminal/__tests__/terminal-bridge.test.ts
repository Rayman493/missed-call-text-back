import { describe, it, expect } from 'vitest'
import Terminal, { isNativeCapacitor } from '../index'

describe('Terminal bridge (web fallback)', () => {
  it('is not supported on web', async () => {
    const support = await Terminal.isSupported()
    expect(support.platform).toBe('web')
    expect(support.supported).toBe(false)
  })

  it('does not throw on initialize (web fallback ready)', async () => {
    const r = await Terminal.initialize()
    expect(r.status).toBeDefined()
  })
})
