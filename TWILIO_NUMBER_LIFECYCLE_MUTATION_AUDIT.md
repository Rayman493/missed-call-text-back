# Twilio Number Lifecycle Mutation Audit

**Date**: 2026-08-03
**Scope**: All production code paths that can modify Twilio number ownership or lifecycle
**Objective**: Identify every path that could allow an active business's assigned number to become available or detached

---

## EXECUTIVE SUMMARY

**Total Mutation Paths Identified**: 15 distinct production code paths

**P0 Risks (Active Customer Impact)**: 2 paths
- Account deletion recycling (no protected account check, no forwarding field reset)
- Admin retire-twilio-number (no subscription status check)

**P1 Risks (Data Integrity)**: 3 paths
- Admin reprovision-twilio-number (no protected account check)
- Admin support-action release_now (no protected account check)
- Manual provision scripts (no safety checks)

**P2 Risks (Defensive Programming)**: 5 paths
- Missing compare-and-swap conditions in reclaim operations
- Missing businesses.assigned_twilio_number_id verification in cleanup
- Missing businesses.twilio_phone_number verification in account deletion

---

## COMPLETE CALL GRAPH

### MUTATION PATH 1: Account Deletion Recycling

**Route**: `POST /api/account/delete`
**File**: `src/app/api/account/delete/route.ts`
**Helper**: `src/lib/warm-number-manager.ts::recycleTwilioNumberToInventory()`

**Call Graph**:
```
/api/account/delete (POST)
  ↓ User authentication + password verification
  ↓ Fetch businesses by user_id
  ↓ Cancel Stripe subscription
  ↓ Delete child records (leads, messages, conversations, etc.)
  ↓ [MUTATION] recycleTwilioNumberToInventory(phoneNumber, phoneNumberSid, businessId)
    ↓ isSystemPhoneNumber() check
    ↓ Verify Twilio ownership
    ↓ [MUTATION] UPDATE twilio_numbers SET
      - business_id = NULL
      - status = 'available'
      - sms_status = 'ready' or 'pending'
      - assigned_at = NULL
      - detached_at = NOW()
      - detached_reason = 'account_deletion'
      WHERE twilio_sid = phoneNumberSid AND business_id = businessId
    ↓ [MUTATION] UPDATE businesses SET
      - assigned_twilio_number_id = NULL
      - twilio_phone_number = NULL
      - twilio_phone_number_sid = NULL
      - twilio_messaging_service_sid = NULL
      - provisioning_status = NULL
      - provisioning_error = NULL
      - provisioned_at = NULL
      WHERE id = businessId
```

**Preconditions**:
- User authenticated
- Password verified
- User owns the businesses being deleted

**Safety Checks**:
- ✅ isSystemPhoneNumber() check
- ❌ NO is_protected_account check
- ❌ NO subscription_status check
- ❌ NO forwarding field reset (forwarding_verified, call_forwarding_enabled, call_forwarding_status)

**Transaction Boundaries**: None (multiple sequential updates)

**Locking Strategy**: None

**Risk Level**: P0 - Can affect protected accounts without protection check

---

### MUTATION PATH 2: Admin Retire Twilio Number

**Route**: `POST /api/admin/retire-twilio-number`
**File**: `src/app/api/admin/retire-twilio-number/route.ts`

**Call Graph**:
```
/api/admin/retire-twilio-number (POST)
  ↓ User authentication
  ↓ isAdmin() check
  ↓ [MUTATION] UPDATE twilio_numbers SET
    - status = 'retired'
    - business_id = NULL
    - released_at = NOW()
    - last_error = reason
    - detached_at = NOW()
    - detached_reason = reason or 'admin_retired'
    WHERE phone_number = phoneNumber
  ↓ [IF business exists] UPDATE businesses SET
    - twilio_phone_number = NULL
    - twilio_phone_number_sid = NULL
    - twilio_messaging_service_sid = NULL
    - provisioning_status = 'needs_reprovision'
    - provisioning_error = 'Previous Twilio number was retired'
    - forwarding_verified = false
    - call_forwarding_enabled = false
    WHERE id = business.id
```

