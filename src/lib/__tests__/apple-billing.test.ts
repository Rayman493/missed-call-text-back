/**
 * Apple In-App Purchase — regression & contract tests.
 *
 * Covers:
 *  - Entitlement state mapping (real unit tests on mapAppleEntitlement).
 *  - JWS x5c chain verification against a generated root→intermediate→leaf
 *    fixture (real signature checks — tampered data must fail closed).
 *  - appAccountToken deterministic derivation (client/server parity).
 *  - Database migration shape (provider CHECK, unique index, ASSN ledger,
 *    owner-only trigger columns).
 *  - Route wiring (verify-transaction auth shape, ASSN idempotency +
 *    other-provider guard).
 *  - Cross-provider guards (Stripe webhook + RTDN skip native-managed).
 *  - Entry-point wiring (iOS dispatches through the shared orchestrator;
 *    iOS never reaches Stripe checkout).
 */

import { describe, it, expect } from 'vitest'
import { createSign, generateKeyPairSync } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import {
  mapAppleEntitlement,
  APPLE_SUBSCRIPTION_STATUS,
  APPLE_OFFER_TYPE,
  appleAppAccountTokenForUser,
} from '@/lib/apple/billing-service'
import { verifyAppleJws, verifyX5cChain, decodeAppleJwsUnsafe } from '@/lib/apple/jws'

const root = process.cwd()
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

/* ---------- 1. Entitlement state mapping (pure function) ---------- */

const TX_BASE = {
  transactionId: '2000000000000001',
  originalTransactionId: '2000000000000000',
  bundleId: 'com.replyflowhq.app',
  productId: 'com.replyflowhq.monthly',
  purchaseDate: Date.now() - 86400000,
  expiresDate: Date.now() + 86400000,
  type: 'Auto-Renewable Subscription',
  environment: 'Sandbox',
}

const data = (over: Partial<{ status: number; transactionInfo: any; renewalInfo: any }> = {}) => ({
  status: over.status ?? APPLE_SUBSCRIPTION_STATUS.ACTIVE,
  transactionInfo: { ...TX_BASE, ...(over.transactionInfo ?? {}) },
  renewalInfo: over.renewalInfo === undefined
    ? { autoRenewStatus: 1, originalTransactionId: TX_BASE.originalTransactionId }
    : over.renewalInfo,
})

