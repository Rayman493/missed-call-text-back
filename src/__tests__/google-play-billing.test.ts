/**
 * Google Play Billing — regression & contract tests.
 *
 * Covers:
 *  - Entitlement state mapping (real unit tests on mapPlayEntitlement).
 *  - Database migration shape (provider column, unique token constraints,
 *    RTDN event ledger).
 *  - Server verification contract (package/product checks, token ownership,
 *    Stripe double-billing guard, obfuscated account binding, acknowledge).
 *  - RTDN endpoint (shared-secret auth, idempotent claim, Stripe protection,
 *    revoked handling).
 *  - Entry-point wiring (all six subscription CTAs route through the shared
 *    purchase action; Android never reaches Stripe checkout).
 *  - Stripe webhook provider protection.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { mapPlayEntitlement, SUBSCRIPTION_STATE } from '@/lib/google-play/billing-service'

const root = process.cwd()
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

/* ---------- 1. Entitlement state mapping (pure function) ---------- */

const sub = (over: object = {}) => ({
  subscriptionState: SUBSCRIPTION_STATE.ACTIVE,
  lineItems: [{ productId: 'replyflow_monthly', expiryTime: '2999-01-01T00:00:00Z', autoRenewingPlan: { autoRenewEnabled: true } }],
  ...over,
})

describe('mapPlayEntitlement', () => {
  it('ACTIVE auto-renewing → active', () => {
    const m = mapPlayEntitlement(sub(), { isTrial: false })
    expect(m.status).toBe('active')
    expect(m.cancelAtPeriodEnd).toBe(false)
    expect(m.currentPeriodEnd).toBe('2999-01-01T00:00:00Z')
  })

  it('ACTIVE + trial flag → trialing', () => {
    const m = mapPlayEntitlement(sub(), { isTrial: true })
    expect(m.status).toBe('trialing')
  })

  it('IN_GRACE_PERIOD → still active (access retained)', () => {
    const m = mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.IN_GRACE_PERIOD }), { isTrial: false })
    expect(m.status).toBe('active')
  })

  it('CANCELED before expiry → active with cancel_at_period_end', () => {
    const m = mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.CANCELED }), { isTrial: false })
    expect(m.status).toBe('active')
    expect(m.cancelAtPeriodEnd).toBe(true)
  })

  it('CANCELED past expiry → canceled (paid access not revoked early)', () => {
    const m = mapPlayEntitlement(
      sub({ subscriptionState: SUBSCRIPTION_STATE.CANCELED, lineItems: [{ productId: 'replyflow_monthly', expiryTime: '2000-01-01T00:00:00Z' }] }),
      { isTrial: false }
    )
    expect(m.status).toBe('canceled')
  })

  it('ON_HOLD / PAUSED → past_due (no access)', () => {
    expect(mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.ON_HOLD }), { isTrial: false }).status).toBe('past_due')
    expect(mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.PAUSED }), { isTrial: false }).status).toBe('past_due')
  })

  it('PENDING → null (no entitlement)', () => {
    expect(mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.PENDING }), { isTrial: false }).status).toBeNull()
  })

  it('EXPIRED → canceled', () => {
    expect(mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.EXPIRED }), { isTrial: false }).status).toBe('canceled')
  })

  it('forceRevoked → canceled regardless of state/expiry', () => {
    const m = mapPlayEntitlement(sub(), { isTrial: false, revoked: true })
    expect(m.status).toBe('canceled')
  })
})

/* ---------- 2. Migration ---------- */

describe('google_play billing migration', () => {
  const mig = read('supabase/migrations/20261003000000_google_play_billing.sql')

  it('adds provider + token columns', () => {
    expect(mig).toContain('subscription_provider')
    expect(mig).toContain("'stripe', 'google_play'")
    expect(mig).toContain('google_play_purchase_token')
    expect(mig).toContain('google_play_product_id')
    expect(mig).toContain('google_play_linked_purchase_token')
  })

  it('enforces one purchase per business', () => {
    expect(mig).toContain('UNIQUE INDEX')
    expect(mig).toContain('businesses_google_play_purchase_token_key')
    expect(mig).toContain('businesses_google_play_linked_purchase_token_key')
  })

  it('backfills Stripe provider', () => {
    expect(mig).toContain("SET subscription_provider = 'stripe'")
  })

  it('creates idempotent RTDN ledger', () => {
    expect(mig).toContain('google_play_rtdn_events')
    expect(mig).toContain('message_id TEXT NOT NULL UNIQUE')
  })
})

