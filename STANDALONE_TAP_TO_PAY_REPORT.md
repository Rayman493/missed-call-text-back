# Standalone Tap to Pay Implementation Report

**Date:** July 22, 2026  
**Objective:** Add standalone Tap to Pay entry point in Payments tab for quick in-person payments  
**Status:** ✅ Complete

---

## Executive Summary

Successfully implemented a standalone Tap to Pay entry point in the Payments tab, enabling business owners to collect in-person contactless payments without navigating through customers or jobs. The implementation reuses existing Terminal infrastructure and preserves the contextual Tap to Pay shortcut in JobDetailsModal.

**Key Achievements:**
- ✅ Payments tab action cards (Tap to Pay + Request Payment)
- ✅ QuickTapToPayModal with single-step amount entry
- ✅ Optional customer/job association
- ✅ Native-only availability check
- ✅ Backend already supports Quick Payments (no changes needed)
- ✅ TypeScript compilation validated
- ✅ Android build validated
- ✅ JobDetailsModal Tap to Pay preserved

---

## 1. UI Placement Report

### 1.1 Current Payments Tab Structure
- **PageHeader** with title and description
- **4 Overview Cards:** Pending Amount, Paid This Month, Pending Requests, Collection Rate
- **Payment Requests List:** Mobile cards / Desktop table
- **Previous Actions:** Only "New Payment Request" button in header

### 1.2 Exact Placement Implemented
**Two prominent action cards at the top of Payments page:**

```
┌─────────────────────────────────────────┐
│  Tap to Pay          Request Payment    │
│  Collect in-person   Send payment link  │
│  [Start]             [Create]           │
└─────────────────────────────────────────┘
```

**Tap to Pay Card:**
- Green gradient background
- Smartphone icon
- "Collect in-person" subtitle
- "Accept contactless payments now with your phone" description
- Only shown when native supported and Stripe configured
- Shows "Mobile app only" message on web when Stripe configured

**Request Payment Card:**
- Blue gradient background
- CreditCard icon
- "Send payment link" subtitle
- "Send a payment request via SMS to your customer" description
- Always available

### 1.3 Number of Taps to Ready-for-Payment
**Payments tab → Tap to Pay card → enter amount → Start = 3 taps**

### 1.4 Why This Placement
- **Immediate visibility:** First thing users see on Payments page
- **Clear relationship:** Two actions side-by-side answer "How do you want to get paid?"
- **Fast access:** No scrolling or navigation required
- **Mobile-first:** Cards work well on mobile screens
- **Reuses existing patterns:** Matches other action card patterns in ReplyFlow

---

## 2. Backend Changes

### 2.1 Audit Results
**No backend changes required.** The existing `/api/terminal/payment-intent` endpoint already supports Quick Payments:

**Existing Capabilities:**
- `leadId` and `jobId` are optional (can be null)
- Amount and currency validated server-side
- Business and Stripe Connect account resolved server-side
- Idempotency protection already in place
- Creates payment_request record with `payment_method_type: 'card_present'`

**Security Preserved:**
- Job/invoice payments still have authoritative server-side amount enforcement
- Lead/job ownership validation when provided
- Duplicate payment prevention (5-minute window)
- Stripe Connect scoping maintained

### 2.2 Payment Data Mapping
**Standalone payments use existing payment_requests table:**
- `business_id` - From authenticated user
- `amount_cents` - User-entered amount
- `currency` - Business currency (USD)
- `stripe_payment_intent_id` - From PaymentIntent creation
- `payment_method_type` - 'card_present'
- `payment_provider` - 'stripe'
- `status` - pending → paid (via webhook)
- `lead_id` - Optional (if customer selected)
- `job_id` - Optional (if job selected)
- `description` - Optional (user can enter note)
- `conversation_id` - null (standalone payment)

**No fake job required** - payment_requests table already supports payments without jobs.

---

## 3. Implementation Details

### 3.1 Files Created
- `src/components/payments/QuickTapToPayModal.tsx` - Single-step modal for amount entry and optional customer/job association

### 3.2 Files Modified
- `src/app/dashboard/payments/page.tsx` - Added action cards and QuickTapToPayModal integration

### 3.3 QuickTapToPayModal Component

**Features:**
- Single-step amount entry with large input field
- Quick amount buttons ($10, $25, $50, $100)
- Optional customer/job association (expandable section)
- "Quick Payment" default (no customer/job)
- Customer selector with search
- Job selector when customer selected
- Native-only availability check
- Reuses existing TapToPayModal for payment collection
- Android back button and browser back button handling
- Body scroll lock when open

**Payment States:**
- Amount entry → Optional customer selection → TapToPayModal (ready, preparing, waiting_for_card, processing, success, failure, canceled, pending)

