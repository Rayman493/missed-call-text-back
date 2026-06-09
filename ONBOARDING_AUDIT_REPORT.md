# ReplyFlow RC1 Onboarding Audit Report

**Date**: 2025-01-06
**Scope**: Complete user onboarding flow from signup to dashboard activation
**Auditor**: Cascade AI

---

## Executive Summary

This audit documents the complete onboarding experience for a brand-new user signing up for ReplyFlow. The flow spans multiple pages and states, including signup, trial activation, call forwarding setup, testing, and dashboard entry. Overall, the onboarding is **well-structured** with clear progression, but there are **several friction points and areas for improvement** identified.

### Key Findings
- **Strengths**: Clear step-by-step progression, comprehensive carrier instructions, good error handling
- **Critical Issues**: Multiple onboarding entry points causing confusion, potential routing loops, unclear next steps after test completion
- **Recommendations**: Consolidate onboarding entry points, improve routing guards, add clearer CTAs throughout

---

## 1. Signup Experience

### Entry Point
**File**: `src/app/auth/page.tsx` (redirects to `/auth?mode=signup`)

#### Flow
1. User lands on signup page
2. Enters email and password (with validation: 8+ chars)
3. Creates Supabase account
4. Business profile is created automatically
5. Redirects based on business state:
   - If business exists → `/dashboard`
   - If no business → `/onboarding`

#### Observations
✅ **Good**: Password validation is clear (8+ characters)
✅ **Good**: Automatic business profile creation
⚠️ **Issue**: No clear indication of what happens after signup
⚠️ **Issue**: Redirect logic depends on business state which may not be immediately available

#### Routing Logic (Lines 180-280)
```typescript
// After successful signup:
if (business) {
  router.push('/dashboard')
} else {
  router.push('/onboarding')
}
```

**Potential Issue**: If business creation is delayed, user may be redirected incorrectly.

---

## 2. Stripe/Trial Flow

### Billing Success Page
**File**: `src/app/billing/success/page.tsx`

#### Flow
1. User completes Stripe checkout
2. Redirected to `/billing/success`
3. Page polls API every 2 seconds (up to 45 seconds)
4. Checks: checkout status, subscription status, provisioning status
5. On success → redirects to `/dashboard?setup=1`

#### Observations
✅ **Good**: Polling mechanism ensures status is confirmed
✅ **Good**: Session restoration after Stripe redirect
⚠️ **Issue**: 45-second timeout may be too short for slow provisioning
⚠️ **Issue**: No clear error message if polling times out

#### Key States
- **Activating**: Shows spinner with "Activating your ReplyFlow number..."
- **Success**: Confirms activation and redirects
- **Timeout**: Shows error with "Try again" option
- **Error**: Shows specific error message

#### Dashboard Entry (Lines 400-450)
```typescript
// On successful activation:
router.push('/dashboard?setup=1')
```
The `setup=1` parameter is used to trigger setup mode in the dashboard.

---

## 3. Forwarding Setup (Carrier Instructions)

### Multiple Entry Points Identified
**Critical Finding**: There are **THREE** different forwarding setup pages:

1. **`/onboarding/new-onboarding/page.tsx`** - New onboarding flow
2. **`/onboarding/phone-setup`** - Phone setup page
3. **`/setup/forwarding/page.tsx`** - Setup forwarding page

### Primary Onboarding Page
**File**: `src/app/onboarding/new-onboarding/page.tsx`

#### Flow
1. User sees "Your ReplyFlow number is ready" (Step 1 of 3)
2. Displays Twilio phone number prominently
3. Visual flow diagram shows how call forwarding works
4. **Common Mistake Warning**: Red box warning not to forward ReplyFlow number to business number
5. Carrier selection (Verizon, AT&T, T-Mobile, Other)
6. Dynamic forwarding codes displayed based on carrier
7. VoIP guidance for non-traditional carriers
8. "Need help?" section with email and FAQ link
9. Help Assistant embedded