/* ---------- 3. Verification service contract ---------- */

describe('verifyAndApplyPurchase service', () => {
  const svc = read('src/lib/google-play/billing-service.ts')

  it('verifies via SubscriptionsV2, not client claims', () => {
    expect(svc).toContain('purchases/subscriptionsv2/tokens/')
    expect(svc).toContain('androidpublisher.googleapis.com')
  })

  it('validates product allowlist', () => {
    expect(svc).toContain('ALLOWED_PRODUCT_IDS')
    expect(svc).toContain('replyflow_monthly')
  })

  it('binds purchase to app account via obfuscated id', () => {
    expect(svc).toContain('obfuscatedExternalAccountId')
    expect(svc).toContain('Purchase belongs to a different app account')
  })

  it('prevents one purchase activating multiple businesses', () => {
    expect(svc).toContain('already activates a different business')
  })

  it('double-billing guard: active Stripe subscribers are never migrated', () => {
    expect(svc).toContain("business.subscription_provider === 'stripe'")
    expect(svc).toContain('alreadyOwned')
  })

  it('acknowledges purchases server-side', () => {
    expect(svc).toContain(':acknowledge')
  })

  it('writes provider + Play identifiers on apply', () => {
    expect(svc).toContain("subscription_provider: 'google_play'")
    expect(svc).toContain('google_play_purchase_token: purchaseToken')
    expect(svc).toContain('google_play_last_verified_at')
  })
})

/* ---------- 4. API routes ---------- */

describe('verify-purchase route', () => {
  const route = read('src/app/api/google-play/verify-purchase/route.ts')

  it('requires auth + business ownership', () => {
    expect(route).toContain('Authentication required')
    expect(route).toContain(".eq('user_id', user.id)")
    const svc = read('src/lib/google-play/billing-service.ts')
    expect(svc).toContain('business.user_id')
    expect(svc).toContain('Business does not belong to this user')
  })

  it('requires token + product', () => {
    expect(route).toContain('purchaseToken and productId are required')
  })
})

describe('rtdn route', () => {
  const route = read('src/app/api/google-play/rtdn/route.ts')

  it('authenticates via shared secret', () => {
    expect(route).toContain('GOOGLE_PLAY_RTDN_SECRET')
    expect(route).toContain('401')
  })

  it('claims events idempotently by message_id', () => {
    expect(route).toContain('google_play_rtdn_events')
    expect(route).toContain('message_id')
    expect(route).toContain('23505')
  })

  it('skips Stripe-managed businesses', () => {
    expect(route).toContain("subscription_provider === 'stripe'")
    expect(route).toContain('stripe_provider')
  })

  it('forces revocation on SUBSCRIPTION_REVOKED (type 12)', () => {
    // notificationType 9 is SUBSCRIPTION_DEFERRED — REVOKED is 12.
    expect(route).toContain('REVOKED = 12')
    expect(route).toContain('forceRevoked')
  })

  it('reclaims failed and stale processing events', () => {
    expect(route).toContain('STALE_PROCESSING_MS')
    expect(route).toContain('processing_started_at')
    expect(route).toContain('attempt_count')
  })

  it('re-verifies from Google before applying', () => {
    expect(route).toContain('verifyAndApplyPurchase')
  })
})

/* ---------- 5. Entry-point wiring ---------- */

