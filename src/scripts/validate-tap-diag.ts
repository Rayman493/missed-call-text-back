// Temporary local validation script; do not commit.
import { logTapToPayEvent, getTapToPayDiagnostics, clearTapToPayDiagnostics, getFormattedTapToPayDiagnostics } from '@/lib/tap-to-pay-diagnostics'

;(async () => {
  const g: any = globalThis as any
  if (typeof g.window === 'undefined') {
    const store = new Map<string, string>()
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
      }
    }
  }

  const assert = (cond: any, msg: string) => { if (!cond) throw new Error('ASSERT: ' + msg) }

  // Start fresh
  await clearTapToPayDiagnostics()

  // A. 205 sequential events -> keep last 200
  for (let i = 0; i < 205; i++) {
    await logTapToPayEvent('seq', { sessionId: 's', meta: { idx: i } })
  }
  let events = await getTapToPayDiagnostics()
  assert(events.length === 200, 'A: expected 200 events, got ' + events.length)
  // last 200 means indices 5..204
  // ensure first event has idx 5
  assert((events[0].meta?.idx ?? -1) === 5, 'A: expected first idx 5 got ' + events[0].meta?.idx)

  // B. 25 concurrent writes
  const base = events.length
  await Promise.all(Array.from({ length: 25 }, (_, i) => logTapToPayEvent('conc', { sessionId: 's', meta: { i } })))
  events = await getTapToPayDiagnostics()
  assert(events.length === Math.min(200, base + 25), 'B: expected length ' + Math.min(200, base + 25) + ' got ' + events.length)

  // C. Writes around clear
  await logTapToPayEvent('pre_clear', { sessionId: 's' })
  await logTapToPayEvent('pre_clear', { sessionId: 's' })
  await logTapToPayEvent('pre_clear', { sessionId: 's' })
  await clearTapToPayDiagnostics()
  await logTapToPayEvent('post_clear', { sessionId: 's' })
  await logTapToPayEvent('post_clear', { sessionId: 's' })
  events = await getTapToPayDiagnostics()
  assert(events.length === 2, 'C: expected 2 post-clear events, got ' + events.length)
  assert(events.every(e => e.name === 'post_clear' || e.name === 'POST_CLEAR'), 'C: only post_clear expected')

  // D. Sanitizer test
  await clearTapToPayDiagnostics()
  await logTapToPayEvent('san', {
    sessionId: 's',
    meta: {
      clientSecret: 'sk_test_123',
      connectionToken: 'tok_abc',
      authorization: 'Bearer 123',
      customerName: 'John Doe',
      card: { number: '4242 4242 4242 4242' },
      paymentMethod: { id: 'pm_123' },
      email: 'a@b.com',
      phoneNumber: '+15551234567',
      eventName: 'CollectPayment',
      methodName: 'start',
    }
  })
  events = await getTapToPayDiagnostics()
  const m = events[0].meta || {}
  assert(m.clientSecret === '[redacted]', 'D: clientSecret not redacted')
  assert(m.connectionToken === '[redacted]', 'D: connectionToken not redacted')
  assert(m.authorization === '[redacted]', 'D: authorization not redacted')
  assert(m.customerName === '[redacted]', 'D: customerName not redacted')
  assert(m.card === '[redacted]' || (m.card && Object.values(m.card).every((v: any) => v === '[redacted]')), 'D: card not redacted')
  assert(m.paymentMethod === '[redacted]' || (m.paymentMethod && Object.values(m.paymentMethod).every((v: any) => v === '[redacted]')), 'D: paymentMethod not redacted')
  assert(m.email === '[redacted]', 'D: email not redacted')
  assert(m.phoneNumber === '[redacted]', 'D: phoneNumber not redacted')
  assert(m.eventName === 'CollectPayment', 'D: eventName should be visible')
  assert(m.methodName === 'start', 'D: methodName should be visible')

  // E. Formatting output check
  const text = await getFormattedTapToPayDiagnostics({ appVersion: 'test', androidVersion: '14', deviceModel: 'Pixel' })
  const forbidden = ['secret', 'client_secret', 'connection token', 'authorization']
  for (const s of forbidden) {
    assert(!text.toLowerCase().includes(s), 'E: found forbidden string: ' + s)
  }

  console.log('VALIDATION PASSED')
})().catch(e => { console.error(e); process.exit(1) })