describe('mapAppleEntitlement', () => {
  it('ACTIVE auto-renewing paid → active', () => {
    const m = mapAppleEntitlement(data(), { isTrial: false })
    expect(m.status).toBe('active')
    expect(m.cancelAtPeriodEnd).toBe(false)
    expect(m.currentPeriodEnd).toBe(new Date(TX_BASE.expiresDate).toISOString())
  })

  it('ACTIVE with autoRenewStatus 0 → active canceling at period end', () => {
    const m = mapAppleEntitlement(data({ renewalInfo: { autoRenewStatus: 0 } }), { isTrial: false })
    expect(m.status).toBe('active')
    expect(m.cancelAtPeriodEnd).toBe(true)
  })

  it('ACTIVE introductory offer → trialing', () => {
    const m = mapAppleEntitlement(
      data({ transactionInfo: { offerType: APPLE_OFFER_TYPE.INTRODUCTORY } }),
      { isTrial: true }
    )
    expect(m.status).toBe('trialing')
  })

  it('intro transaction but isTrial false → active (post-renewal truth)', () => {
    const m = mapAppleEntitlement(
      data({ transactionInfo: { offerType: APPLE_OFFER_TYPE.INTRODUCTORY } }),
      { isTrial: false }
    )
    expect(m.status).toBe('active')
  })

  it('ACTIVE but expiresDate in the past → active maps to currentPeriodEnd (not trialing)', () => {
    const past = Date.now() - 1000
    const m = mapAppleEntitlement(
      data({ transactionInfo: { expiresDate: past, offerType: APPLE_OFFER_TYPE.INTRODUCTORY } }),
      { isTrial: true }
    )
    expect(m.status).toBe('active')
  })

  it('BILLING_GRACE → active through gracePeriodExpiresDate', () => {
    const grace = Date.now() + 3 * 86400000
    const m = mapAppleEntitlement(
      data({ status: APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE, renewalInfo: { autoRenewStatus: 1, gracePeriodExpiresDate: grace } }),
      { isTrial: false }
    )
    expect(m.status).toBe('active')
    expect(m.currentPeriodEnd).toBe(new Date(grace).toISOString())
  })

  it('BILLING_RETRY → past_due', () => {
    const m = mapAppleEntitlement(data({ status: APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY }), { isTrial: false })
    expect(m.status).toBe('past_due')
  })

  it('EXPIRED → canceled honoring expiresDate', () => {
    const m = mapAppleEntitlement(data({ status: APPLE_SUBSCRIPTION_STATUS.EXPIRED }), { isTrial: false })
    expect(m.status).toBe('canceled')
    expect(m.currentPeriodEnd).toBe(new Date(TX_BASE.expiresDate).toISOString())
  })

  it('REVOKED status → canceled immediately at revocationDate', () => {
    const revDate = Date.now() - 3600000
    const m = mapAppleEntitlement(
      data({ status: APPLE_SUBSCRIPTION_STATUS.REVOKED, transactionInfo: { revocationDate: revDate } }),
      { isTrial: false }
    )
    expect(m.status).toBe('canceled')
    expect(m.currentPeriodEnd).toBe(new Date(revDate).toISOString())
  })

  it('revocationDate present even under ACTIVE status → canceled (refund wins)', () => {
    const m = mapAppleEntitlement(
      data({ transactionInfo: { revocationDate: Date.now() } }),
      { isTrial: false }
    )
    expect(m.status).toBe('canceled')
  })

  it('forceRevoked → canceled regardless of status', () => {
    const m = mapAppleEntitlement(data(), { isTrial: false, forceRevoked: true })
    expect(m.status).toBe('canceled')
  })

  it('unknown status → null (never entitled)', () => {
    const m = mapAppleEntitlement(data({ status: 99 }), { isTrial: false })
    expect(m.status).toBeNull()
  })
})

/* ---------- 2. appAccountToken derivation ---------- */

