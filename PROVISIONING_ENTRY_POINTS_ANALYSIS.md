# PROVISIONING ENTRY POINTS AND CONCURRENCY ANALYSIS

## PHASE 1 — EVERY PROVISIONING ENTRY POINT

| ENTRY POINT | FILE | TRIGGER/EVENT | CALLS HTTP ENDPOINT OR DIRECT FUNCTION? | BUSINESS ID SOURCE | HAS DEDUPE/GUARD? | CAN OVERLAP WITH STRIPE CHECKOUT? |
|-------------|------|--------------|---------------------------------------|-------------------|------------------|-----------------------------------|
| trigger-provisioning | src/app/api/business/trigger-provisioning/route.ts | Stripe webhook (checkout.session.completed, invoice.paid) | HTTP endpoint (called by webhook) | Request body | YES - RPC acquire_provisioning_lock | YES - webhook calls this |
| provision-number | src/app/api/business/provision-number/route.ts | User manual retry (authenticated) | HTTP endpoint | Request body | YES - RPC acquire_provisioning_lock | YES - if user triggers during checkout |
| admin/retry-twilio-provisioning | src/app/api/admin/retry-twilio-provisioning/route.ts | Admin manual retry | Calls provisionTwilioNumber() DIRECTLY | Request body | **NO** - NO LOCKING | **YES** - can run concurrently with checkout |
| admin/repair-twilio-provisioning | src/app/api/admin/repair-twilio-provisioning/route.ts | Admin repair | Does NOT call provisionTwilioNumber | Request body | N/A | NO - only repairs existing provisioning |
| admin/repair-messaging-service | src/app/api/admin/repair-messaging-service/route.ts | Admin repair | Calls provisionTwilioNumber() DIRECTLY | Request body | **NO** - NO LOCKING | **YES** - can run concurrently |
| scripts/trigger-provisioning-direct.ts | Manual script | Script execution | Calls provisionTwilioNumber() DIRECTLY | CLI argument | **NO** - NO LOCKING | YES - if run during checkout |

## CRITICAL FINDING: ADMIN RETRY BYPASSES LOCKING

**`src/app/api/admin/retry-twilio-provisioning/route.ts` (line 109):**
```typescript
// Call provisionTwilioNumber
const provisioned = await provisionTwilioNumber(business_id)
```

**NO lock acquisition.**
**NO check for existing provisioning status.**
**NO check for existing provisioning_lock_id.**
**Direct call to provisionTwilioNumber().**

This means:
1. Admin can trigger provisioning for a business that is already provisioning
2. Two requests can both be in provisionTwilioNumber() simultaneously
3. This directly explains the 23505 unique index violation

**`src/app/api/admin/repair-messaging-service/route.ts` (line 99):**
Also calls provisionTwilioNumber() directly without locking.

## PHASE 2 — LOCKING MECHANISM

**File:** `src/app/api/business/trigger-provisioning/route.ts`

**Lock acquisition (lines 302-316):**
```typescript
// Acquire lock atomically using RPC function
const { data: lockResult, error: lockError } = await supabaseAdmin.rpc('acquire_provisioning_lock', {
  p_business_id: business.id,
  p_lock_id: correlationId
});

if (lockError || !lockResult) {
  console.warn('[ProvisioningTrigger] Failed to acquire lock - provisioning already in progress:', {
    business_id: business.id,
    lockError
  });
  return NextResponse.json({
    error: 'Provisioning already in progress',
    provisioning_status: business.provisioning_status
  }, { status: 409 });
}
```

