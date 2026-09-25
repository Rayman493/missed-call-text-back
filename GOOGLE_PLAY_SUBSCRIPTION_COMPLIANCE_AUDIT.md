# Google Play Subscription Compliance Audit — com.replyflowhq.app

**Scope**: Read-only audit of the existing Android subscription implementation against current Google Play Payments policy. No code, builds, or configuration were modified.

**Verdict up front**: The current Stripe-Checkout-in-Custom-Tab subscription flow is **not compliant as-is** for Play-distributed installs. Chrome Custom Tab does not change the classification — it is still an in-app link to an alternate payment method. Compliant routes exist (detailed below); the smallest is the US External Content Links program enrollment + API integration, or a consumption-only Android build.

---

## 1. Traced subscription flow (production code)

### Account creation
- `/auth?mode=signup` (`src/app/auth/page.tsx`) — email/password via `supabase.auth.signInWithPassword` + `POST /api/auth/complete-signup`. Creates auth user + `businesses` row. No payment collected at this step.
- Team invite path: `/invite/[token]` — member sets password, joins an existing business (inherits business subscription).

### Trial start — every checkout launch point
All funnel through `POST /api/stripe/create-checkout-session` → `stripe.checkout.sessions.create({ mode:'subscription', subscription_data.trial_period_days: 14 })` (`src/app/api/stripe/create-checkout-session/route.ts:333,379–399`). Success URL `/billing/success?session_id={ID}&return_to_app=1&native_callback=1`; cancel URL `/dashboard?checkout=cancelled` (`:352–356`).

| Entry point | Trigger | Location |
|---|---|---|
| `/onboarding` | Form submit "Continue to Free Trial" → `handleOnboarding` → `openStripeCheckout` | `src/app/onboarding/page.tsx:374–397`, CTA at `:655` |
| `/complete-setup` | Button "Activate My Free Trial" → `handleContinueToStripe` → `openStripeCheckout` | `src/app/complete-setup/page.tsx:676–719`, button `:871` |
| `SetupStatusCard` | Resume-checkout CTA → `openStripeCheckout` | `src/components/SetupStatusCard.tsx:132–151` |
| Dashboard paywall | `openStripeCheckout` on gated action | `src/app/dashboard/DashboardContent.tsx:748` |
| Leads page | `openStripeCheckout` | `src/app/dashboard/leads/page.tsx:870–897` |
| `/auth` signup variants | `fetch('/api/stripe/create-checkout-session')` ×3 | `src/app/auth/page.tsx:407,601,706` |

### How checkout opens on Android
`openStripeCheckout()` (`src/lib/stripe-checkout.ts:28,94+`): `isNativeAndroid()` → `ReplyflowWebCheckoutPlugin.openCheckoutSession` → `android/app/src/main/java/com/replyflowhq/app/ReplyflowWebCheckoutPlugin.java:87` → **AndroidX `CustomTabsIntent`** — a Chrome Custom Tab, not the Capacitor WebView and not the external browser app. Fallbacks: `Browser.open` (Capacitor Browser → Custom Tab) → last-resort `window.location.href` (in-WebView).

**A Chrome Custom Tab is still part of the app** for policy purposes — the user never leaves the app task, and the flow is initiated by an in-app button. This does not satisfy "purchase happened outside the app."

### Return handling
- Success: `/billing/success` polls `POST /api/billing/checkout-status` (`src/app/billing/success/page.tsx:246`); webhook `customer.subscription.created/updated` sets `businesses.subscription_status='trialing'` (`src/lib/stripe-webhook-processor.ts`). App return via verified App Link `links.replyflowhq.com/billing/success` (`:95,383`).
- Cancel: `cancel_url` → `/dashboard?checkout=cancelled`; `subscription_status` stays `null`.
- Failure/abandon: `subscription_status` remains `null` → BusinessGuard forces `/complete-setup` (below).