describe('appleAppAccountTokenForUser', () => {
  it('derives a deterministic UUID v5-shaped token', () => {
    const a = appleAppAccountTokenForUser('user-123')
    const b = appleAppAccountTokenForUser('user-123')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('different users produce different tokens', () => {
    expect(appleAppAccountTokenForUser('user-1')).not.toBe(appleAppAccountTokenForUser('user-2'))
  })
})

/* ---------- 3. JWS verification with generated fixture chain ---------- */

// Test fixture chain generated with openssl (root CA → intermediate → leaf,
// all P-256). Private keys are test-only material — never real Apple certs.
const TEST_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIIBUzCB+6ADAgECAhQfhTo14iGQNlt6BRU9VrFSF/bG/TAKBggqhkjOPQQDAjAA
MB4XDTI2MTAxNjAxMjcyMloXDTM2MTAxMzAxMjcyMlowADBZMBMGByqGSM49AgEG
CCqGSM49AwEHA0IABHUqMRieqXXWSnHXApvmh/qz3Bx/cUr2yFXTVZZgDF3/5dMX
sWgWyIs2Wp4KI8HndYBgHxwkRCFvMxPwto2ejLujUzBRMB0GA1UdDgQWBBQa2rg2
dK3HdU9e93ouGRq9rrCu0jAfBgNVHSMEGDAWgBQa2rg2dK3HdU9e93ouGRq9rrCu
0jAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCICTA3zWWlvYwQhEz
L4RMRm49fdZtW/q46f4M7gk3AOlGAiB4cACm5RdsOKQFy7OeYU1NpCA8PPyPKpoW
8XpX8OPlnQ==
-----END CERTIFICATE-----`

const TEST_INTER_PEM = `-----BEGIN CERTIFICATE-----
MIIBaDCCAQ6gAwIBAgIUPa44LzaH21wDqOzKE868woWMs7QwCgYIKoZIzj0EAwIw
ADAeFw0yNjEwMTYwMTI3MjJaFw0yNzEwMTYwMTI3MjJaMAAwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAATVC2Zr7Nhj1WRHJ7U9zOkUzm0gkwJnN2TktUkP3L37zhY1
Fn3H8DDkZxO4LeSZLySPoj5P0fNSAR7U6wOV8di/o2YwZDASBgNVHRMBAf8ECDAG
AQH/AgEAMA4GA1UdDwEB/wQEAwIBBjAdBgNVHQ4EFgQUPmlTaH0gkKiJ2snuNiHv
D2hXad4wHwYDVR0jBBgwFoAUGtq4NnStx3VPXvd6Lhkava6wrtIwCgYIKoZIzj0E
AwIDSAAwRQIgPhclKnqvvUfESslWignuVgD3FfWrXuc6ds2T4KhYLlgCIQDgCR0U
MY4G3xnf2m0tV6zCbelmd5TaGyR+dFy40tOVVg==
-----END CERTIFICATE-----`

const TEST_LEAF_PEM = `-----BEGIN CERTIFICATE-----
MIIBYzCCAQigAwIBAgIUbbzbNT8fB3hHp5O8F8qIAdhownUwCgYIKoZIzj0EAwIw
ADAeFw0yNjEwMTYwMTI3MjJaFw0yNzEwMTYwMTI3MjJaMAAwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAAT3/+lt+T/bp+pob6m5Qgfiy2GknqgngA5RvJvAjOOV32hx
Tstg/H3kAoBWnB22Dea2rYKzv3PgmlIzCRJJ/96Fo2AwXjAMBgNVHRMBAf8EAjAA
MA4GA1UdDwEB/wQEAwIHgDAdBgNVHQ4EFgQUiNNrdjLpwsdRBDKHWf6bLzcM+DQw
HwYDVR0jBBgwFoAUPmlTaH0gkKiJ2snuNiHvD2hXad4wCgYIKoZIzj0EAwIDSQAw
RgIhAKo4IobHXK+GkvSaJ2ajWjnetMWNtMkYLLZT/XYpEeIcAiEAg2DpjouWkqv7
MeOqG3h5J5P7eoBHMapaT/ReYJJ0M4A=
-----END CERTIFICATE-----`

const TEST_LEAF_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWlV4Ovdp3n4ek3Fk
PLd014zmjIfxkWWw29Rmq1fl1m+hRANCAAT3/+lt+T/bp+pob6m5Qgfiy2Gknqgn
gA5RvJvAjOOV32hxTstg/H3kAoBWnB22Dea2rYKzv3PgmlIzCRJJ/96F
-----END PRIVATE KEY-----`

const pemToDerB64 = (pem: string) =>
  pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')

const b64u = (data: string | Buffer) =>
  Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function signTestJws(payload: object, opts: { x5c?: string[]; alg?: string; key?: string } = {}): string {
  const header = {
    alg: opts.alg ?? 'ES256',
    x5c: opts.x5c ?? [pemToDerB64(TEST_LEAF_PEM), pemToDerB64(TEST_INTER_PEM)],
  }
  const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`
  const signer = createSign('SHA256')
  signer.update(unsigned)
  signer.end()
  const sig = signer.sign({ key: opts.key ?? TEST_LEAF_KEY, dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${b64u(sig)}`
}

describe('verifyAppleJws', () => {
  const payload = { transactionId: 't1', originalTransactionId: 'o1', bundleId: 'com.replyflowhq.app' }

  it('verifies a correctly-signed JWS and returns the payload', () => {
    const jws = signTestJws(payload)
    const result = verifyAppleJws<typeof payload>(jws, { rootPem: TEST_ROOT_PEM })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.payload.originalTransactionId).toBe('o1')
    }
  })

  it('rejects a tampered payload (signature mismatch)', () => {
    const jws = signTestJws(payload)
    const tampered = jws.split('.')
    tampered[1] = b64u(JSON.stringify({ ...payload, productId: 'evil' }))
    const result = verifyAppleJws(tampered.join('.'), { rootPem: TEST_ROOT_PEM })
    expect('error' in result).toBe(true)
  })

  it('rejects a chain not anchored to the pinned root', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jws = signTestJws(payload, { key: other.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() })
    const result = verifyAppleJws(jws, { rootPem: TEST_ROOT_PEM })
    expect('error' in result).toBe(true)
  })

  it('rejects a leaf-only x5c (no intermediate)', () => {
    const jws = signTestJws(payload, { x5c: [pemToDerB64(TEST_LEAF_PEM)] })
    const result = verifyX5cChain([pemToDerB64(TEST_LEAF_PEM)], TEST_ROOT_PEM)
    expect('error' in result).toBe(true)
    expect('error' in verifyAppleJws(jws, { rootPem: TEST_ROOT_PEM })).toBe(true)
  })

  it('rejects non-ES256 alg', () => {
    const jws = signTestJws(payload, { alg: 'RS256' })
    const result = verifyAppleJws(jws, { rootPem: TEST_ROOT_PEM })
    expect('error' in result).toBe(true)
  })

  it('decodeAppleJwsUnsafe exposes payload without verification', () => {
    const jws = signTestJws(payload)
    const decoded = decodeAppleJwsUnsafe<typeof payload>(jws)
    expect('error' in decoded).toBe(false)
    if (!('error' in decoded)) expect(decoded.payload.transactionId).toBe('t1')
  })
})