**Error Handling:**
- Validates amount > 0
- Shows "Tap to Pay is only available on the mobile app" on web
- Disables start button when not native supported

### 3.4 Payments Page Integration

**Added State:**
- `showQuickTapToPay` - Controls QuickTapToPayModal visibility
- `isNativeSupported` - Tracks native platform support

**Added UI:**
- Two action cards at top of page
- Tap to Pay card (green, native-only)
- Request Payment card (blue, always available)
- Removed "New Payment Request" button from PageHeader

**Conditional Rendering:**
- Tap to Pay card: Only when native supported AND Stripe connected AND charges enabled
- Web fallback: Shows "Mobile app only" message when Stripe configured but not native
- Hidden: When Stripe not configured

---

## 4. Validation Results

### 4.1 TypeScript Compilation
```
npx tsc --noEmit
Exit code: 0
```
✅ No TypeScript errors

### 4.2 Android Build
```
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
./gradlew assembleDebug

BUILD SUCCESSFUL in 3s
366 actionable tasks: 7 executed, 359 up-to-date
```
✅ Android build successful

### 4.3 Tests
UI tests were skipped due to missing `@testing-library/react` dependency. Test infrastructure setup is needed for comprehensive UI testing.

---

## 5. Architecture Decisions

### 5.1 Single-Step vs Multi-Step Flow
**Decision:** Single-step modal with optional customer/job association

**Rationale:**
- User can complete Quick Payment in 3 taps (Payments → Tap to Pay → Start)
- Customer/job is optional, not required
- Expandable section keeps UI clean
- Fastest path to payment is prioritized

### 5.2 Native-Only Availability
**Decision:** Show Tap to Pay card only on native Android when Stripe configured

**Rationale:**
- Web browsers cannot access NFC hardware
- Stripe Terminal SDK requires native platform
- Prevents confusion for web users
- Shows helpful "Mobile app only" message on web

### 5.3 Backend Reuse
**Decision:** No backend changes - existing endpoint already supports Quick Payments

**Rationale:**
- `leadId` and `jobId` already optional in payment-intent endpoint
- Server-side validation already in place
- Idempotency protection already implemented
- Payment_requests table already supports standalone payments
- Minimizes risk and complexity

### 5.4 Payment Data Model
**Decision:** Use existing payment_requests table for standalone payments

**Rationale:**
- No schema changes required
- Consistent payment history across all payment types
- Webhook reconciliation already handles card_present payments
- No fake jobs or customers needed

---

## 6. User Flow

### 6.1 Quick Payment Flow (No Customer/Job)
1. User opens Payments tab
2. User taps "Tap to Pay" card
3. QuickTapToPayModal opens
4. User enters amount (e.g., $50)
5. User taps "Start Tap to Pay"
6. TapToPayModal opens with payment collection
7. Customer taps card/phone
8. Payment succeeds
9. Modal closes
10. Payment recorded in payment_requests with lead_id=null, job_id=null

### 6.2 Contextual Payment Flow (With Customer/Job)
1. User opens Payments tab
2. User taps "Tap to Pay" card
3. QuickTapToPayModal opens
4. User enters amount
5. User expands customer selector
6. User selects customer
7. User optionally selects job
8. User taps "Start Tap to Pay"
9. TapToPayModal opens with payment collection
10. Customer taps card/phone
11. Payment succeeds
12. Modal closes
13. Payment recorded in payment_requests with lead_id and job_id

### 6.3 JobDetailsModal Flow (Preserved)
1. User opens JobDetailsModal for a job
2. User sees "Tap to Pay" button (if native supported and Stripe configured)
3. User taps "Tap to Pay"
4. TapToPayModal opens with job context
5. Payment collected
6. Payment recorded with job_id

---

## 7. Limitations and Future Work

### 7.1 Current Limitations
- **iOS Not Implemented:** Only Android Tap to Pay is implemented
- **No Refunds:** Refund flow not implemented
- **No Test Infrastructure:** UI tests not implemented due to missing dependencies
- **Web Fallback:** Web users see "Mobile app only" message but cannot use Tap to Pay

### 7.2 Future Work
1. **iOS Implementation:** Implement iOS Tap to Pay using Stripe Terminal iOS SDK
2. **Refund Flow:** Add refund capability for card_present payments
3. **Test Infrastructure:** Add React Testing Library and Vitest for UI testing
4. **Receipt Generation:** Generate receipts for in-person payments
5. **Multi-Reader Support:** Support for external readers (not just Tap to Pay)
6. **Payment History Enhancement:** Enhanced payment history with Tap to Pay transactions

---

## 8. Security Considerations

### 8.1 Payment Security
- PaymentIntent created server-side with proper authentication
- Idempotency prevents duplicate charges
- Webhook reconciliation ensures payment status accuracy
- Card data never touches client-side (handled by Stripe Terminal SDK)
- Business and Stripe Connect account resolved server-side