**Preconditions**:
- User authenticated
- isAdmin() check
- Phone number exists in twilio_numbers table

**Safety Checks**:
- ❌ NO subscription_status check
- ❌ NO is_protected_account check
- ✅ Checks if number already retired
- ✅ Clears forwarding fields from businesses table

**Transaction Boundaries**: None (two sequential updates)

**Locking Strategy**: None

**Risk Level**: P0 - Can retire numbers from active/trialing businesses without subscription check

---

### MUTATION PATH 3: Admin Reprovision Twilio Number

**Route**: `POST /api/admin/reprovision-twilio-number`
**File**: `src/app/api/admin/reprovision-twilio-number/route.ts`

**Call Graph**:
```
/api/admin/reprovision-twilio-number (POST)
  ↓ User authentication
  ↓ isAdmin() check
  ↓ [MUTATION] UPDATE businesses SET
    - twilio_phone_number = NULL
    - twilio_phone_number_sid = NULL
    - twilio_messaging_service_sid = NULL
    - provisioning_status = 'provisioning'
    - provisioning_error = NULL
    - forwarding_verified = false
    - call_forwarding_enabled = false
    WHERE id = businessId
```

**Preconditions**:
- User authenticated
- isAdmin() check
- force=true OR provisioning_status='needs_reprovision'

**Safety Checks**:
- ❌ NO is_protected_account check
- ✅ Clears forwarding fields

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: P1 - Can clear numbers from protected accounts without protection check

---

### MUTATION PATH 4: Admin Support Action - Release Now

**Route**: `POST /api/admin/support-action`
**File**: `src/app/api/admin/support-action/route.ts`

**Call Graph**:
```
/api/admin/support-action (POST) with action='release_twilio_number_now'
  ↓ User authentication
  ↓ isAdmin() check
  ↓ [MUTATION] UPDATE businesses SET
    - twilio_phone_number = NULL
    - twilio_phone_number_sid = NULL
    - twilio_messaging_service_sid = NULL
    - provisioning_status = 'released'
    - twilio_released_at = NOW()
    - twilio_release_status = 'released'
    - twilio_release_reason = 'admin_manual_release'
    - twilio_release_at = NULL
    - forwarding_verified = false
    - call_forwarding_enabled = false
    - onboarding_status = 'number_released'
    WHERE id = businessId
```

**Preconditions**:
- User authenticated
- isAdmin() check

**Safety Checks**:
- ❌ NO is_protected_account check
- ❌ NO subscription_status check
- ✅ Clears forwarding fields

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: P1 - Can release numbers from active/protected businesses without checks

---

### MUTATION PATH 5: Reclaim Twilio Numbers (Cron Job)

**Route**: `GET/POST /api/cron/reclaim-twilio-numbers`
**File**: `src/app/api/cron/reclaim-twilio-numbers/route.ts`

**Call Graph**:
```
/api/cron/reclaim-twilio-numbers (GET/POST)
  ↓ verifyCronRequest()
  ↓ SELECT businesses WHERE
    - twilio_release_status = 'scheduled'
    - twilio_release_at <= NOW()
    - twilio_phone_number IS NOT NULL
  ↓ FOR EACH business:
    ↓ isSystemPhoneNumber() check
    ↓ subscription_status IN ('active', 'trialing') check → SKIP
    ↓ hasActiveManualAccess() check → SKIP
    ↓ PROTECTED_TWILIO_NUMBERS check → SKIP
    ↓ Shared toll-free number check → SKIP
    ↓ Number used by another business check → SKIP
    ↓ [MUTATION] UPDATE twilio_numbers SET
      - status = 'reserved'
      - business_id = NULL
      - reserved_for_business_id = business.id
      - reserved_at = NOW()
      - reserved_expires_at = NOW() + 30 days
      - reservation_reason = 'churn_grace_period_expired'
      - detached_at = NOW()
      - detached_reason = 'churn_grace_period_expired'
      WHERE business_id = business.id
    ↓ [MUTATION] UPDATE businesses SET
      - twilio_phone_number = NULL
      - twilio_phone_number_sid = NULL
      - twilio_messaging_service_sid = NULL
      - provisioning_status = 'released'
      - twilio_released_at = NOW()
      - twilio_release_status = 'released'
      - twilio_release_reason = 'churn_grace_period_expired'
      - forwarding_verified = false
      - call_forwarding_enabled = false
      - onboarding_status = 'number_released'
      WHERE id = business.id
```