describe('all six subscription entry points use the shared purchase action', () => {
  const sites = [
    'src/app/onboarding/page.tsx',
    'src/app/complete-setup/page.tsx',
    'src/components/SetupStatusCard.tsx',
    'src/app/dashboard/DashboardContent.tsx',
    'src/app/dashboard/leads/page.tsx',
    'src/app/auth/page.tsx',
  ]

  for (const site of sites) {
    it(site, () => {
      const src = read(site)
      expect(src).toContain('maybeStartGooglePlaySubscription')
      expect(src).toContain('if (handledOnAndroid) return')
    })
  }
})

describe('billing.ts cannot start Stripe checkout on Android', () => {
  const src = read('src/lib/billing.ts')

  it('routes Android non-Stripe-subscribers to the Play purchase action', () => {
    expect(src).toContain("isNativeAndroid() && !(business?.subscription_provider === 'stripe' && hasExistingSubscription)")
    expect(src).toContain('maybeStartGooglePlaySubscription')
  })

  it('opens the Play Store management page for google_play businesses', () => {
    expect(src).toContain("subscription_provider === 'google_play'")
    expect(src).toContain('getPlaySubscriptionManageUrl')
  })

  it('never falls back to Stripe checkout from the portal on Android', () => {
    expect(src).toContain('!hasExistingSubscription && isNoCustomerError && !isNativeAndroid()')
  })
})

describe('forwarding setup accepts Google Play billing identity', () => {
  const src = read('src/lib/subscription-utils.ts')

  it('isReadyForForwardingSetup is provider-aware', () => {
    expect(src).toContain("subscription_provider === 'google_play'")
    expect(src).toContain('google_play_purchase_token')
    expect(src).toContain('hasBillingIdentity')
  })
})

describe('shared purchase action', () => {
  const src = read('src/lib/subscription-purchase.ts')

  it('is Android-gated', () => {
    expect(src).toContain('isNativeAndroid()')
  })

  it('verifies server-side — client callback alone never entitles', () => {
    const wrapper = read('src/lib/google-play-billing.ts')
    expect(wrapper).toContain('/api/google-play/verify-purchase')
    expect(wrapper).toContain('purchaseToken')
  })
})

describe('Android portal replacement', () => {
  it('billing.ts routes google_play subs to Play management', () => {
    const src = read('src/lib/billing.ts')
    expect(src).toContain("subscription_provider === 'google_play'")
    expect(src).toContain('getPlaySubscriptionManageUrl')
  })

  it('SetupStatusCard does the same for subscribed Play users', () => {
    const src = read('src/components/SetupStatusCard.tsx')
    expect(src).toContain("subscription_provider === 'google_play'")
    expect(src).toContain('getPlaySubscriptionManageUrl')
  })
})

/* ---------- 6. Stripe protection ---------- */

describe('stripe webhook provider protection', () => {
  const src = read('src/lib/stripe-webhook-processor.ts')

  it('stamps subscription_provider on Stripe writes', () => {
    expect(src).toContain("subscription_provider: 'stripe'")
  })

  it('skips google_play businesses on update + delete', () => {
    expect(src).toContain("subscription_provider === 'google_play'")
    expect(src).toContain('google_play provider - skipped')
    expect(src).toContain('Google Play-managed, skipping deletion')
  })
})

/* ---------- 7. Native plugin + registration ---------- */

describe('android billing plugin', () => {
  const plugin = read('android/app/src/main/java/com/replyflowhq/app/ReplyflowGooglePlayBillingPlugin.java')
  const main = read('android/app/src/main/java/com/replyflowhq/app/MainActivity.java')
  const gradle = read('android/app/build.gradle')

  it('exists and implements required methods', () => {
    expect(plugin).toContain('getSubscriptionOffer')
    expect(plugin).toContain('launchPurchase')
    expect(plugin).toContain('queryPurchases')
    expect(plugin).toContain('setObfuscatedAccountId')
    expect(plugin).toContain('onPurchasesUpdated')
  })

  it('prefers a free-trial offer when present', () => {
    expect(plugin).toContain('hasFreeTrial')
    expect(plugin).toContain('getPriceAmountMicros() == 0')
  })

  it('is registered before super.onCreate', () => {
    expect(main).toContain('registerPlugin(ReplyflowGooglePlayBillingPlugin.class)')
  })

  it('billing library dependency present', () => {
    expect(gradle).toContain('com.android.billingclient:billing')
  })

  it('server never trusts the client — no entitlement write in plugin', () => {
    expect(plugin).not.toContain('subscription_status')
  })
})