#### Routing Guards (Lines 60-130)
```typescript
// Checks:
1. Business loaded?
2. User has valid subscription?
3. Onboarding already complete?
4. Twilio phone number exists?
```

**Issue**: If no Twilio number, redirects to old `/onboarding` (potential loop)

#### Carrier Codes
- **Verizon**: `*71 + number`
- **AT&T**: `*004* + number #`
- **T-Mobile**: `**21* + number #`
- **Other**: Contact carrier instructions

### Secondary Setup Page
**File**: `src/app/setup/forwarding/page.tsx`

Similar functionality but different UI. Used when user returns from billing success with `setup=1`.

---

## 4. Review Setup Page

### Test Setup Page
**File**: `src/app/dashboard/test-setup/page.tsx`

#### Flow
1. Instructions to call business number from another phone
2. Let it ring (don't answer)
3. ReplyFlow detects call and sends SMS automatically
4. Polls for call events (up to 30 seconds)
5. On success → marks `forwarding_verified = true`
6. Redirects to `/dashboard`

#### Observations
✅ **Good**: Clear step-by-step instructions
✅ **Good**: Manual completion option if polling fails
⚠️ **Issue**: No visual feedback during polling (just "Waiting for your call...")
⚠️ **Issue**: Troubleshooting section is good but buried at bottom

#### Troubleshooting Section
- Carrier-specific issues (Verizon, AT&T, T-Mobile)
- VoIP provider guidance
- Common mistakes (forwarding wrong direction)

---

## 5. Dashboard First Impression (Empty State)

### Dashboard Content
**File**: `src/app/dashboard/DashboardContent.tsx`

#### States Handled
1. **No subscription**: Shows activation CTA + locked dashboard preview
2. **Subscription active, no Twilio number**: Shows provisioning status
3. **Subscription active, Twilio ready**: Shows full dashboard + setup progress

#### Getting Started Component
**File**: `src/components/GettingStarted.tsx`

Dynamic checklist with 3 steps:
1. **Activate ReplyFlow** - Trial/subscription activation
2. **Connect your business line** - Call forwarding setup
3. **Test your setup** - Verify forwarding works

#### Checklist Behavior
- Auto-expands current incomplete step
- Collapses when all steps complete
- Shows "action-needed" status if previously complete but now broken
- Uses optimistic UI updates for faster perceived performance

#### Empty State for Non-Subscribers
Shows locked preview with:
- Skeleton setup progress
- "Unlock your leads inbox" message
- CTA to start trial

---

## 6. Empty States Across All Pages

### Leads Page
**File**: `src/app/dashboard/leads/page.tsx`

#### Non-Subscriber State
- Shows locked preview with sample leads
- Overlay with lock icon
- "Start your trial to begin capturing missed-call leads"
- Filter buttons disabled

#### Subscriber with No Leads
- Shows lifecycle summary cards (all zeros)
- "No active leads" message
- Empty lead list area

### Calendar Page
**File**: `src/app/dashboard/calendar/page.tsx`

#### Disconnected State
- "Connect Google Calendar" CTA
- Calendar icon in circle
- Clear explanation of purpose
- No events shown

#### Connected but No Events
- Shows empty calendar grid
- Summary row shows "0" for today/week/month
- "Sync Now" button available

### Settings Page
**File**: `src/app/dashboard/settings/page.tsx`

#### No Empty State
Settings always shows:
- General settings (business name, phone, auto-reply)
- Automation settings (spam filtering, business hours)
- Integrations (Google Calendar connect/disconnect)
- Contacts (ignored contacts list - can be empty)
- Account (password change, delete account)

---

## 7. Navigation

### Navigation Component
**File**: `src/components/Navigation.tsx`

#### Structure
- **Dashboard** - Main dashboard
- **Leads** - Lead management
- **Calendar** - Google Calendar integration
- **Settings** - Account and business settings

#### Behavior
- Shows loading skeleton while auth loads
- Shows invisible placeholders for logged-out users (prevents layout shift)
- Active tab has blue underline
- All tabs always visible (no conditional hiding)

#### Observations
✅ **Good**: Consistent navigation
✅ **Good**: No layout shift
⚠️ **Issue**: No indication of which sections are locked for non-subscribers
⚠️ **Issue**: Calendar is accessible even if not connected (shows empty state)

---

## Critical Issues Identified

### 1. Multiple Onboarding Entry Points
**Severity**: HIGH
**Description**: Three different pages handle forwarding setup (`/onboarding/new-onboarding`, `/onboarding/phone-setup`, `/setup/forwarding`)
**Impact**: Confusing for users, potential routing loops
**Recommendation**: Consolidate to single entry point with URL parameters for different contexts

### 2. Routing Loop Risk
**Severity**: MEDIUM
**Description**: In `new-onboarding/page.tsx`, if no Twilio number exists, redirects to old `/onboarding`. Old onboarding may redirect back if conditions not met.
**Impact**: User stuck in redirect loop
**Recommendation**: Add routing guards with clear state machine

### 3. Unclear Next Steps After Test
**Severity**: MEDIUM
**Description**: After test setup completes, redirects to `/dashboard` but no clear indication of success
**Impact**: User may not know if setup worked
**Recommendation**: Add success banner or modal confirming setup completion

### 4. No Progress Persistence
**Severity**: LOW
**Description**: If user leaves during onboarding, may lose progress
**Impact**: Frustrating user experience
**Recommendation**: Save progress to business record at each step

### 5. Billing Timeout Too Short
**Severity**: LOW
**Description**: 45-second timeout for billing success polling
**Impact**: May fail for slow provisioning
**Recommendation**: Increase to 90 seconds or add "still processing" message

---

## Positive Findings

### 1. Comprehensive Carrier Instructions
- Clear, carrier-specific codes
- VoIP guidance included
- Visual flow diagram explains concept
- Common mistake warning prominent

### 2. Good Error Handling
- Polling with timeout
- Graceful error messages
- Retry options available
- Session restoration after Stripe redirect

### 3. Dynamic Checklist
- Auto-expands current step
- Shows action-needed for broken states
- Optimistic UI updates
- Collapses when complete

### 4. Locked Previews
- Shows what users will unlock
- Clear value proposition
- Consistent across pages

---

## Recommendations

### High Priority
1. **Consolidate onboarding entry points** - Single page with URL parameters
2. **Add routing state machine** - Prevent loops with clear state transitions
3. **Add success confirmation** - Banner/modal after test completion

### Medium Priority
4. **Increase billing timeout** - 45s → 90s
5. **Add progress persistence** - Save state at each step
6. **Improve empty state messaging** - More actionable CTAs

### Low Priority
7. **Add navigation indicators** - Show locked/unlocked status
8. **Improve polling feedback** - Visual progress during test setup
9. **Add onboarding skip option** - For users who want to explore first

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
      Has Twilio Number?
        ├─ No → Provisioning → /setup/forwarding
        └─ Yes → Forwarding Setup → /onboarding/new-onboarding
             ↓
         Forwarding Verified?
           ├─ No → Test Setup → /dashboard/test-setup
           └─ Yes → Dashboard (Active)
```

---

## Conclusion

The ReplyFlow onboarding flow is **functional and comprehensive**, with good carrier instructions and error handling. However, the **multiple entry points** and **potential routing loops** are significant concerns that could frustrate users. The **empty states** are well-designed with locked previews, and the **navigation** is consistent.

**Overall Assessment**: 7/10
- **User Experience**: 7/10 (good but confusing entry points)
- **Technical Implementation**: 8/10 (robust error handling)
- **Clarity**: 6/10 (multiple paths confuse users)
- **Completeness**: 9/10 (covers all necessary steps)

**Next Steps**: Prioritize consolidating onboarding entry points and adding routing guards to prevent loops.