/* ---------- 4. Migration shape ---------- */

describe('apple billing migration', () => {
  const migration = read('supabase/migrations/20261015000000_apple_billing.sql')

  it('extends the provider CHECK to include apple', () => {
    expect(migration).toContain("subscription_provider IN ('stripe', 'google_play', 'apple')")
  })

  it('adds all apple_* business columns', () => {
    for (const col of [
      'apple_original_transaction_id',
      'apple_transaction_id',
      'apple_product_id',
      'apple_bundle_id',
      'apple_environment',
      'apple_is_trial',
      'apple_revoked_at',
      'apple_last_verified_at',
    ]) {
      expect(migration).toContain(col)
    }
  })

  it('uniquely constrains originalTransactionId', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS businesses_apple_original_transaction_id_key')
    expect(migration).toContain('ON businesses (apple_original_transaction_id)')
  })

  it('creates the ASSN event ledger with unique message_id', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS apple_assn_events')
    expect(migration).toContain('message_id TEXT NOT NULL UNIQUE')
    expect(migration).toContain('ALTER TABLE apple_assn_events ENABLE ROW LEVEL SECURITY')
  })

  it('appends apple columns to the owner-only field guard', () => {
    expect(migration).toContain('new.apple_original_transaction_id is distinct from old.apple_original_transaction_id')
    expect(migration).toContain('new.apple_last_verified_at is distinct from old.apple_last_verified_at')
  })

  it('is additive only — never drops or alters existing data', () => {
    expect(migration).not.toMatch(/DROP TABLE/i)
    expect(migration).not.toMatch(/DROP COLUMN/i)
    expect(migration).not.toMatch(/UPDATE businesses/i)
    expect(migration).not.toMatch(/DELETE FROM/i)
  })
})

/* ---------- 5. Route wiring ---------- */

describe('apple verify-transaction route', () => {
  const route = read('src/app/api/apple/verify-transaction/route.ts')

  it('requires cookie-session authentication', () => {
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain('Authentication required')
  })

  it('verifies the signedTransactionInfo JWS before use', () => {
    expect(route).toContain('verifyAppleJws')
    expect(route).toContain('Invalid transaction signature')
  })

  it('never grants access from client fields alone — always re-queries Apple', () => {
    expect(route).toContain('verifyAndApplyTransaction')
    expect(route).not.toContain("subscription_status: 'active'")
  })

  it('supports reconcile without a client JWS (stored identity)', () => {
    expect(route).toContain('reconcile')
    expect(route).toContain('apple_original_transaction_id')
  })
})

describe('apple ASSN route', () => {
  const route = read('src/app/api/apple/assn/route.ts')

  it('authenticates via JWS signature (no shared secret)', () => {
    expect(route).toContain('decodeAndVerifyNotification')
    expect(route).toContain('Invalid signature')
  })

  it('claims events idempotently by notificationUUID', () => {
    expect(route).toContain('apple_assn_events')
    expect(route).toContain('notificationUUID')
    expect(route).toContain('alreadyProcessed')
  })

  it('skips businesses managed by stripe or google_play unless Apple is live', () => {
    expect(route).toContain("subscription_provider === 'stripe' || business.subscription_provider === 'google_play'")
    expect(route).toContain('fetchSubscriptionStatus')
  })

  it('force-revokes on REVOKE/REFUND notification types', () => {
    expect(route).toContain("'REVOKE', 'REFUND'")
    expect(route).toContain('forceRevoked')
  })
})