### 8.2 Device Security
- Stripe Terminal SDK enforces device security requirements
- NFC only available on secure devices
- Connection tokens fetched from backend with proper authentication

### 8.3 Access Control
- User authentication required via Supabase session
- Business ownership validation for leads/jobs
- Stripe Connect status validation before showing Tap to Pay
- Amount validation server-side

---

## 9. Deployment Checklist

### 9.1 Pre-Deployment
- ✅ TypeScript compilation validated
- ✅ Android build validated
- ✅ Native plugin SDK compatibility verified
- ✅ Backend endpoint audit completed
- ✅ Payment data mapping validated

### 9.2 Deployment Steps
1. Commit changes to version control
2. Deploy backend API endpoints (already deployed in Phase 3C)
3. Deploy Capacitor Android app with updated UI
4. Test in staging environment with physical device
5. Monitor webhook events for payment_intent.succeeded
6. Monitor error logs for terminal-related errors

### 9.3 Post-Deployment
- Monitor payment success rates
- Monitor error rates by error type
- Collect user feedback on Tap to Pay experience
- Review webhook reconciliation accuracy
- Track Quick Payment vs contextual payment usage

---

## 10. Conclusion

Standalone Tap to Pay has been successfully implemented in the Payments tab, providing a fast 3-tap path to collect in-person payments without requiring customer or job navigation. The implementation reuses existing Terminal infrastructure, preserves the contextual JobDetailsModal shortcut, and maintains all security and validation protections.

**Key Success Metrics:**
- ✅ Payments tab action cards implemented
- ✅ QuickTapToPayModal with single-step flow
- ✅ Optional customer/job association
- ✅ Native-only availability check
- ✅ Backend already supports Quick Payments
- ✅ TypeScript compilation passes
- ✅ Android build successful
- ✅ JobDetailsModal Tap to Pay preserved

**Next Steps:**
1. Deploy to staging environment
2. Test on physical Android device
3. Monitor payment success rates
4. Collect user feedback
5. Plan iOS implementation (Phase 3E)

---

## Appendix A: Files Changed

### A.1 Files Created
- `src/components/payments/QuickTapToPayModal.tsx` - Quick Tap to Pay modal (417 lines)

### A.2 Files Modified
- `src/app/dashboard/payments/page.tsx` - Added action cards and modal integration

### A.3 Files Unchanged (Reused)
- `src/components/payments/TapToPayModal.tsx` - Payment collection modal (no changes)
- `src/lib/terminal/service.ts` - Terminal service (no changes)
- `src/lib/terminal/index.ts` - Terminal types (no changes)
- `src/app/api/terminal/payment-intent/route.ts` - PaymentIntent endpoint (no changes)

---

## Appendix B: API Endpoints

### B.1 PaymentIntent Creation
**Endpoint:** `POST /api/terminal/payment-intent`  
**Status:** ✅ No changes required (already supports Quick Payments)  
**Description:** Creates card_present PaymentIntent for Tap to Pay

### B.2 Connection Token
**Endpoint:** `POST /api/terminal/connection-token`  
**Status:** ✅ No changes required  
**Description:** Fetches connection token for Terminal SDK

### B.3 Terminal Location
**Endpoint:** `GET /api/terminal/location`  
**Status:** ✅ No changes required  
**Description:** Fetches Terminal location ID

### B.4 Webhook Handler
**Endpoint:** `POST /api/stripe/webhook`  
**Status:** ✅ No changes required  
**Description:** Handles PaymentIntent lifecycle events including card_present

---

## Appendix C: Database Schema

### C.1 payment_requests Table
**Relevant Columns:**
- `payment_method_type` - Stores 'card_present' for Tap to Pay payments
- `stripe_payment_intent_id` - PaymentIntent ID
- `status` - Payment status (pending, paid, failed, canceled, expired)
- `amount_cents` - Payment amount in cents
- `payment_provider` - Payment provider (stripe, venmo, paypal)
- `lead_id` - Optional (null for Quick Payments)
- `job_id` - Optional (null for Quick Payments)
- `description` - Optional payment description

**No schema changes required.**

### C.2 stripe_webhook_events Table
**Purpose:** Idempotency tracking for webhook events  
**Status:** ✅ No changes required

---

## Appendix D: Environment Variables

### D.1 Required Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_TERMINAL_SECRET_KEY` - Stripe Terminal secret key (for location management)

### D.2 Build Variables
- `JAVA_HOME` - Android Studio JBR path (for Android builds)

---

**Report Generated:** July 22, 2026  
**Phase:** Standalone Tap to Pay Implementation  
**Status:** ✅ Complete
