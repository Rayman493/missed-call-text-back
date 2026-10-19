import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const isNativeMock = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativeMock(),
  },
}))

async function loadModule() {
  return import('../microsoft-uet')
}

let uetqArr: any[]
let reportUetSignupConversion: Awaited<ReturnType<typeof loadModule>>['reportUetSignupConversion']
let buildUetInitSnippet: Awaited<ReturnType<typeof loadModule>>['buildUetInitSnippet']
let UET_TAG_ID: string

beforeEach(async () => {
  vi.resetModules()
  isNativeMock.mockReset().mockReturnValue(false)
  window.sessionStorage.clear()
  uetqArr = []
  ;(window as any).uetq = uetqArr
  ;({ reportUetSignupConversion, buildUetInitSnippet, UET_TAG_ID } = await loadModule())
})

afterEach(() => {
  delete (window as any).uetq
  delete (navigator as any).globalPrivacyControl
})

describe('UET base tag', () => {
  it('uses the configured Microsoft UET tag ID', () => {
    expect(UET_TAG_ID).toBe('343279768')
    expect(buildUetInitSnippet(UET_TAG_ID)).toContain('ti:"343279768"')
  })

  it('loads bat.js asynchronously from bat.bing.net', () => {
    const snippet = buildUetInitSnippet(UET_TAG_ID)
    expect(snippet).toContain('https://bat.bing.net/bat.js')
    expect(snippet).toContain('n.async=1')
  })

  it('enables automatic SPA tracking and pushes exactly one initial pageLoad', () => {
    const snippet = buildUetInitSnippet(UET_TAG_ID)
    expect(snippet).toContain('enableAutoSpaTracking:true')
    // exactly one manual pageLoad — autoSpa covers subsequent navigations
    expect(snippet.match(/pageLoad/g)?.length).toBe(1)
  })

  it('does not wire manual router pageview events (autoSpa owns navigation reporting)', () => {
    const src = readFileSync(join(__dirname, '../microsoft-uet.tsx'), 'utf8')
    expect(src).not.toMatch(/usePathname|useRouter|router\.events|pathname.*pageLoad/)
    expect(src.match(/push\("pageLoad"\)|push\('pageLoad'\)/g)?.length ?? 0).toBe(1)
  })
})

describe('reportUetSignupConversion', () => {
  it('pushes the exact Microsoft signup custom event on successful registration', () => {
    reportUetSignupConversion({ businessId: 'biz-1', email: 'plumber@example.com' })
    expect(uetqArr).toEqual(['event', 'signup', {}])
  })

  it('sends no personal information — the event payload is empty', () => {
    reportUetSignupConversion({ businessId: 'biz-pii', email: 'owner@realcompany.com' })
    const payload = uetqArr[2]
    expect(payload).toEqual({})
    const serialized = JSON.stringify(uetqArr)
    expect(serialized).not.toContain('owner@realcompany.com')
    expect(serialized).not.toContain('biz-pii')
  })

  it('dedupes repeated success callbacks for the same account', () => {
    reportUetSignupConversion({ businessId: 'biz-2', email: 'a@b.com' })
    reportUetSignupConversion({ businessId: 'biz-2', email: 'a@b.com' })
    reportUetSignupConversion({ businessId: 'biz-2', email: 'a@b.com' })
    expect(uetqArr.length).toBe(3)
  })

  it('tracks distinct accounts independently (unique conversion counting)', () => {
    reportUetSignupConversion({ businessId: 'biz-a' })
    reportUetSignupConversion({ businessId: 'biz-b' })
    expect(uetqArr.length).toBe(6)
  })

  it('never fires without a committed businessId', () => {
    reportUetSignupConversion({ businessId: '', email: 'x@y.com' })
    reportUetSignupConversion({ businessId: undefined as any })
    expect(uetqArr.length).toBe(0)
  })

  it('suppresses the event when Global Privacy Control is set', () => {
    ;(navigator as any).globalPrivacyControl = true
    reportUetSignupConversion({ businessId: 'biz-gpc', email: 'real@customer.com' })
    expect(uetqArr.length).toBe(0)
  })

  it('suppresses internal/test accounts (@replyflowhq.com)', () => {
    reportUetSignupConversion({ businessId: 'biz-6', email: 'appreview@replyflowhq.com' })
    reportUetSignupConversion({ businessId: 'biz-7', email: 'DEV@ReplyFlowHQ.com' })
    expect(uetqArr.length).toBe(0)
  })

  it('suppresses native Capacitor shells', () => {
    isNativeMock.mockReturnValue(true)
    reportUetSignupConversion({ businessId: 'biz-8', email: 'real@customer.com' })
    expect(uetqArr.length).toBe(0)
  })

  it('never throws — tracking cannot break registration', () => {
    window.sessionStorage.setItem('x', 'y')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('denied') })
    expect(() => reportUetSignupConversion({ businessId: 'biz-9' })).not.toThrow()
  })

  it('initializes window.uetq when bat.js has not loaded (queue survives ad blockers)', () => {
    delete (window as any).uetq
    reportUetSignupConversion({ businessId: 'biz-10' })
    expect((window as any).uetq).toEqual(['event', 'signup', {}])
  })

  it('marks the dedupe flag before pushing so a push failure cannot double-fire', () => {
    reportUetSignupConversion({ businessId: 'biz-11' })
    expect(window.sessionStorage.getItem('rf_uet_signup_conv:biz-11')).toBe('1')
  })
})