/* ---------- 6. Cross-provider guard wiring ---------- */

describe('cross-provider guards', () => {
  it('stripe webhook skips native-managed businesses', () => {
    const webhook = read('src/app/api/stripe/webhook/route.ts')
    expect(webhook).toContain('isNativeManagedBilling')
    expect(webhook).toContain('apple_original_transaction_id')
    expect(webhook).not.toContain('isGooglePlayManagedBilling(business)')
  })

  it('rtdn route skips apple-managed businesses', () => {
    const rtdn = read('src/app/api/google-play/rtdn/route.ts')
    expect(rtdn).toContain("subscription_provider === 'apple'")
  })

  it('subscription-utils exposes apple evidence helpers', () => {
    const utils = read('src/lib/subscription-utils.ts')
    expect(utils).toContain('hasAppleBillingEvidence')
    expect(utils).toContain('isAppleManagedBilling')
    expect(utils).toContain('isNativeManagedBilling')
    expect(utils).toContain('hasNativeBillingEvidence')
  })

  it('abandon-signup refuses accounts holding an Apple subscription', () => {
    const route = read('src/app/api/auth/abandon-signup/route.ts')
    expect(route).toContain('apple_original_transaction_id')
  })
})

/* ---------- 7. Entry-point wiring ---------- */

describe('native purchase dispatch', () => {
  it('orchestrator dispatches iOS to the Apple flow', () => {
    const orch = read('src/lib/subscription-purchase.ts')
    expect(orch).toContain('isNativeIOS()')
    expect(orch).toContain('runApplePurchase')
    expect(orch).toContain('purchaseAppleSubscription')
    expect(orch).toContain('reconcileApplePurchases')
  })

  it('billing.ts routes apple evidence to App Store management', () => {
    const billing = read('src/lib/billing.ts')
    expect(billing).toContain('hasAppleBillingEvidence')
    expect(billing).toContain('getAppleSubscriptionManageUrl')
    expect(billing).toContain('isNativeIOS()')
  })

  it('external-return reconciles apple purchases on iOS resume', () => {
    const handler = read('src/lib/external-return-handler.ts')
    expect(handler).toContain('reconcileApplePurchases')
    expect(handler).toContain("'ios'")
  })

  it('restore purchases entry exists in settings for iOS', () => {
    const settings = read('src/components/SettingsContent.tsx')
    expect(settings).toContain('restoreApplePurchases')
    expect(settings).toContain('Restore Purchases')
  })

  it('ios plugin registered in the Xcode project', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
    expect(pbx).toContain('ReplyflowAppleBillingPlugin.swift')
    const plugin = read('ios/App/App/ReplyflowAppleBillingPlugin.swift')
    expect(plugin).toContain('CAPBridgedPlugin')
    expect(plugin).toContain('launchPurchase')
    expect(plugin).toContain('queryEntitlements')
    expect(plugin).toContain('appAccountToken')
    expect(plugin).toContain('AppStore.sync()')
  })

  it('js registerPlugin name matches the plugin jsName and is registered in AppDelegate', () => {
    // registerPlugin(<name>) resolves against the Swift CAPBridgedPlugin
    // jsName (not identifier) — see ReplyflowStripeConnectPlugin for the
    // same pattern. A drift here makes every plugin call reject with
    // "not implemented on ios".
    const plugin = read('ios/App/App/ReplyflowAppleBillingPlugin.swift')
    const jsName = plugin.match(/jsName = "([^"]+)"/)?.[1]
    expect(jsName).toBeTruthy()
    const bridge = read('src/lib/apple-billing.ts')
    expect(bridge).toContain(`registerPlugin<AppleBillingPlugin>('${jsName}')`)
    // App-local plugins are manually registered in capacitorDidLoad().
    const appDelegate = read('ios/App/App/AppDelegate.swift')
    expect(appDelegate).toContain('ReplyflowAppleBillingPlugin()')
    expect(appDelegate).toContain('registerPluginInstance(appleBillingPlugin)')
  })
})