**Preconditions**:
- CRON_SECRET authentication
- twilio_release_status='scheduled'
- twilio_release_at <= NOW()

**Safety Checks**:
- ✅ isSystemPhoneNumber() check
- ✅ subscription_status IN ('active', 'trialing') check → SKIP
- ✅ hasActiveManualAccess() check → SKIP
- ✅ PROTECTED_TWILIO_NUMBERS check → SKIP
- ✅ Shared number check → SKIP
- ✅ Number used by another business check → SKIP
- ✅ Clears forwarding fields

**Transaction Boundaries**: None (sequential updates within loop)

**Locking Strategy**: None

**Risk Level**: LOW - Comprehensive safety checks for active businesses

---

### MUTATION PATH 6: Twilio Number Cleanup (Cron Job)

**Route**: `GET/POST /api/cron/twilio-number-cleanup`
**File**: `src/app/api/cron/twilio-number-cleanup/route.ts`
**Helper**: `src/lib/twilio-number-cleanup.ts`

**Call Graph**:
```
/api/cron/twilio-number-cleanup (GET/POST)
  ↓ verifyCronRequest()
  ↓ createCleanupRun()
  ↓ getEligibleNumbers():
    SELECT twilio_numbers WHERE
      - status IN ('retired', 'release_pending')
      - business_id IS NULL
      - retired_at IS NOT NULL
      - reserved_expires_at IS NULL OR <= NOW()
      - retired_at <= quarantine_cutoff
      - release_attempt_count < MAX_ATTEMPTS
      - next_release_retry_at IS NULL OR <= NOW()
      - twilio_sid IS NOT NULL
    ↓ Filter protected numbers
    ↓ Check recent activity (conversations, messages)
  ↓ FOR EACH eligible number:
    ↓ claimNumberForRelease():
      - Fetch current state
      - business_id check → SKIP if not null
      - reserved_expires_at check → SKIP if active
      - Stale claim recovery logic
      - [MUTATION] UPDATE twilio_numbers SET
        - status = 'release_pending'
        - cleanup_run_id = runId
        - last_release_attempt_at = NOW()
        WHERE id = numberId AND status='retired' AND business_id IS NULL
    ↓ releaseTwilioNumber():
      - Refetch current state
      - business_id check → ABORT if not null
      - [MUTATION] UPDATE twilio_numbers SET
        - status = 'released'
        - released_at = NOW()
        - released_reason = reason
        - business_id = NULL
        - cleanup_run_id = runId
        WHERE id = numberId
      ↓ Release from Twilio (after DB update)
```

**Preconditions**:
- CRON_SECRET authentication
- TWILIO_RETIRED_CLEANUP_ENABLED=true
- Retired count >= threshold

**Safety Checks**:
- ✅ business_id IS NULL required
- ✅ status IN ('retired', 'release_pending') required
- ✅ retired_at IS NOT NULL required
- ✅ No active reservation required
- ✅ Quarantine period required
- ✅ Protected numbers excluded
- ✅ Recent activity check
- ✅ Re-validation before Twilio release

**Transaction Boundaries**: Atomic compare-and-swap on claim

**Locking Strategy**: Compare-and-swap with run ID verification

**Risk Level**: LOW - Cannot affect assigned numbers (requires business_id IS NULL)

---

### MUTATION PATH 7: Replenish Warm Numbers (Cron Job)

**Route**: `GET/POST /api/cron/replenish-warm-numbers`
**File**: `src/app/api/cron/replenish-warm-numbers/route.ts`
**Helper**: `src/lib/warm-number-manager.ts::ensureWarmNumberMinimum()`

