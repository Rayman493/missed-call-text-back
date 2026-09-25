# Google Play Billing — Android Implementation Report

Implements standard Google Play Billing for new Android subscriptions so the app can be submitted without an alternative-billing or external-links program. Stripe remains the provider for web and iOS; Stripe Connect, customer payment requests, invoices, and Tap to Pay are untouched.

---

## 1. Files changed

**New files**
| File | Purpose |
|---|---|
| `supabase/migrations/20261003000000_google_play_billing.sql` | Provider column, Play token columns, uniqueness constraints, RTDN ledger |
| `src/lib/google-play/auth.ts` | Service-account JWT → Google OAuth access token (raw REST, no new deps) |
| `src/lib/google-play/billing-service.ts` | SubscriptionsV2 fetch, entitlement mapping, idempotent apply, acknowledge |
| `src/app/api/google-play/verify-purchase/route.ts` | Authenticated purchase-token verification endpoint |
| `src/app/api/google-play/rtdn/route.ts` | Pub/Sub Real-time Developer Notifications endpoint |
| `src/lib/google-play-billing.ts` | WebView wrapper: offer query, purchase, reconcile, Play manage URL |
| `src/lib/subscription-purchase.ts` | Shared `maybeStartGooglePlaySubscription` action |
| `android/app/src/main/java/com/replyflowhq/app/ReplyflowGooglePlayBillingPlugin.java` | BillingClient 8.0.0 native plugin |
| `src/__tests__/google-play-billing.test.ts` | 45-test contract/unit suite |

**Modified files**
| File | Change |
|---|---|
| `android/app/build.gradle` | `com.android.billingclient:billing:8.0.0` |
| `android/.../MainActivity.java` | `registerPlugin(ReplyflowGooglePlayBillingPlugin.class)` before `super.onCreate` |
| `src/app/onboarding/page.tsx` | Android branch → Play sheet before Stripe |
| `src/app/complete-setup/page.tsx` | Same |
| `src/components/SetupStatusCard.tsx` | Same + Play-manage link for subscribed Play users |
| `src/app/dashboard/DashboardContent.tsx` | Same |
| `src/app/dashboard/leads/page.tsx` | Same |
| `src/app/auth/page.tsx` | Same ×3 checkout call sites |
| `src/lib/billing.ts` | `subscription_provider === 'google_play'` → Play Store management URL instead of Stripe portal |
| `src/lib/subscription.ts` | `hasValidSubscription`/`hasInvalidTrialState` + 3 display helpers accept optional `SubscriptionIdentity`; Play subs validate via purchase token |
| `src/lib/stripe-webhook-processor.ts` | Writes `subscription_provider:'stripe'`; skips `google_play` businesses on updated/deleted events |
| `src/lib/external-return-handler.ts` | `reconcilePlayPurchases()` on every Android app resume |
| `src/lib/types.ts` | `subscription_provider` + `google_play_*` fields on `Business` |
| `src/components/CompactSetupHealth.tsx`, `SetupHealth.tsx`, `useSetupHealth.ts`, `SettingsContent.tsx`, `TestSetupModal.tsx` | Pass `SubscriptionIdentity` into subscription helpers |

## 2. Database changes — `20261003000000_google_play_billing.sql`

**businesses** (all additive):
`subscription_provider TEXT CHECK IN ('stripe','google_play')`, `google_play_purchase_token`, `google_play_product_id`, `google_play_order_id`, `google_play_linked_purchase_token`, `google_play_package_name`, `google_play_is_trial`, `google_play_revoked_at`, `google_play_last_verified_at`.

**Uniqueness**: partial unique indexes on `google_play_purchase_token` and `google_play_linked_purchase_token` → one Play purchase can never activate two businesses (DB-level, race-safe).

**Backfill**: `subscription_provider='stripe'` for all rows with `stripe_subscription_id`. Existing statuses/columns untouched.

**New table** `google_play_rtdn_events` — `message_id UNIQUE` ledger mirroring `stripe_webhook_events` (claim → process → processed/failed, reclaimable).

**Apply**: `supabase db push` or SQL editor. Idempotent (`IF NOT EXISTS` / `IF NOT EXISTS` indexes / guarded UPDATE).

## 3. Android billing architecture

```
WebView CTA (6 sites)
  → maybeStartGooglePlaySubscription()          [isNativeAndroid() gate]
  → ReplyflowGooglePlayBilling (Capacitor plugin, BillingClient 8.0.0)
      getSubscriptionOffer  → queryProductDetailsAsync(SUBS), picks offer w/ free-trial pricing phase, falls back to base plan
      launchPurchase        → launchBillingFlow + setObfuscatedAccountId(sha256(userId))
      queryPurchases        → resume/cold-start reconciliation
  → POST /api/google-play/verify-purchase       [token → server]
  → Server: subscriptionsv2.get → validate → write entitlement → acknowledge
  → RTDN → same verify path for renewals/cancel/hold/revoke
```

Client purchase callbacks **never** grant access — they only transport the token. `MainActivity` registration precedes `super.onCreate()` per Capacitor convention.

## 4. Verification implementation

`verifyAndApplyPurchase` (`billing-service.ts`):
1. Product allowlist (`GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS`, default `replyflow_monthly`) — client claim AND Google's record must match.
2. `subscriptionsv2.get` — authoritative state.
3. `obfuscatedExternalAccountId` equality — purchase bound to this user's SHA-256 hash.
4. Token-ownership check — 409 if bound to another business.
5. Business ownership check — `business.user_id === user.id` (owner-only, matching Stripe convention).
6. **Double-billing guard**: `provider='stripe'` + `active|trialing` → returns `alreadyOwned`, Play purchase never activates.
7. State map → writes `subscription_status`, `current_period_end`, `trial_ends_at`, `cancel_at_period_end`, provider + Play IDs.
8. Acknowledge if unacknowledged (prevents 3-day auto-refund).