### Access gating (what works without paying)
- `BusinessGuard.tsx:183–197,275–288`: `subscription_status === null` → hard redirect to `/complete-setup`, renders `CheckoutRedirectLoadingScreen`. **No app functionality is usable without completing Stripe checkout** (the checkout starts the trial — card required up front).
- `hasBillingAccess` (`src/lib/manual-access.ts:111`): `subscription_status ∈ {active, trialing}` OR admin-granted `manual_access_enabled`.
- `past_due`/`canceled` users can sign in and reach dashboard surfaces (only `null` triggers the checkout wall) — existing subscribers **can** sign in without a new purchase flow.
- Billing management: Settings → `POST /api/stripe/create-portal-session` → Stripe Billing Portal opened via `openNativeWebSession` — **also a Custom Tab** (`src/lib/billing.ts:170–175`). The portal permits card updates and resubscription — itself an "alternate payment method" destination.

## 2. Three payment categories — separated

| Category | What it is | Play Billing required? |
|---|---|---|
| **A. ReplyFlow subscription** — $59/mo + 14-day trial, sold to the app user | Digital SaaS subscription unlocking app functionality. Payments policy FAQ explicitly names "business productivity software / cloud software and services" as requiring Play Billing | **YES** — this is the compliance question |
| **B. Customer invoices/payment requests** — plumber's customer pays plumber | Payment for **physical services**; payer never uses the app (SMS link → own browser → Stripe Checkout on connected account). Google's policy: physical services excluded | **NO** |
| **C. Tap to Pay (Stripe Terminal)** | In-person contactless payment for physical goods/services, processed by Stripe's EMV-certified SDK | **NO** |

B and C are clean and must not be declared/handled as Play Billing items.

## 3. Applicable Google Play requirements (current docs)

Sources (fetched during this audit):
- Payments policy/FAQ: https://support.google.com/googleplay/android-developer/answer/10281818
- US alternative billing: https://support.google.com/googleplay/android-developer/answer/16497028
- US external content links (ECL): https://support.google.com/googleplay/android-developer/answer/16470497

**Documented requirements:**
1. In-app purchase of the subscription requires Play Billing **unless** a Payments-policy program applies. In-app links to alternate payment methods (including web pages that lead to payment) are prohibited absent Section 3/8/9 coverage.
2. **US alternative billing program** (US only): opt-in; Play Console enrollment (Settings > Alternative billing); **must integrate the alternative billing APIs** (Play Billing Library); report all authorized US transactions within 24h (required from Oct 1, 2026); service fee 10% recurring subscriptions (up to 20–25% other items); must provide subscription-management + support/dispute links; PCI-DSS applies (Stripe satisfies).
3. **US external content links program** (US only): enrollment + approval required **before** linking; must integrate **ECL APIs** (info screen, parental controls, transaction reporting); links may open in browser/webview; fee 10% recurring subscriptions for qualifying transactions within 24h of linkout; destination-requirement rules (accurate description, no PII in URLs, no misleading redirects).
4. **Consumption-only ("reader") model**: officially permitted — users may sign in and use content purchased elsewhere. Constraint: *nothing purchasable in-app* and no links/language leading to purchase; admin links OK only if destination doesn't lead to alternate payment methods.
5. Existing web subscriptions accessed in-app are allowed under consumption-only (per FAQ).
6. Programs are US-specific; if Play distribution is limited to the US at launch, ECL/alternative-billing cover the launch footprint — expanding to other countries later re-triggers the problem in each market without an equivalent program.

## 4. Existing Play Billing / program implementation

**None.** Repository search confirms:
- No `com.android.billingclient` dependency in any Gradle file.
- No alternative-billing, external-offers, or ECL API usage.
- No Play-installer detection (`Capacitor.isNativePlatform()` is runtime detection, not install source).
- No geographic gating of checkout; no compliance feature flags.
- Native plugins present: `ReplyflowWebCheckoutPlugin` (Custom Tabs), `ReplyflowStripeTerminalPlugin`, `SmsLauncherPlugin` only.

## 5. Options assessment

### Option 1 — US External Content Links enrollment (keep Stripe)
- **Work**: enroll + approval in Play Console; integrate ECL APIs into the Android app (Play Billing Library for info screen + reporting); backend job to report qualifying transactions within 24h; pay 10% of subscription revenue on qualifying linkout transactions; honor destination/link-disclosure requirements.
- **Fit**: preserves the exact Stripe experience; smallest *revenue-friendly* path. Code changes are moderate but real (billing lib + reporting pipeline).
- **Risk**: enrollment approval timing; ongoing fee + reporting ops.