**Call Graph**:
```
/api/cron/replenish-warm-numbers (GET/POST)
  ↓ verifyCronRequest()
  ↓ ensureWarmNumberMinimum()
    ↓ getInventoryMetrics()
    ↓ IF availableCount > target:
      ↓ cleanupExcessInventory():
        SELECT twilio_numbers WHERE
          - business_id IS NULL
          - status = 'available'
          - sms_status = 'ready'
          - provisioning_status = 'ready'
        ↓ selectExcessNumbersForTrim()
        ↓ FOR EACH excess number:
          ↓ Re-validate state
          - business_id IS NULL check
          - status = 'available' check
          - sms_status = 'ready' check
          - provisioning_status = 'ready' check
          ↓ [MUTATION] UPDATE twilio_numbers SET
            - status = 'retired'
            - detached_at = NOW()
            - detached_reason = 'excess_inventory_cleanup'
            WHERE id = number.id
          ↓ Release from Twilio (after DB update)
    ↓ IF availableCount < target:
      ↓ provisionWarmNumber() × N
```

**Preconditions**:
- CRON_SECRET authentication

**Safety Checks**:
- ✅ business_id IS NULL required
- ✅ status = 'available' required
- ✅ sms_status = 'ready' required
- ✅ provisioning_status = 'ready' required
- ✅ Re-validation before mutation

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: LOW - Cannot affect assigned numbers (requires business_id IS NULL)

---

### MUTATION PATH 8: Trigger Provisioning

**Route**: `POST /api/business/trigger-provisioning`
**File**: `src/app/api/business/trigger-provisioning/route.ts`
**Helper**: `src/lib/twilio-provisioning-service.ts::purchaseAndProvisionNumber()`

**Call Graph**:
```
/api/business/trigger-provisioning (POST)
  ↓ User authentication
  ↓ provisioning_lock_id check (prevent concurrent provisioning)
  ↓ purchaseAndProvisionNumber():
    ↓ Check for reserved numbers (strong reclaim)
      ↓ IF reserved:
        ↓ [MUTATION] UPDATE twilio_numbers SET
          - business_id = businessId
          - status = 'active'
          - assigned_at = NOW()
          - detached_at = NULL
          - detached_reason = NULL
          WHERE id = reservedNumber.id
        ↓ [MUTATION] UPDATE businesses SET
          - twilio_phone_number = reservedNumber.phone_number
          - twilio_phone_number_sid = reservedNumber.twilio_sid
          - assigned_twilio_number_id = reservedNumber.id
          - twilio_messaging_service_sid = messagingServiceSid
          - provisioning_status = 'ready'
          WHERE id = businessId
    ↓ Check for available numbers
      ↓ IF available:
        ↓ [MUTATION] UPDATE twilio_numbers SET
          - business_id = businessId
          - status = 'active'
          - assigned_at = NOW()
          - detached_at = NULL
          - detached_reason = NULL
          WHERE id = availableNumber.id
        ↓ [MUTATION] UPDATE businesses SET
          - twilio_phone_number = availableNumber.phone_number
          - twilio_phone_number_sid = availableNumber.twilio_sid
          - assigned_twilio_number_id = availableNumber.id
          - twilio_messaging_service_sid = messagingServiceSid
          - provisioning_status = 'ready'
          WHERE id = businessId
    ↓ Purchase new number from Twilio
      ↓ [MUTATION] INSERT twilio_numbers
      ↓ [MUTATION] UPDATE businesses SET
  ↓ [MUTATION] UPDATE businesses SET
    - provisioning_status = 'completed'
    - provisioning_lock_id = NULL
    WHERE id = businessId
```

**Preconditions**:
- User authenticated
- User owns the business
- provisioning_lock_id not set

**Safety Checks**:
- ✅ provisioning_lock_id prevents concurrent provisioning
- ✅ isSystemPhoneNumber() check when selecting from inventory
- ✅ Clears detached_at/detached_reason on assignment

**Transaction Boundaries**: None (sequential operations)

**Locking Strategy**: provisioning_lock_id

