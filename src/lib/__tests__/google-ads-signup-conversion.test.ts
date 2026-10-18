import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const isNativeMock = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativeMock(),
  },
}))

const ADS_ID = 'AW-123456789'
const ADS_LABEL = 'testLabel123'

async function loadModule() {
  return import('../google-ads')
}

let gtagMock: ReturnType<typeof vi.fn>
let reportSignupConversion: Awaited<ReturnType<typeof loadModule>>['reportSignupConversion']

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID', ADS_ID)
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL', ADS_LABEL)
  isNativeMock.mockReset().mockReturnValue(false)
  window.sessionStorage.clear()
  gtagMock = vi.fn()
  ;(window as any).gtag = gtagMock
  ;({ reportSignupConversion } = await loadModule())
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as any).gtag
})

describe('reportSignupConversion', () => {
  it('fires exactly one conversion event on new successful registration', () => {
    reportSignupConversion({ businessId: 'biz-1', email: 'plumber@example.com' })

    expect(gtagMock).toHaveBeenCalledTimes(1)
    expect(gtagMock).toHaveBeenCalledWith('event', 'conversion', {
      send_to: `${ADS_ID}/${ADS_LABEL}`,
      transaction_id: 'biz-1',
    })
  })

  it('does not refire on retry, refresh, or back navigation for the same account', () => {
    reportSignupConversion({ businessId: 'biz-2', email: 'a@b.com' })
    reportSignupConversion({ businessId: 'biz-2', email: 'a@b.com' })
    reportSignupConversion({ businessId: 'biz-2', email: 'a@b.com' })
    expect(gtagMock).toHaveBeenCalledTimes(1)
  })

  it('still dedupes across accounts independently', () => {
    reportSignupConversion({ businessId: 'biz-a' })
    reportSignupConversion({ businessId: 'biz-b' })
    expect(gtagMock).toHaveBeenCalledTimes(2)
  })

  it('never fires without a businessId (no committed account = no conversion)', () => {
    reportSignupConversion({ businessId: '', email: 'x@y.com' })
    reportSignupConversion({ businessId: undefined as any })
    expect(gtagMock).not.toHaveBeenCalled()
  })

  it('does nothing when the Google tag failed to load (ad blocker)', () => {
    delete (window as any).gtag
    expect(() => reportSignupConversion({ businessId: 'biz-3' })).not.toThrow()
  })

  it('does nothing when conversion env config is missing', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID', '')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL', '')
    const mod = await loadModule()
    mod.reportSignupConversion({ businessId: 'biz-4' })
    expect(gtagMock).not.toHaveBeenCalled()
  })

  it('does nothing when the label is missing but the tag ID is set', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL', '')
    const mod = await loadModule()
    mod.reportSignupConversion({ businessId: 'biz-5' })
    expect(gtagMock).not.toHaveBeenCalled()
  })

  it('suppresses the event when Global Privacy Control is set', () => {
    ;(navigator as any).globalPrivacyControl = true
    reportSignupConversion({ businessId: 'biz-gpc', email: 'real@customer.com' })
    expect(gtagMock).not.toHaveBeenCalled()
    delete (navigator as any).globalPrivacyControl
  })

  it('suppresses internal/test accounts (@replyflowhq.com)', () => {
    reportSignupConversion({ businessId: 'biz-6', email: 'appreview@replyflowhq.com' })
    reportSignupConversion({ businessId: 'biz-7', email: 'DEV@ReplyFlowHQ.com' })
    expect(gtagMock).not.toHaveBeenCalled()
  })

  it('suppresses native Capacitor shells (web-ad conversions only)', () => {
    isNativeMock.mockReturnValue(true)
    reportSignupConversion({ businessId: 'biz-8', email: 'real@customer.com' })
    expect(gtagMock).not.toHaveBeenCalled()
  })

  it('swallows gtag dispatch failures so registration still succeeds', () => {
    gtagMock.mockImplementation(() => {
      throw new Error('network down')
    })
    expect(() => reportSignupConversion({ businessId: 'biz-9' })).not.toThrow()
  })

  it('marks the flag before dispatch so a throw cannot spam retries', () => {
    gtagMock.mockImplementation(() => {
      throw new Error('boom')
    })
    reportSignupConversion({ businessId: 'biz-10' })
    gtagMock.mockClear()
    reportSignupConversion({ businessId: 'biz-10' })
    expect(gtagMock).not.toHaveBeenCalled()
  })

  it('never sends the email address to Google', () => {
    reportSignupConversion({ businessId: 'biz-11', email: 'customer@example.com' })
    const payload = gtagMock.mock.calls[0]?.[2]
    expect(JSON.stringify(payload)).not.toContain('customer@example.com')
    expect(payload).not.toHaveProperty('email')
  })
})

describe('buildGoogleAdsInitSnippet', () => {
  it('disables ad personalization (remarketing) while keeping measurement', async () => {
    const { buildGoogleAdsInitSnippet } = await loadModule()
    const snippet = buildGoogleAdsInitSnippet(ADS_ID)
    expect(snippet).toContain(`gtag('config', '${ADS_ID}'`)
    expect(snippet).toContain('allow_ad_personalization_signals: false')
  })

  it('does not enable enhanced conversions or user data collection', async () => {
    const { buildGoogleAdsInitSnippet } = await loadModule()
    const snippet = buildGoogleAdsInitSnippet(ADS_ID)
    expect(snippet).not.toContain('allow_enhanced_conversions')
    expect(snippet).not.toContain('user_data')
  })
})