### Option 2 — US alternative billing (offer Stripe alongside/instead of Play Billing)
- **Work**: same API integration burden + Play Console enrollment + 24h reporting + subscription-management links; 10% fee on recurring subs.
- **Fit**: appropriate only if you also want an in-WebView payment sheet; ECL is the better-matched program for link-out.

### Option 3 — Consumption-only Android build (no in-app purchase)
- **Work**: gate every checkout/portal launch behind `!isNativeAndroid()`: onboarding auto-checkout, complete-setup button, SetupStatusCard CTA, dashboard/leads paywall buttons, auth checkout calls, **and the Billing Portal link** (portal leads to payment methods — must be hidden or replaced with "manage at replyflowhq.com" text, allowed as non-linking language). Replace null-status wall on Android with a sign-in/web-activation message. Smallest code footprint (~6–8 files, UI-only), zero fees, no enrollment.
- **Cost**: Android users must complete signup+trial on the web first; first-install UX degrades; trial-with-card can't start in-app.
- **Fit**: fastest route to a compliant submission; preserves iOS/web untouched.

### Option 4 — Google Play Billing
- **Work**: full PBL integration, Play subscription product, entitlement sync, Play↔Stripe dual-billing reconciliation (web/iOS stay Stripe), RTDN webhooks. Largest effort; changes the subscription model.
- **Fit**: only if you want Play-managed subs long-term.

## 6. Release blockers

**Confirmed blocker**: the signed AAB as-built is **not compliant** to ship unchanged — in-app checkout links exist on every gating surface (§1). Submitting it as-is risks rejection under Payments policy.

**Potential risks**: Billing Portal Custom Tab (leads to payment methods); `window.location.href` last-resort fallback could load checkout in-WebView; signup-within-app → complete-setup wall that only offers Stripe activation.

**Console actions (any route)**: program enrollment (ECL or alternative billing) *or* ensure the submitted build makes no in-app purchase offers; Data Safety already audited separately.

**Non-blockers**: Stripe webhook/persistence logic is fine as-is for Options 1–3; AAB signing/identity already verified; US-only availability is a Console restriction, not code.

## 7. Smallest release-focused plan

**Recommended: Option 3 (consumption-only) for first submission**, evaluate Option 1 (ECL) as a follow-up release:

1. Add a single `billingLinksAllowed` guard (`!isNativeAndroid()` or install-source check).
2. Gate the six checkout launch points + Billing Portal entry behind it; swap CTAs for "Activate your trial at replyflowhq.com" text (non-linking language is explicitly permitted).
3. On Android, `subscription_status === null` → message directing web activation instead of checkout.
4. Verify sign-in → existing-subscriber path untouched.

**Effort**: small — a focused change across ~6–8 files, UI-only, no native code, no backend, no fees. (Option 1 instead: Play Billing Library + ECL APIs + 24h transaction-reporting backend — substantially larger.)

## 8. Open questions for your decision

1. **Revenue vs. UX**: accept no in-app signup→trial on Android (Option 3), or pay Google ~10% + build ECL integration to keep it (Option 1)?
2. Is US-only Play availability acceptable for v1? (Both US programs are US-scoped; EEA/IN/KR have separate programs.)
3. Do you want Play Billing parity long-term (Option 4) or is Stripe-only acceptable if ECL keeps working?
4. Console: confirm no ECL/alternative-billing enrollment has already been started (none found in code).

## Go / No-Go checklist

- [ ] **NO-GO**: AAB as-built (contains in-app external purchase links).
- [ ] Choose route: consumption-only build | ECL enrollment + API | alternative billing | Play Billing.
- [ ] If ECL/alt-billing: Console enrollment approved before submission; APIs integrated; 24h transaction reporting live (required now — Oct 2026 obligations are in force).
- [ ] If consumption-only: zero in-app purchase CTAs/links verified on device; Billing Portal link removed/gated; web-subscriber sign-in verified.
- [ ] Play Console: country availability matches the chosen program's scope.
- [ ] Data Safety declarations consistent with whatever payment path ships.
