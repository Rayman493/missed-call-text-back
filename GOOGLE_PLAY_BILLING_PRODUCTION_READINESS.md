# Google Play Billing — Production Readiness

Status of the Android subscription billing implementation ahead of the first internal-test purchase. US-only launch. Feature freeze maintained — every change below is a billing-compliance or reliability fix.

---

## 1. Migration safety assessment — `20261003000000_google_play_billing.sql` (+ `20261004000000_google_play_owner_only_columns.sql`)

| Check | Result |
|---|---|
| Additive only | ✅ 9 `ADD COLUMN IF NOT EXISTS`, 2 partial `CREATE UNIQUE INDEX IF NOT EXISTS`, 1 `CREATE TABLE IF NOT EXISTS`, 1 backfill `UPDATE`. No drops, no rewrites. |
| Stripe backfill | ✅ `subscription_provider='stripe'` for rows with `stripe_subscription_id` and null provider. Nullable provider on unsubscribed rows is intentional. |
| Token uniqueness | ✅ Partial unique indexes on `google_play_purchase_token` and `google_play_linked_purchase_token` — one purchase can never bind two businesses; verified in service code (409 path) and enforced race-safe at DB level. |
| Play events → Stripe entitlements | ✅ Service returns `alreadyOwned` without writing for provider=`stripe` + active/trialing; RTDN skips Stripe businesses entirely. |
| Stripe events → Play entitlements | ✅ `stripe-webhook-processor.ts` skips `google_play` businesses on subscription updated/deleted; Play path never clears Stripe columns. |
| Entitlement checks both providers | ✅ `hasBillingAccess`/`hasActiveAccess` are status-only; `hasValidSubscription`/`hasInvalidTrialState` provider-aware; `isReadyForForwardingSetup` fixed this session (was Stripe-ID-only — **a Play subscriber could not have completed forwarding setup**). |
| RLS | ✅ `google_play_rtdn_events` RLS enabled, no client policies = service-role only. New migration `20261004` extends the `enforce_business_owner_fields` trigger to all `google_play_*` columns + `subscription_provider` — **previously a member could have written these columns via row-level UPDATE**. |
| Local DB test | ⚠️ Not run — Docker/Supabase not running locally. Both migrations are idempotent and syntax-consistent with existing migrations; apply to staging or production only after approval. |

## 2. Play Console configuration (click-by-click)

Identifiers verified in code: product `replyflow_monthly` (client `NEXT_PUBLIC_GOOGLE_PLAY_PRODUCT_ID` default; server `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS` allowlist; RTDN fallback). The plugin auto-selects the offer containing a free-trial pricing phase, falling back to the first offer — **keep exactly one auto-renewing base plan** (`monthly`) so selection is deterministic. The base-plan ID is Console-side only; the code never references it.

1. **Create subscription**: Play Console → app → Monetize → Products → Subscriptions → **Create subscription** → Product ID `replyflow_monthly` → name "ReplyFlow Monthly" → Create.
2. **Base plan**: inside the product → **Add base plan** → Base plan ID `monthly` → type **Auto-renewing**, billing period **1 month** → **Set price** → United States **$59.00** → Save → **Activate**.
3. **Free-trial offer**: base plan → **Add offer** → Offer ID `trial-14d` → Eligibility: **New customers** → Phases: **Free trial — 14 days** → Save → **Activate**.
4. **Internal testing track**: Testing → Internal testing → Create release → upload AAB → Save → publish to internal testers → copy the opt-in URL for testers.
5. **License testers**: Settings → License testing → add tester Gmail accounts → Save. License-test purchases are not charged and auto-refund in ~2 weeks; renewals compress to minutes-scale intervals, enabling fast cancel/renew/expire testing.

## 3. Google Cloud, service account & RTDN

**Service account** (server-side only, never shipped):
1. Google Cloud Console → select the project linked to the Play Console app → APIs & Services → Enable **Google Play Android Developer API**.
2. IAM → Service Accounts → Create → grant nothing at project level → create JSON key.
3. Play Console → Users and permissions → invite the service account → app-level permissions: **View app information and download bulk reports**, **Manage orders and subscriptions** → invite/apply.
4. Set env `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` = entire key JSON (raw or base64). The app signs a JWT with `private_key`, exchanges at `oauth2.googleapis.com/token` for scope `androidpublisher`, caches ~1h. No new dependencies.

**RTDN** (`/api/google-play/rtdn`):
1. Google Cloud → Pub/Sub → Topics → Create topic (e.g. `replyflow-rtdn`) → copy full topic path.
2. Subscriptions → Create → push endpoint `https://www.replyflowhq.com/api/google-play/rtdn?key=<secret>` → set the same value as `GOOGLE_PLAY_RTDN_SECRET` (generate a long random string; never commit it).
3. Play Console → Monetize setup → Real-time developer notifications → paste topic path → **Send test notification** (route acks non-subscription notifications with `ignored:true`).
4. Grant **Pub/Sub Publisher** to `google-play-developer-notifications@system.gserviceaccount.com` on the topic.