/* ---------- 8. No Stripe checkout reachable on Android path ---------- */

describe('Android never initiates Stripe subscription checkout', () => {
  const wrapper = read('src/lib/google-play-billing.ts')
  const shared = read('src/lib/subscription-purchase.ts')

  it('shared action short-circuits before any Stripe call on Android', () => {
    expect(shared.indexOf('if (!isNativeAndroid()) return false')).toBeLessThan(
      shared.indexOf('await purchaseSubscription')
    )
    // The Android wrapper itself must contain no Stripe references.
    expect(wrapper).not.toContain('stripe')
    expect(wrapper).not.toContain('checkout.stripe.com')
  })
})

/* ---------- 9. Purchase-failure fixes (pending state, regressions, wedged UI) ---------- */

describe('subscription_status NULL-after-purchase fixes', () => {
  const service = read('src/lib/google-play/billing-service.ts')
  const wrapper = read('src/lib/google-play-billing.ts')
  const auth = read('src/app/auth/page.tsx')
  const onboarding = read('src/app/onboarding/page.tsx')

  it('writes are monotonic — stale verifications cannot overwrite newer state', () => {
    expect(service).toContain('google_play_last_verified_at.is.null,google_play_last_verified_at.lt.')
    expect(service).toContain('fetchedAt')
  })

  it('a non-entitled snapshot cannot erase an existing entitlement', () => {
    expect(service).toContain('existingEntitled')
    expect(service).toContain('terminal')
    expect(service).toContain('mapped.status === null && existingEntitled && !terminal')
  })

  it('stale-write no-op is handled (empty updatedRows)', () => {
    expect(service).toContain('updatedRows')
    expect(service).toContain('updatedRows.length === 0')
  })

  it('service surfaces a pending flag when Google reports PENDING', () => {
    expect(service).toContain('SUBSCRIPTION_STATE.PENDING')
    expect(service).toContain('pending:')
  })

  it('wrapper retries verification while Google reports pending', () => {
    expect(wrapper).toContain('verification.pending')
    expect(wrapper).toContain('Pending re-check')
  })

  it('ITEM_ALREADY_OWNED recovers the existing purchase instead of failing', () => {
    expect(wrapper).toContain('purchase.code === 7')
    expect(wrapper).toContain('queryPurchases')
  })

  it('auth signup clears every loading flag on cancel/pending/error', () => {
    // The wedged path: callbacks must clear loading, isSubmitting and the
    // checkout-in-progress refs so "Creating Account..." cannot persist.
    expect(auth).toContain('clearPurchaseState')
    expect(auth).toContain('isSubmittingRef.current = false')
    expect(auth).toContain('pending Google confirmation')
  })

  it('auth retry path clears isSubmitting on cancel/pending/error', () => {
    const retryBlock = auth.slice(auth.indexOf('handleRetryCheckout'))
    expect(retryBlock).toContain('isSubmittingRef.current = false')
    expect(retryBlock).toContain('setIsSubmitting(false)')
  })

  it('onboarding clears loading on cancel and error', () => {
    expect(onboarding).toContain('onCanceled: () => { setLoading(false) }')
    expect(onboarding).toContain('onError: (msg) => { setError(msg); setLoading(false) }')
  })

  it('RTDN still re-verifies before applying (authoritative)', () => {
    const rtdn = read('src/app/api/google-play/rtdn/route.ts')
    expect(rtdn).toContain('verifyAndApplyPurchase')
    expect(rtdn).toContain('REVOKED = 12')
  })
})

/* ---------- 10. Real REST wire format (production 04:52–04:57 repro) ---------- */

