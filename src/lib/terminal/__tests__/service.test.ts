import { describe, it, expect } from 'vitest'
import { terminalBridge } from '../service'

describe('TerminalBridgeService (web)', () => {
  it('reports unsupported on web', async () => {
    const res = await terminalBridge.isSupported()
    expect(res.supported).toBe(false)
    expect(res.platform).toBe('web')
  })

  it('initialize returns not_initialized on web', async () => {
    const res = await terminalBridge.initialize()
    expect(res.status).toBe('not_initialized')
  })
})
