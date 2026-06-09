# Onboarding Routing Audit - Phase 1

**Date**: 2025-01-06
**Purpose**: Map every route that can send a user into onboarding before making changes

---

## Current Onboarding Entry Points

### 1. `/onboarding/new-onboarding`
**File**: `src/app/onboarding/new-onboarding/page.tsx`

**Entry Conditions:**
- User has valid subscription (trialing/active with Stripe IDs)
- User has Twilio phone number
- Onboarding NOT complete OR forwarding NOT verified

**Routing Guards (Lines 60-115):**
```typescript
// Guard 1: No valid subscription
IF !hasValidSub → redirect to /dashboard

// Guard 2: Onboarding complete
IF onboarding_status === 'completed' AND forwarding_verified === true → redirect to /dashboard

// Guard 3: No Twilio number (POTENTIAL LOOP)
IF !twilio_phone_number → redirect to /onboarding (old onboarding)
```

**Exit Conditions:**
- User selects carrier → saves to database → redirects to `/dashboard` (NOT test-setup!)
- This is INCONSISTENT with expected flow

**Issues:**
- ⚠️ Redirects to old `/onboarding` if no Twilio number (potential loop)
- ⚠️ After carrier selection, redirects to `/dashboard` instead of test setup
- ⚠️ Does not route to test-setup page

---

### 2. `/onboarding/phone-setup`
**File**: `src/app/onboarding/phone-setup/page.tsx`

**Entry Conditions:**
- User has active subscription (trialing/active/past_due/canceled)

**Routing Guards (Lines 72-85):**
```typescript
// Guard: No active subscription
IF !hasSubscription → redirect to /dashboard
```

**Exit Conditions:**
- User enables forwarding → saves to database → redirects to `/dashboard/test-setup`

**Issues:**
- ⚠️ Requires active subscription (may block beta/comped users)
- ⚠️ Different carrier code format than new-onboarding

---

### 3. `/setup/forwarding`
**File**: `src/app/setup/forwarding/page.tsx`

**Entry Conditions:**
- User has business context
- Subscription status checked (HARD GUARD at line 170)

**Routing Guards (Lines 170-199):**
```typescript
// HARD GUARD: Check subscription status BEFORE UI rendering
IF businessLoading → show loading/recovery UI
```

**Auto-Poll (Lines 100-117):**
```typescript
IF setupState === 'provisioning_or_number_pending'
  → Poll every 3 seconds for provisioning status
```

**Exit Conditions:**
- User completes forwarding → saves to database → redirects to `/dashboard/test-setup`

**Features:**
- ✅ Auto-polling for provisioning
- ✅ LocalStorage persistence for progress
- ✅ Recovery UI if loading times out

---

## Dashboard Routing Logic

### `/dashboard` Gate
**File**: `src/app/dashboard/DashboardContent.tsx` (Lines 898-956)

**Routing Decision Tree:**
```typescript
IF setup incomplete:
  switch (setupState) {
    case 'needs_trial':
      → Stay on /dashboard (show billing prompt)
    case 'provisioning_or_number_pending':
      → redirect to /onboarding/new-onboarding
    case 'needs_forwarding':
      → redirect to /setup/forwarding
    case 'needs_final_test':
      → redirect to /dashboard/test-setup
    default:
      → Stay on /dashboard
  }
```

**Fallback Gate (Lines 958-997):**
```typescript
IF no business:
  → redirect to /onboarding (old onboarding)

IF missing name or phone AND no active subscription:
  → redirect to /onboarding (old onboarding)
```

**Issues:**
- ⚠️ Redirects to old `/onboarding` for missing business
- ⚠️ Inconsistent: provisioning goes to `/onboarding/new-onboarding` but missing business goes to `/onboarding`

---

## Billing Success Flow

### `/billing/success`
**File**: `src/app/billing/success/page.tsx`

**Flow:**
1. Polls API every 2 seconds (up to 45 seconds)
2. Checks: checkout status, subscription status, provisioning status
3. On success → redirects to `/dashboard?setup=1`