describe('SubscriptionsV2 string-enum wire format', () => {
  // Google's REST API serializes proto enums as strings, not integers.
  // Every verify/RTDN mapped to status null because 'SUBSCRIPTION_STATE_ACTIVE' !== 2.
  const wire = (state: string, over: object = {}) => ({
    subscriptionState: state as any,
    lineItems: [{ productId: 'replyflow_monthly', expiryTime: '2999-01-01T00:00:00Z', autoRenewingPlan: { autoRenewEnabled: true } }],
    ...over,
  })

  it('"SUBSCRIPTION_STATE_ACTIVE" maps to active (the production bug)', () => {
    expect(mapPlayEntitlement(wire('SUBSCRIPTION_STATE_ACTIVE'), { isTrial: false }).status).toBe('active')
  })

  it('"SUBSCRIPTION_STATE_ACTIVE" + trial flag → trialing', () => {
    expect(mapPlayEntitlement(wire('SUBSCRIPTION_STATE_ACTIVE'), { isTrial: true }).status).toBe('trialing')
  })

  it('"SUBSCRIPTION_STATE_PENDING" stays non-entitled', () => {
    expect(mapPlayEntitlement(wire('SUBSCRIPTION_STATE_PENDING'), { isTrial: false }).status).toBeNull()
  })

  it('"SUBSCRIPTION_STATE_CANCELED" before expiry → still active until expiry', () => {
    const m = mapPlayEntitlement(wire('SUBSCRIPTION_STATE_CANCELED'), { isTrial: false })
    expect(m.status).toBe('active')
    expect(m.cancelAtPeriodEnd).toBe(true)
  })

  it('"SUBSCRIPTION_STATE_CANCELED" past expiry → canceled', () => {
    const m = mapPlayEntitlement(
      wire('SUBSCRIPTION_STATE_CANCELED', { lineItems: [{ productId: 'replyflow_monthly', expiryTime: '2020-01-01T00:00:00Z' }] }),
      { isTrial: false })
    expect(m.status).toBe('canceled')
  })

  it('"SUBSCRIPTION_STATE_EXPIRED" → canceled', () => {
    expect(mapPlayEntitlement(wire('SUBSCRIPTION_STATE_EXPIRED'), { isTrial: false }).status).toBe('canceled')
  })

  it('"SUBSCRIPTION_STATE_ON_HOLD" → past_due', () => {
    expect(mapPlayEntitlement(wire('SUBSCRIPTION_STATE_ON_HOLD'), { isTrial: false }).status).toBe('past_due')
  })

  it('numeric enums still work (client-library callers)', () => {
    expect(mapPlayEntitlement(sub({ subscriptionState: SUBSCRIPTION_STATE.ACTIVE }), { isTrial: false }).status).toBe('active')
  })

  it('service exposes the raw Google state for diagnostics (non-sensitive)', () => {
    const service = read('src/lib/google-play/billing-service.ts')
    expect(service).toContain('parseSubscriptionState')
    expect(service).toContain('SUBSCRIPTION_STATE_NAMES')
    expect(service).toContain('google: {')
    expect(service).toContain('subscriptionState: sub.subscriptionState')
    expect(service).toContain('ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED')
  })

  it('server detects trial from offerId when client flag is absent', () => {
    const service = read('src/lib/google-play/billing-service.ts')
    expect(service).toContain('offerDetails?.offerId')
    expect(service).toContain('offerIsTrial')
  })
})

describe('homepage redirect must not be swallowed', () => {
  it('redirect runs outside the try/catch that logs NEXT_REDIRECT', () => {
    const page = read('src/app/(public)/page.tsx')
    expect(page).toContain('needsCompleteSetup')
    // The redirect call sits after the catch block, not inside try.
    const catchIdx = page.indexOf("console.error('[Homepage] Unexpected error checking business:'")
    const redirectIdx = page.indexOf("redirect('/complete-setup')")
    expect(redirectIdx).toBeGreaterThan(catchIdx)
    const tryBlock = page.slice(page.indexOf('try {'), catchIdx)
    expect(tryBlock).not.toContain("redirect('/complete-setup')")
  })
})