**Risk Level**: LOW - Assignment path with locking

---

### MUTATION PATH 9: Get Business By Twilio Number (Self-Healing)

**File**: `src/lib/supabase/admin.ts::getBusinessByTwilioNumber()`

**Call Graph**:
```
getBusinessByTwilioNumber(phoneNumber)
  ↓ Primary lookup: SELECT twilio_numbers WHERE
    - phone_number = phoneNumber
    - business_id IS NOT NULL
  ↓ IF found:
    ↓ SELECT businesses WHERE id = twilio_number.business_id
    ↓ IF businesses.assigned_twilio_number_id not set:
      ↓ [MUTATION] UPDATE businesses SET
        - assigned_twilio_number_id = twilio_number.id
        WHERE id = business.id
  ↓ IF not found:
    ↓ Fallback: SELECT businesses WHERE
      - twilio_phone_number = phoneNumber
    ↓ IF found:
      ↓ Check if twilio_numbers row exists for SID
      ↓ IF not exists:
        ↓ [MUTATION] INSERT twilio_numbers
        ↓ [MUTATION] UPDATE businesses SET
          - assigned_twilio_number_id = insertedTwilioNumber.id
          WHERE id = business.id
```

**Preconditions**: None (internal helper)

**Safety Checks**:
- ✅ Only updates if assigned_twilio_number_id is not set
- ✅ Only creates missing twilio_numbers rows

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: LOW - Self-healing only fixes missing data, doesn't break valid state

---

### MUTATION PATH 10: Assign Warm Number to Business

**File**: `src/lib/warm-number-manager.ts::assignWarmNumberToBusiness()`

**Call Graph**:
```
assignWarmNumberToBusiness(phoneNumber, businessId)
  ↓ [MUTATION] UPDATE twilio_numbers SET
    - status = 'assigned'
    - business_id = businessId
    - assigned_at = NOW()
    - sms_status = 'ready'
    - provisioning_status = 'ready'
    - detached_at = NULL
    - detached_reason = NULL
    WHERE phone_number = phoneNumber AND status = 'available'
```

**Preconditions**: None (internal helper)

**Safety Checks**:
- ✅ Requires status = 'available'
- ❌ NO business_id IS NULL check in WHERE clause

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: MEDIUM - Could overwrite business_id if number already assigned

---

### MUTATION PATH 11: Get And Assign Warm Number

**File**: `src/lib/warm-number-manager.ts::getAndAssignWarmNumber()`

**Call Graph**:
```
getAndAssignWarmNumber(businessId)
  ↓ [MUTATION] UPDATE twilio_numbers SET
    - status = 'assigned'
    - business_id = businessId
    - assigned_at = NOW()
    - sms_status = 'ready'
    - provisioning_status = 'ready'
    - sender_pool_attached_at = NOW()
    - detached_at = NULL
    - detached_reason = NULL
    WHERE business_id IS NULL
      AND status = 'available'
      AND sms_status = 'ready'
      AND provisioning_status = 'ready'
    ORDER BY created_at ASC
    LIMIT 1
```

**Preconditions**: None (internal helper)

**Safety Checks**:
- ✅ business_id IS NULL required
- ✅ status = 'available' required
- ✅ sms_status = 'ready' required
- ✅ provisioning_status = 'ready' required

**Transaction Boundaries**: Atomic UPDATE with WHERE conditions

**Locking Strategy**: Atomic claim via WHERE conditions

**Risk Level**: LOW - Safe atomic assignment

---

### MUTATION PATH 12: Provision Warm Number

**File**: `src/lib/warm-number-manager.ts::provisionWarmNumber()`