**Exit Condition:**
- All checks pass → `router.push('/dashboard?setup=1')`

**Issues:**
- ⚠️ 45-second timeout may be too short for slow provisioning

---

## Auth Flow

### `/auth` (signup/signin)
**File**: `src/app/auth/page.tsx`

**Exit Conditions:**
- After signup:
  - IF business exists → `/dashboard`
  - IF no business → `/onboarding` (old onboarding)

**Issues:**
- ⚠️ Redirects to old `/onboarding` for new users without business

---

## Test Setup Flow

### `/dashboard/test-setup`
**File**: `src/app/dashboard/test-setup/page.tsx`

**Entry Conditions:**
- User has completed forwarding setup
- Forwarding verified OR test pending

**Exit Conditions:**
- Test successful → marks `forwarding_verified = true` → redirects to `/dashboard`
- Manual completion → redirects to `/dashboard`

**Issues:**
- ✅ No major issues found

---

## Identified Routing Issues

### Critical Issues

1. **Multiple Entry Points**
   - Three different pages handle forwarding setup
   - No single source of truth
   - Confusing for users and developers

2. **Potential Redirect Loop**
   - `/onboarding/new-onboarding` → redirects to `/onboarding` (old) if no Twilio number
   - Old `/onboarding` may redirect back depending on business state
   - No loop prevention guard in old onboarding

3. **Inconsistent Exit Destinations**
   - `/onboarding/new-onboarding` → redirects to `/dashboard` after carrier selection
   - `/onboarding/phone-setup` → redirects to `/dashboard/test-setup` after forwarding
   - `/setup/forwarding` → redirects to `/dashboard/test-setup` after forwarding

### Medium Issues

4. **Inconsistent Subscription Checks**
   - `/onboarding/phone-setup` checks specific subscription statuses
   - `/onboarding/new-onboarding` uses `hasValidSubscription` helper
   - Different logic may allow/deny access inconsistently

5. **Old Onboarding Still Referenced**
   - Multiple routes redirect to old `/onboarding`
   - Old onboarding path still exists and active
   - Creates ambiguity about which is "current"

6. **Billing Timeout Too Short**
   - 45 seconds may not be enough for slow provisioning
   - No "still processing" message
   - User may think it failed when it's just slow

---

## State Flow Diagram

```
Signup → Auth
  ↓
Business Created?
  ├─ No → /onboarding (old)
  └─ Yes → /dashboard
       ↓
   Has Subscription?
     ├─ No → Activation CTA → Stripe → /billing/success → /dashboard?setup=1
     └─ Yes → Dashboard
          ↓
      Setup State (deriveSetupState)
        ├─ needs_trial → /dashboard (show billing prompt)
        ├─ provisioning_or_number_pending → /onboarding/new-onboarding
        ├─ needs_forwarding → /setup/forwarding
        ├─ needs_final_test → /dashboard/test-setup
        └─ complete → /dashboard (full access)

Forwarding Setup Routes:
  /onboarding/new-onboarding → /dashboard (INCONSISTENT)
  /onboarding/phone-setup → /dashboard/test-setup
  /setup/forwarding → /dashboard/test-setup
```

---

## Canonical Route Recommendation

**Recommended**: `/setup/forwarding`

**Rationale:**
1. Most comprehensive forwarding setup UI
2. Has auto-polling for provisioning
3. Has localStorage persistence
4. Has recovery UI for loading timeouts
5. Consistent exit to `/dashboard/test-setup`
6. Already used by dashboard gate for `needs_forwarding` state

**Legacy Routes to Redirect:**
1. `/onboarding/new-onboarding` → `/setup/forwarding`
2. `/onboarding/phone-setup` → `/setup/forwarding`

**Preserve:**
- Keep route files functional (don't delete)
- Add redirect logic at component level
- Preserve query parameters if any
- Log redirect for debugging

---

## Next Steps (Phase 2)

1. ✅ Audit complete
2. → Select canonical route: `/setup/forwarding`
3. → Add safe redirects from legacy routes
4. → Add routing guards to prevent loops
5. → Test all flows