**Verified properties**:
- Every notification re-fetches `subscriptionsv2.get` before any write — payload never trusted.
- `PENDING`/deferred → `subscription_status=null` — pending purchases never activate.
- Entitled purchases acknowledged via `purchases.subscriptions:acknowledge` (prevents 3-day auto-refund).
- Idempotent via unique `message_id` claim; `processed` rows short-circuit; `failed` + stale `processing` (>10 min) reclaimed with `attempt_count++`.
- Failures return 500 → Pub/Sub backs off and retries.
- Stripe-provider businesses skipped; revoked tokens that 404 at Google now write `canceled` directly instead of retry-looping.

## 4. Production environment variables

| Var | Where | Value |
|---|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | server | Service-account key JSON (raw or base64) |
| `GOOGLE_PLAY_RTDN_SECRET` | server | Random string matching the push-URL `?key=` |
| `GOOGLE_PLAY_PACKAGE_NAME` | server | Optional — defaults `com.replyflowhq.app` |
| `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS` | server | Optional — defaults `replyflow_monthly` |
| `NEXT_PUBLIC_GOOGLE_PLAY_PRODUCT_ID` | client | Optional — defaults `replyflow_monthly` |

Defaults are correct for the intended product; only the two secrets are mandatory.

## 5. Fixes applied this session

| File | Fix |
|---|---|
| `api/google-play/rtdn/route.ts` | `REVOKED` 9→**12** (9 is `SUBSCRIPTION_DEFERRED` — a refund would never have force-revoked); stale-`processing` reclaim + `attempt_count++`. |
| `lib/google-play/billing-service.ts` | `forceRevoked` + token 404 at Google → writes `canceled` directly (was: infinite failed-event retry, user keeps access). |
| `ReplyflowGooglePlayBillingPlugin.java` | Synchronous `launchBillingFlow` error → reject call (was: JS promise hangs forever). |
| `supabase/migrations/20261004000000_google_play_owner_only_columns.sql` | New — extends owner-only trigger to `subscription_provider` + all `google_play_*` columns. |
| `lib/subscription-utils.ts` | `isReadyForForwardingSetup` accepts Play purchase-token identity (was Stripe-ID-only — blocked Play subscribers from forwarding setup). |
| `lib/billing.ts` | Android `handleBillingAction` now launches the Play purchase for any non-manageable subscription (was: could open Stripe Checkout); portal→checkout fallback disabled on Android. |
| `src/__tests__/google-play-billing.test.ts` | Coverage for all of the above. |

## 6. Test results

| Check | Result |
|---|---|
| `google-play-billing.test.ts` | **50/50 pass** (state-mapping units + wiring/security contracts) |
| Stripe billing regression (`billing-navigation`, `BottomNavigation-billing`, `prelaunch-batch2-member-settings`) | **48/48 pass** |
| `tsc --noEmit` | **0 errors** in non-test source (pre-existing test-file errors unchanged) |
| ESLint (all touched files) | Clean |
| `next build` | **Pass** — both `/api/google-play/*` routes compiled |
| `gradlew :app:compileReleaseJavaWithJavac` | **Pass** |
| Full suite | 291 pre-existing failures in untouched files — unchanged from baseline, none trace to this work |

## 7. Physical test procedure

1. Apply migrations (staging/prod), set §4 env vars, deploy web.
2. `set NODE_ENV=production&& npx cap sync android` → bump `versionCode` → `gradlew :app:bundleRelease` → upload to internal track.
3. License-tester device, fresh account → "Activate My Free Trial" → Play sheet shows 14-day trial + $59/mo.
4. Complete purchase → verify Supabase row: `subscription_provider='google_play'`, `subscription_status='trialing'`, token + product populated → dashboard unlocked.
5. Kill + relaunch → entitlement persists (cold-start `queryPurchases` reconcile).
6. Existing Stripe subscriber signs in → no purchase prompt, `alreadyOwned`, no double charge.
7. Play Store → cancel → RTDN type 3 → `active` + `cancel_at_period_end` until expiry.
8. License-test renewal/expiry (compressed cycle) → status transitions via RTDN.
9. Refund/revoke via Play Console → type 12 → `canceled` immediately.
10. Settings → billing → opens `play.google.com/store/account/subscriptions` (not Stripe portal).
11. Regression: web/iOS Stripe checkout, Connect payments, invoices, Tap to Pay unchanged.

## 8. Remaining blockers (all Console-side)

- Product + base plan + offer not yet created → app shows "Product not found".
- Service-account JSON + RTDN secret not yet in the deployment env → verification returns 500.
- Internal-track AAB upload + license-tester opt-in.
- `versionCode` bump before any upload.
- Migration not yet applied to production (awaiting your approval).

## 9. Recommended order

1. Apply both migrations to production/staging (your approval).
2. Set the 2 secret env vars + deploy web.
3. Create Console product/base-plan/offer; enable API; service account + permissions; RTDN topic + push subscription; test notification.
4. Build internal AAB (`versionCode` bump) → internal track → license-tester physical test (§7).
5. Green physical test → production AAB + Play submission.

**No production charges, migrations, credential changes, or builds have been made.**