**Call Graph**:
```
provisionWarmNumber(businessId)
  ↓ getAndAssignWarmNumber(businessId)
  ↓ IF assigned:
    ↓ Verify Twilio ownership
    ↓ IF not owned:
      ↓ [MUTATION] UPDATE twilio_numbers SET
        - status = 'retired'
        - detached_at = NOW()
        - detached_reason = 'twilio_number_not_owned'
        - business_id = NULL
        WHERE id = warmNumber.id
      ↓ RETURN error
    ↓ Attach to messaging service
    ↓ [MUTATION] UPDATE businesses SET
      - twilio_phone_number = warmNumber.phone_number
      - twilio_phone_number_sid = warmNumber.twilio_sid
      - assigned_twilio_number_id = warmNumber.id
      - twilio_messaging_service_sid = messagingServiceSid
      - provisioning_status = 'ready'
      WHERE id = businessId
```

**Preconditions**: None (internal helper)

**Safety Checks**:
- ✅ Verifies Twilio ownership before assignment
- ✅ Retires number if not owned by Twilio
- ❌ NO is_protected_account check

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: MEDIUM - Could provision to protected accounts without check

---

### MUTATION PATH 13: Self-Heal Twilio Number Not Owned

**File**: `src/lib/warm-number-manager.ts::selfHealTwilioNumberNotOwned()`

**Call Graph**:
```
selfHealTwilioNumberNotOwned(business)
  ↓ [MUTATION] UPDATE twilio_numbers SET
    - status = 'retired'
    - detached_at = NOW()
    - detached_reason = 'twilio_number_not_owned'
    - business_id = NULL
    WHERE twilio_sid = business.twilio_phone_number_sid
  ↓ [MUTATION] UPDATE businesses SET
    - twilio_phone_number = NULL
    - twilio_phone_number_sid = NULL
    - twilio_messaging_service_sid = NULL
    - provisioning_status = NULL
    - provisioning_error = 'Previous number not owned by Twilio'
    - provisioned_at = NULL
    WHERE id = business.id
```

**Preconditions**: None (internal helper)

**Safety Checks**:
- ✅ Only called when Twilio ownership verification fails
- ❌ NO subscription_status check
- ❌ NO is_protected_account check

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: MEDIUM - Could clear numbers from active/protected businesses

---

### MUTATION PATH 14: Admin Reset Test Data

**Route**: `POST /api/admin/reset-test-data`
**File**: `src/app/api/admin/reset-test-data/route.ts`

**Call Graph**:
```
/api/admin/reset-test-data (POST)
  ↓ User authentication
  ↓ isAdmin() check
  ↓ Confirmation phrase required
  ↓ Check is_protected_account → BLOCK if true
  ↓ Delete business records
  ↓ [MUTATION] UPDATE twilio_numbers SET
    - status = 'reserved'
    - business_id = NULL
    - reserved_for_business_id = businessId
    - reserved_at = NOW()
    - reserved_expires_at = NOW() + 30 days
    - reservation_reason = 'test_business_data_reset'
    WHERE phone_number IN (affected numbers)
```

**Preconditions**:
- User authenticated
- isAdmin() check
- Confirmation phrase
- mode='execute'

**Safety Checks**:
- ✅ is_protected_account check
- ✅ Confirmation phrase required
- ✅ Sets status='reserved', not 'available'

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: LOW - Protected account check present

---

### MUTATION PATH 15: Schedule Twilio Release

**File**: `src/lib/twilio-reclamation.ts::scheduleTwilioRelease()`

**Call Graph**:
```
scheduleTwilioRelease(businessId, reason, graceDays)
  ↓ [MUTATION] UPDATE businesses SET
    - twilio_release_at = NOW() + graceDays
    - twilio_release_status = 'scheduled'
    - twilio_release_reason = reason
    WHERE id = businessId
```

**Preconditions**: None (internal helper)

**Safety Checks**:
- ❌ NO subscription_status check
- ❌ NO is_protected_account check

**Transaction Boundaries**: None

**Locking Strategy**: None

**Risk Level**: MEDIUM - Can schedule release for active/protected businesses

---

## RISK ANALYSIS

### P0 RISKS (Active Customer Impact)

**Risk 1: Account Deletion Recycling**
- **Path**: Mutation Path 1
- **Issue**: NO is_protected_account check
- **Issue**: NO subscription_status check
- **Issue**: NO forwarding field reset
- **Likelihood**: HIGH
- **Impact**: Protected accounts can have numbers recycled without protection
- **Fix**: Add is_protected_account check before calling recycleTwilioNumberToInventory
- **Fix**: Reset forwarding fields (forwarding_verified, call_forwarding_enabled, call_forwarding_status, onboarding_status)