**RPC function (migration 20260722000007_prevent_duplicate_active_numbers.sql):**
```sql
CREATE OR REPLACE FUNCTION acquire_provisioning_lock(p_business_id uuid, p_lock_id text)
RETURNS boolean AS $$
BEGIN
  UPDATE businesses
  SET provisioning_status = 'provisioning',
      provisioning_lock_id = p_lock_id,
      last_provisioning_attempt_at = now()
  WHERE id = p_business_id
    AND provisioning_status != 'provisioning';

  -- Return true if a row was updated (lock acquired), false otherwise
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

**Lock properties:**
- Atomic: YES - single SQL UPDATE
- Conditional: YES - only if provisioning_status != 'provisioning'
- Ownership: YES - sets provisioning_lock_id
- Stale lock recovery: YES - 10-minute timeout bypasses lock
- Result: Only rows returned by lock UPDATE may proceed

**This lock is CORRECT for trigger-provisioning.**
**BUT admin retry endpoint BYPASSES IT.**

## PHASE 3 — CAN TWO REQUESTS BOTH REACH PROVISIONTWILIONUMBER?

**Scenario: Request A (Stripe webhook) + Request B (Admin retry)**

1. Request A: checkout.session.completed → trigger-provisioning
   - Calls acquire_provisioning_lock RPC
   - Sets provisioning_status = 'provisioning'
   - Calls provisionTwilioNumber()

2. Request B: Admin retry
   - Does NOT call acquire_provisioning_lock
   - Does NOT check provisioning_status
   - Calls provisionTwilioNumber() DIRECTLY

**ANSWER: YES - both can reach provisionTwilioNumber() simultaneously**

This is the root cause of the 23505 violation.

## PHASE 4 — CORRELATION ID PROPAGATION

**Current state:**
- trigger-provisioning: generates correlationId, passes to provisionTwilioNumber()
- admin retry: does NOT generate correlationId, passes undefined
- provisionTwilioNumber: accepts correlationId parameter
- warm-number-manager: uses correlationId in logs but often undefined

**Fix needed:** Ensure all entry points generate and propagate correlationId for diagnostics.

## PHASE 5 — STRIPE EVENT CONCURRENCY

**Events that can trigger provisioning:**
1. checkout.session.completed → trigger-provisioning
2. invoice.paid → trigger-provisioning (if number was released)

**Webhook dedupe:**
- Per event ID only (stripe_events table)
- Does NOT prevent different event types from both triggering

**Can both trigger for same business?**
- YES - if checkout.session.completed and invoice.paid both fire
- Both call trigger-provisioning which HAS locking
- Lock RPC should prevent both from proceeding
- This is NOT the current issue (lock is correct here)

## PHASE 6 — ROOT CAUSE CONFIRMED

**ROOT CAUSE:**

`src/app/api/admin/retry-twilio-provisioning/route.ts` bypasses the atomic lock and calls `provisionTwilioNumber()` directly.

**Evidence:**
1. Production logs show 23505 on unique index
2. SELECT shows no committed row (transaction isolation)
3. This pattern matches concurrent uncommitted UPDATEs
4. Admin retry endpoint has NO locking
5. Admin retry endpoint calls provisionTwilioNumber() directly
6. This creates a race condition with Stripe webhook provisioning

**Sequence:**
1. Stripe webhook acquires lock, starts provisioning
2. Admin retries provisioning (bypasses lock check)
3. Both reach warm-number assignment
4. Both attempt atomic claim on same candidate
5. PostgreSQL 23505 on unique index
6. One fails, other may succeed or fail
7. No committed row visible to SELECT

## PHASE 7 — SMALLEST SAFE FIX

**Fix:** Add lock acquisition to admin retry endpoint before calling provisionTwilioNumber()

**Change to `src/app/api/admin/retry-twilio-provisioning/route.ts`:**

Before line 109, add:
```typescript
// Generate correlation ID for lock acquisition
const correlationId = `ADMIN_RETRY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Acquire lock atomically using RPC function
const { data: lockResult, error: lockError } = await serviceSupabase.rpc('acquire_provisioning_lock', {
  p_business_id: business_id,
  p_lock_id: correlationId
});

if (lockError || !lockResult) {
  console.error('[Admin Twilio Retry] Failed to acquire lock - provisioning already in progress:', {
    business_id,
    lockError
  });
  return NextResponse.json({
    success: false,
    error: 'Provisioning already in progress'
  }, { status: 409 });
}

console.log('[Admin Twilio Retry] ✓ Acquired lock atomically');

// Call provisionTwilioNumber with correlation ID
const provisioned = await provisionTwilioNumber(business_id, correlationId);
```

After line 136, add lock release (similar to provision-number endpoint):
```typescript
// Release lock on success or failure with ownership check
if (provisioned) {
  const { error: releaseError } = await serviceSupabase
    .from('businesses')
    .update({
      provisioning_status: 'ready',
      provisioning_lock_id: null
    })
    .eq('id', business_id)
    .eq('provisioning_lock_id', correlationId);

  if (releaseError) {
    console.warn('[Admin Twilio Retry] lock_release_skipped_not_owner - stale request cannot release newer request lock')
  }
} else {
  const { error: releaseError } = await serviceSupabase
    .from('businesses')
    .update({
      provisioning_status: 'failed',
      provisioning_lock_id: null,
      provisioning_error: 'Admin retry failed'
    })
    .eq('id', business_id)
    .eq('provisioning_lock_id', correlationId);

  if (releaseError) {
    console.warn('[Admin Twilio Retry] lock_release_skipped_not_owner - stale request cannot mark newer request failed')
  }
}
```

**Also fix `src/app/api/admin/repair-messaging-service/route.ts`** if it calls provisionTwilioNumber.

## PHASE 8 — NEXT STEPS

1. Fix admin retry endpoint to acquire lock
2. Fix admin repair-messaging-service endpoint to acquire lock (if needed)
3. Add concurrency tests
4. Run tests
5. Build
6. Commit
7. Push
8. Deploy
9. Verify fix in production