describe('integration points', () => {
  it('fires from the same authoritative signup-success point as Google Ads', () => {
    const authSrc = readFileSync(join(__dirname, '../../app/auth/page.tsx'), 'utf8')
    const googleIdx = authSrc.indexOf('reportSignupConversion({')
    const uetIdx = authSrc.indexOf('reportUetSignupConversion({')
    expect(googleIdx).toBeGreaterThan(-1)
    expect(uetIdx).toBeGreaterThan(googleIdx)
    // both calls sit in the same committed-success block (business_id guard above)
    const guardIdx = authSrc.indexOf('businessIdFromCompleteSignup')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(googleIdx)
    // only one call site each — no duplicate emitters
    expect(authSrc.match(/reportUetSignupConversion\(/g)?.length).toBe(1)
  })

  it('Google Ads conversion still fires independently', () => {
    const authSrc = readFileSync(join(__dirname, '../../app/auth/page.tsx'), 'utf8')
    expect(authSrc).toContain('reportSignupConversion({ businessId: businessIdFromCompleteSignup, email })')
  })

  it('tag is mounted in the root layout next to GoogleAdsTag', () => {
    const layoutSrc = readFileSync(join(__dirname, '../../app/layout.tsx'), 'utf8')
    expect(layoutSrc).toContain('<MicrosoftUetTag />')
    expect(layoutSrc).toContain('<GoogleAdsTag />')
  })

  it('CSP allows only the two Microsoft domains needed (script + beacons)', () => {
    const cfg = readFileSync(join(__dirname, '../../../next.config.js'), 'utf8')
    const scriptSrc = cfg.match(/script-src [^;]+/)![0]
    const connectSrc = cfg.match(/connect-src [^;]+/)![0]
    expect(scriptSrc).toContain('https://bat.bing.net')
    expect(connectSrc).toContain('https://bat.bing.com')
    expect(connectSrc).toContain('https://bat.bing.net')
    // no broad Microsoft wildcards or unrelated ad domains added
    expect(cfg).not.toMatch(/bing\.net[^a-z]?\*|\*\.microsoft|\*\.msn|\*\.clarity/)
  })

  it('component honors GPC and native shells before rendering the script', () => {
    const src = readFileSync(join(__dirname, '../microsoft-uet.tsx'), 'utf8')
    expect(src).toContain('globalPrivacyControlRequested()')
    expect(src).toContain('Capacitor.isNativePlatform()')
    const guardIdx = src.indexOf('return null')
    const scriptIdx = src.indexOf('<Script')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(scriptIdx)
  })
})