**Risk 2: Admin Retire Twilio Number**
- **Path**: Mutation Path 2
- **Issue**: NO subscription_status check
- **Issue**: NO is_protected_account check
- **Likelihood**: HIGH
- **Impact**: Admin can retire numbers from active/trialing businesses
- **Fix**: Add subscription_status IN ('active', 'trialing') check
- **Fix**: Add is_protected_account check

### P1 RISKS (Data Integrity)

**Risk 3: Admin Reprovision Twilio Number**
- **Path**: Mutation Path 3
- **Issue**: NO is_protected_account check
- **Likelihood**: MEDIUM
- **Impact**: Admin can clear numbers from protected accounts
- **Fix**: Add is_protected_account check

**Risk 4: Admin Support Action - Release Now**
- **Path**: Mutation Path 4
- **Issue**: NO is_protected_account check
- **Issue**: NO subscription_status check
- **Likelihood**: MEDIUM
- **Impact**: Admin can release numbers from active/protected businesses
- **Fix**: Add is_protected_account check
- **Fix**: Add subscription_status IN ('active', 'trialing') check

**Risk 5: Manual Provision Scripts**
- **Paths**: Mutation Path 10, 12
- **Issue**: NO safety checks
- **Likelihood**: LOW (manual scripts)
- **Impact**: Could overwrite business_id or provision to wrong business
- **Fix**: Add business_id IS NULL check in assignWarmNumberToBusiness
- **Fix**: Add is_protected_account check in provisionWarmNumber

### P2 RISKS (Defensive Programming)

**Risk 6: Missing Compare-And-Swap in Reclaim**
- **Path**: Mutation Path 5
- **Issue**: No compare-and-swap conditions on businesses update
- **Likelihood**: LOW
- **Impact**: Race condition between reclamation and reactivation
- **Fix**: Add WHERE conditions to verify twilio_release_status and twilio_release_at

**Risk 7: Missing businesses.assigned_twilio_number_id Verification**
- **Path**: Mutation Path 1, 2, 4, 5
- **Issue**: No verification that businesses.assigned_twilio_number_id doesn't reference the number
- **Likelihood**: LOW
- **Impact**: Orphaned references could remain after detachment
- **Fix**: Check businesses table for references before detaching

**Risk 8: Missing businesses.twilio_phone_number Verification**
- **Path**: Mutation Path 1, 13
- **Issue**: No verification that businesses.twilio_phone_number doesn't reference the number
- **Likelihood**: LOW
- **Impact**: Orphaned references could remain after detachment
- **Fix**: Check businesses table for references before detaching

**Risk 9: Self-Heal Without Subscription Check**
- **Path**: Mutation Path 13
- **Issue**: NO subscription_status check
- **Likelihood**: LOW
- **Impact**: Could clear numbers from active businesses
- **Fix**: Add subscription_status check before self-healing

**Risk 10: Schedule Release Without Checks**
- **Path**: Mutation Path 15
- **Issue**: NO subscription_status or is_protected_account check
- **Likelihood**: LOW
- **Impact**: Could schedule release for active/protected businesses
- **Fix**: Add checks before scheduling release

---

## REQUIRED FIXES (Ranked by Priority)

### P0 Fixes (Critical)

1. **Add is_protected_account check to account deletion**
   - File: `src/app/api/account/delete/route.ts`
   - Location: Before calling recycleTwilioNumberToInventory (line ~910)
   - Fix: Check `is_protected_account` flag on businesses table
   - Block account deletion if protected

2. **Add subscription_status check to admin retire-twilio-number**
   - File: `src/app/api/admin/retire-twilio-number/route.ts`
   - Location: Before mutation (line ~89)
   - Fix: Check `subscription_status IN ('active', 'trialing')`
   - Block retirement if active or trialing