**State map**: ACTIVE/IN_GRACE_PERIOD→active (or trialing during trial), CANCELED→active+cancel_at_period_end until expiry, PAUSED/ON_HOLD→past_due, PENDING/COMPLETED→null, EXPIRED/REVOKED→canceled.

**RTDN**: shared-secret push URL (`?key=GOOGLE_PLAY_RTDN_SECRET`), base64 decode → `google_play_rtdn_events` claim → unknown-token ack (client binds on next resume) → Stripe-provider skip → `verifyAndApplyPurchase` (REVOKED forces canceled). 500 → Pub/Sub retry; failed events reclaimable.

## 5. Stripe compatibility safeguards

- Stripe webhook writes `subscription_provider:'stripe'`; `customer.subscription.updated/deleted` **skip google_play businesses** — stale Stripe events can't clobber Play entitlements (and vice-versa via the service guard).
- `checkout.session.completed` unguarded intentionally — an explicit new Stripe purchase is a legitimate provider switch.
- Stripe fields (`stripe_subscription_id`, etc.) are never cleared by the Play path.
- `hasValidSubscription`/trial-state helpers now validate the provider's own identifiers — Play subs no longer fail the "missing Stripe IDs" check that would have marked them invalid.

## 6. Test results

- **`src/__tests__/google-play-billing.test.ts`: 45/45 pass** — real unit tests on `mapPlayEntitlement` (9 transitions) + contract tests (migration, service guards, routes, all-6-site wiring, portal replacement, plugin registration, no-Stripe-on-Android).
- `tsc --noEmit`: **0 errors in all touched files** (pre-existing test-file errors unchanged).
- `next build`: **passed** — both new API routes compiled.
- `gradlew :app:compileReleaseJavaWithJavac`: **passed** — plugin compiled against billing-8.0.0.
- Full suite: 291 failures, **all pre-existing stale contracts in untouched files** (verified against baseline; none trace to this change).

## 7. Required Play Console / Google Cloud actions

1. **Product**: Play Console → Monetize → Subscriptions → Create → ID **`replyflow_monthly`**.
2. **Base plan**: auto-renewing, monthly billing period, **US $59.00**.
3. **Offer**: on the base plan → Add offer → eligibility "New customers" → **Free trial, 14 days**.
4. **Google Cloud**: project linked to Play Console → enable **Google Play Android Developer API**.
5. **Service account**: create in same project → grant **View financial data, orders, and cancellation survey responses** + **Manage orders and subscriptions** on the app → download JSON key → set as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (raw or base64).
6. **RTDN**: Play Console → Monetize → Real-time developer notifications → Pub/Sub topic `projects/<proj>/topics/<topic>` → create **push** subscription pointing to `https://www.replyflowhq.com/api/google-play/rtdn?key=<GOOGLE_PLAY_RTDN_SECRET>` → set the same secret env var → Send test notification.
7. **License testers**: Play Console → Settings → License testing → add test Gmail accounts → upload internal-testing AAB → opt-in link for testers.

**Env vars** (server): `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME` (default `com.replyflowhq.app`), `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS` (default `replyflow_monthly`), `GOOGLE_PLAY_RTDN_SECRET`. Client: `NEXT_PUBLIC_GOOGLE_PLAY_PRODUCT_ID` (default `replyflow_monthly`).

## 8. Physical purchase-testing procedure

1. Apply the migration; set env vars; deploy web.
2. Build internal-testing AAB (commands below), upload to internal track, join with a license-tester account.
3. Install → sign up → complete business profile → "Activate My Free Trial" → **Play purchase sheet appears** (testers aren't charged; trial offer shows if eligible).
4. Verify `subscription_status='trialing'`/`'active'`, `subscription_provider='google_play'` in Supabase; dashboard access granted.
5. Sign in as an **existing Stripe subscriber** → confirm no purchase prompt and `alreadyOwned` path (no double charge).
6. Cancel in Play Store → RTDN → status stays `active` + `cancel_at_period_end` until expiry.
7. Revoke/refund via Play Console → RTDN type 9 → status `canceled` immediately.
8. Settings → Manage billing → opens `play.google.com/store/account/subscriptions`, **not** Stripe portal.
9. Web/iOS regression: Stripe checkout unchanged.

## 9. Remaining blockers

- **Console product must exist before purchase works** — app shows "Product not found" until §7.1–3 done (client-side only, no code change).
- **Service account + RTDN secrets** needed in the deployment env or verification returns 500.
- License-tester purchase cycle is the only end-to-end path not yet exercised (emulator can't prove it).
- `subscription_status` for pending purchases stays `null` → user remains on complete-setup until payment completes (intended).
- versionCode must bump from `1` for any new upload.

## 10. Replacement signed AAB build

```bat
:: 1. Apply migration (supabase db push) + set env vars + deploy web first

:: 2. Regenerate production Capacitor config
set NODE_ENV=production&& npx cap sync android

:: 3. Bump versionCode in android/app/build.gradle (currently 1 → set to 2)

:: 4. Signed bundle (keystore.properties already resolves replyflow-release-test.keystore)
cd android
gradlew.bat :app:bundleRelease

:: Output: android\app\build\outputs\bundle\release\app-release.aab
```