3. **Reset forwarding fields in account deletion recycling**
   - File: `src/lib/warm-number-manager.ts`
   - Location: recycleTwilioNumberToInventory() businesses update (line ~991)
   - Fix: Add forwarding field resets:
     - forwarding_verified = false
     - call_forwarding_enabled = false
     - call_forwarding_status = null
     - onboarding_status = null

### P1 Fixes (High)

4. **Add is_protected_account check to admin reprovision-twilio-number**
   - File: `src/app/api/admin/reprovision-twilio-number/route.ts`
   - Location: Before mutation (line ~73)

5. **Add is_protected_account check to admin support-action release_now**
   - File: `src/app/api/admin/support-action/route.ts`
   - Location: Before mutation (line ~280)

6. **Add business_id IS NULL check to assignWarmNumberToBusiness**
   - File: `src/lib/warm-number-manager.ts`
   - Location: assignWarmNumberToBusiness() (line ~538)
   - Fix: Add `.is('business_id', null)` to WHERE clause

7. **Add is_protected_account check to provisionWarmNumber**
   - File: `src/lib/warm-number-manager.ts`
   - Location: provisionWarmNumber() (line ~590)

### P2 Fixes (Medium)

8. **Add compare-and-swap to reclaim-twilio-numbers**
   - File: `src/app/api/cron/reclaim-twilio-numbers/route.ts`
   - Location: businesses update (line ~247)
   - Fix: Add WHERE conditions:
     - twilio_release_status = 'scheduled'
     - twilio_release_at <= NOW()

9. **Add businesses.assigned_twilio_number_id verification**
   - Files: All paths that detach numbers
   - Fix: Check for businesses referencing the number before detachment

10. **Add businesses.twilio_phone_number verification**
    - Files: All paths that detach numbers
    - Fix: Check for businesses referencing the phone number before detachment

11. **Add subscription_status check to self-heal**
    - File: `src/lib/warm-number-manager.ts`
    - Location: selfHealTwilioNumberNotOwned() (line ~800)

12. **Add checks to scheduleTwilioRelease**
    - File: `src/lib/twilio-reclamation.ts`
    - Location: scheduleTwilioRelease() (line ~62)

---

## TRANSACTION BOUNDARIES ANALYSIS

**Paths with atomic operations**:
- Mutation Path 6 (twilio-number-cleanup): Compare-and-swap on claim
- Mutation Path 11 (getAndAssignWarmNumber): Atomic UPDATE with WHERE conditions

**Paths without transaction boundaries**:
- All other paths use sequential updates without transactions

**Recommendation**: Add database transactions for critical multi-table operations (account deletion, reclaim operations)

---

## LOCKING STRATEGY ANALYSIS

**Paths with locking**:
- Mutation Path 8 (trigger-provisioning): provisioning_lock_id

**Paths without locking**:
- All other paths

**Recommendation**: Add row-level locks or advisory locks for critical operations

---

## CONCLUSION

**Total Mutation Paths**: 15

**Safe Paths (Comprehensive Safety Checks)**:
- Mutation Path 5 (reclaim-twilio-numbers)
- Mutation Path 6 (twilio-number-cleanup)
- Mutation Path 7 (replenish-warm-numbers)
- Mutation Path 8 (trigger-provisioning)
- Mutation Path 9 (getBusinessByTwilioNumber self-healing)
- Mutation Path 11 (getAndAssignWarmNumber)
- Mutation Path 14 (admin reset-test-data)

**Risky Paths (Missing Critical Checks)**:
- Mutation Path 1 (account deletion) - P0
- Mutation Path 2 (admin retire-twilio-number) - P0
- Mutation Path 3 (admin reprovision-twilio-number) - P1
- Mutation Path 4 (admin support-action release_now) - P1
- Mutation Path 10 (assignWarmNumberToBusiness) - P1
- Mutation Path 12 (provisionWarmNumber) - P1
- Mutation Path 13 (self-heal) - P2
- Mutation Path 15 (scheduleTwilioRelease) - P2

**Primary Recommendation**: Implement P0 fixes immediately to prevent protected account number loss.
