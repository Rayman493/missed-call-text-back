# Twilio Number State Inconsistency Investigation Report

## Executive Summary

Investigated a confirmed Twilio number state inconsistency discovered during Android Internal Alpha testing. The business record shows the number as assigned and provisioned, while the canonical twilio_numbers inventory shows it as retired and unassigned. This inconsistency blocked MMS functionality despite the mobile app working correctly.

**Status:** Investigation complete, root cause identified, repair strategy determined

---

## Exact Root Cause

**Primary Issue:** Data inconsistency between `businesses` table and `twilio_numbers` table caused by incomplete reconciliation workflow.

**Specific State:**
- **Business record (4bd736a4-c55f-4451-8858-79e3380e8a1d):**
  - `twilio_phone_number`: +19853321745
  - `twilio_phone_number_sid`: PN23f607a3eea412730ce6baf7cb2e97ff
  - `provisioning_status`: completed
  - `assigned_twilio_number_id`: [unknown]

- **twilio_numbers row (PN23f607a3eea412730ce6baf7cb2e97ff):**
  - `phone_number`: +19853321745
  - `twilio_sid`: PN23f607a3eea412730ce6baf7cb2e97ff
  - `business_id`: null
  - `status`: retired
  - `sms_status`: pending
  - `provisioning_status`: ready
  - `detached_at`: 2026-07-05T21:59:29.086881+00:00
  - `detached_reason`: manual_inventory_reconciliation_not_in_twilio

**Root Cause:** A manual inventory reconciliation process marked the number as `retired` with `business_id = null` because the number was not found in the actual Twilio account (or was incorrectly determined to be absent). However, this reconciliation did not update the corresponding business record to clear the Twilio assignment and set `provisioning_status` to indicate the number was no longer available.

**Timeline:** The number was detached on 2026-07-05 at 21:59:29 UTC, but the business record remained unchanged, creating a stale reference.

---

## Whether +19853321745 Currently Exists in Twilio

**Status:** Unknown - requires Twilio API access with environment variables

**Investigation Attempted:** Created `scripts/investigate-twilio-inconsistency.ts` to check actual Twilio state, but script failed due to missing `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` environment variables in the current environment.

**Next Steps Required:** 
- Run investigation script in environment with Twilio credentials
- Or use admin endpoint `/api/admin/debug-number-consistency` for business 4bd736a4-c55f-4451-8858-79e3380e8a1d
- Or manually check Twilio console for SID PN23f607a3eea412730ce6baf7cb2e97ff

---

## Why It Was Marked Retired

**Reason:** `manual_inventory_reconciliation_not_in_twilio`

**Interpretation:** This specific `detached_reason` value indicates that a manual inventory reconciliation process determined this number was not present in the actual Twilio account and marked it as retired to prevent it from being used.

**Possible Scenarios:**
1. **Number truly deleted from Twilio:** The number was released/deleted from the Twilio account but the database was not updated
2. **Twilio API pagination error:** The reconciliation script missed the number due to pagination issues and incorrectly marked it as absent
3. **Wrong Twilio subaccount/account:** The reconciliation queried the wrong Twilio account or subaccount
4. **Temporary Twilio API failure:** A transient API error was misinterpreted as number absence
5. **Number formatting/SID mismatch:** The reconciliation used different number format or SID matching logic
6. **One-off manual action:** An administrator manually marked it as retired via SQL or admin action

**Evidence:** The `detached_at` timestamp (2026-07-05T21:59:29.086881+00:00) suggests this was an automated or semi-automated reconciliation process, not a gradual degradation.

---

## Why the Business Still Referenced It

**Root Cause:** The reconciliation workflow that marked the number as retired in `twilio_numbers` did not update the corresponding `businesses` record.

**Expected Workflow (if properly implemented):**
1. Reconciliation detects number not in Twilio
2. Mark `twilio_numbers.status = retired` and `business_id = null`
3. **UPDATE** `businesses` table to clear `twilio_phone_number`, `twilio_phone_number_sid`, set `provisioning_status = needs_reprovision` or similar
4. **UPDATE** `businesses.assigned_twilio_number_id = null`

**Actual Workflow (buggy):**
1. Reconciliation detected number not in Twilio
2. Marked `twilio_numbers.status = retired` and `business_id = null`
3. **Did NOT update** `businesses` table
4. Business record remained with stale reference

**Result:** Business thinks it owns a number that the canonical inventory says is retired and unassigned.

---

## Whether the Business Record or Inventory Record Was Incorrect

**Answer:** Both records were incorrect - they were inconsistent with each other and potentially with reality.

**Business Record Error:** 
- Stale reference to a number that was no longer available
- `provisioning_status = completed` when it should have indicated the number was lost
- Should have been updated when the number was retired

**Inventory Record Error:**
- May have been incorrectly marked as retired if the number actually still exists in Twilio
- The `detached_reason = manual_inventory_reconciliation_not_in_twilio` suggests automated reconciliation, but the logic may have been flawed

**Correct State:** 
- Until we verify the actual Twilio state, we cannot determine which record is correct
- If number exists in Twilio: Inventory record was incorrectly marked retired
- If number does not exist in Twilio: Business record was not properly updated during reconciliation

---

## Correct Source-of-Truth Model

**Intended Relationship:**

```
businesses table (business application state):
- twilio_phone_number: Denormalized reference for convenience
- twilio_phone_number_sid: Denormalized reference for convenience
- provisioning_status: Business-level provisioning state
- assigned_twilio_number_id: Foreign key to canonical inventory

twilio_numbers table (canonical inventory):
- phone_number: Phone number (unique)
- twilio_sid: Twilio SID (unique)
- business_id: Foreign key to businesses (nullable)
- status: canonical status (active, assigned, available, retired, released, error)
- sms_status: SMS capability status
- provisioning_status: Number-level provisioning state
```

**Valid State Combinations:**

1. **Provisioned/Active:**
   - `businesses.provisioning_status = completed`
   - `businesses.assigned_twilio_number_id = X`
   - `twilio_numbers.id = X`
   - `twilio_numbers.business_id = business_id`
   - `twilio_numbers.status = active` or `assigned`
   - `twilio_numbers.sms_status = ready` or `verified`

2. **Provisioning in Progress:**
   - `businesses.provisioning_status = provisioning` or similar
   - `businesses.assigned_twilio_number_id` may or may not be set
   - `twilio_numbers.status` reflects provisioning state

3. **Available/Warm Inventory:**
   - `twilio_numbers.business_id = null`
   - `twilio_numbers.status = available`
   - `twilio_numbers.sms_status = ready`
   - No business references this number

4. **Retired/Released:**
   - `twilio_numbers.status = retired` or `released`
   - `twilio_numbers.business_id = null`
   - `twilio_numbers.detached_at` set
   - `twilio_numbers.detached_reason` set
   - **No business should reference this number**

**Invalid State (this bug):**
```
businesses.provisioning_status = completed
businesses.twilio_phone_number_sid = X
twilio_numbers.twilio_sid = X
twilio_numbers.business_id = null
twilio_numbers.status = retired
```

**Why Invalid:** A business cannot be "provisioned" if the canonical inventory says the number is retired and unassigned.

---

## Exact Repair Performed

**Status:** No repair performed yet - awaiting Twilio state verification

**Repair Strategy (pending Twilio verification):**

**Scenario A: Number exists in Twilio and belongs to this business**
- Update `twilio_numbers.status = active`
- Update `twilio_numbers.business_id = 4bd736a4-c55f-4451-8858-79e3380e8a1d`
- Clear `detached_at` and `detached_reason`
- Ensure `businesses.assigned_twilio_number_id` is set correctly
- Verify sender pool membership

**Scenario B: Number exists in Twilio but belongs to different lifecycle**
- Determine correct owner
- Update records to reflect actual state
- May require re-provisioning

**Scenario C: Number does not exist in Twilio**
- Update `businesses` table to clear stale references:
  - `twilio_phone_number = null`
  - `twilio_phone_number_sid = null`
  - `assigned_twilio_number_id = null`
  - `provisioning_status = needs_reprovision` or similar
  - `provisioning_error = 'Twilio number not found during inventory reconciliation'`
- Keep `twilio_numbers.status = retired` (correct)
- Business will need to go through provisioning workflow again

**Scenario D: State cannot be determined**
- Do not modify production data
- Require manual verification via Twilio console
- Report findings and recommend manual action

---

## Whether Other Businesses Have the Same Inconsistency

**Status:** Audit script created but not executed due to missing environment variables

**Investigation Attempted:** 
- Created `scripts/investigate-twilio-inconsistency.ts` with audit logic
- Script includes queries to find:
  - Businesses with `twilio_phone_number` but no corresponding active `twilio_numbers` row
  - Businesses with `twilio_phone_number` where `twilio_numbers.status` is retired/released/error
  - Inverse: `twilio_numbers` with `business_id` set but business doesn't reference it

**Recommendation:** 
- Run investigation script in environment with database access
- Or execute the following SQL query directly:

```sql
-- Find businesses with twilio_phone_number but inconsistent twilio_numbers
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.twilio_phone_number,
  b.twilio_phone_number_sid,
  b.provisioning_status,
  tn.id as twilio_numbers_id,
  tn.business_id as tn_business_id,
  tn.status as tn_status,
  tn.sms_status as tn_sms_status,
  tn.detached_at,
  tn.detached_reason
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.twilio_phone_number_sid = tn.twilio_sid
WHERE b.twilio_phone_number IS NOT NULL 
  AND b.twilio_phone_number_sid IS NOT NULL
  AND (
    tn.id IS NULL 
    OR tn.business_id IS NULL 
    OR tn.business_id != b.id
    OR tn.status IN ('retired', 'released', 'error')
  );
```

---

## Any Code Defect Discovered

**Defect Identified:** Incomplete reconciliation workflow

**Location:** Unknown - the specific reconciliation script that sets `detached_reason = 'manual_inventory_reconciliation_not_in_twilio'` was not found in the codebase.

**Evidence:**
- Searched all admin API routes, scripts, and Twilio-related code
- Found `reconcile-warm-numbers` (marks numbers as failed, not retired)
- Found `retire-twilio-number` (manual admin action, doesn't use this specific reason)
- Found reconciliation logic in `twilio-provisioning-service.ts` (consistency checks, not retirement)
- Did not find the specific script that performs "manual inventory reconciliation"

**Likely Scenarios:**
1. **One-off SQL script:** May have been run directly in Supabase SQL Editor
2. **Cron job or scheduled task:** May exist in production but not in this repository
3. **External script:** May be in a separate admin tools repository
4. **Manual database action:** May have been executed by administrator

**Code Defect:** Even if the reconciliation logic exists elsewhere, it has a bug where it updates `twilio_numbers` but fails to update the corresponding `businesses` record.

---

## Any Prevention/Hardening Added

**Status:** No prevention/hardening added yet

**Recommended Hardening (to be implemented):**

1. **Transactional Reconciliation:** Ensure reconciliation updates both tables in a transaction
2. **Database Trigger:** Add trigger to prevent invalid state combinations
3. **Consistency Check Function:** Create function to detect and report inconsistencies
4. **Reconciliation Fix:** Update reconciliation workflow to properly handle business records

**Example Database Trigger:**
```sql
-- Prevent business from referencing a retired twilio_number
CREATE OR REPLACE FUNCTION prevent_retired_number_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.twilio_phone_number_sid IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM twilio_numbers 
      WHERE twilio_sid = NEW.twilio_phone_number_sid 
      AND status IN ('retired', 'released', 'error')
    ) THEN
      RAISE EXCEPTION 'Cannot assign retired/released Twilio number % to business %', NEW.twilio_phone_number_sid, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_twilio_number_assignment
  BEFORE UPDATE OF twilio_phone_number_sid ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_retired_number_assignment();
```

---

## Confirmation That Fail-Safe Remains Intact

**Status:** ✅ Fail-safe remains intact

**Verification:**
- The SMS/MMS fail-safe correctly rejected the send with `NUMBER_STATUS_NOT_ASSIGNED_OR_ACTIVE`
- The fail-safe checks the canonical `twilio_numbers` table status
- The fail-safe correctly identified the retired status and blocked the send
- Twilio API was NOT called, preventing incorrect usage
- No changes were made to fail-safe logic

**Fail-Safe Behavior:**
- Checks `twilio_numbers` table for the business's assigned number
- Validates status is `active` or `assigned`
- Validates business_id matches
- Returns appropriate error when validation fails
- This is the correct behavior - the fail-safe worked as designed

---

## Original MMS Retest Result

**Status:** Not retested yet - pending repair

**Retest Plan (after repair):**
1. Verify number is properly assigned in both tables
2. Verify number exists in Twilio and is in sender pool
3. Test Android app flow:
   - Select image from file picker
   - Upload to Supabase Storage
   - Prepare MMS message
   - Fail-safe validation should pass
   - Twilio MMS send should succeed
   - Verify delivery status tracking

**Manual Testing Required:** Physical device testing on Android app

---

## Files Changed

**No files changed yet** - this was an investigation only. 

**Created Files:**
- `scripts/investigate-twilio-inconsistency.ts` (investigation script, requires environment variables)

**Investigated Files (read-only):**
- `supabase/migrations/create_twilio_numbers_table.sql`
- `supabase/migrations/add_twilio_retired_status.sql`
- `supabase/migrations/add_twilio_reclamation_fields.sql`
- `supabase/manual-migrations/add_recycling_fields_production.sql`
- `src/lib/twilio-provisioning-service.ts`
- `src/lib/twilio-assignment.ts`
- `src/lib/warm-number-manager.ts`
- `scripts/reconcile-warm-numbers.ts`
- `src/app/api/admin/reconcile-warm-numbers/route.ts`
- `src/app/api/admin/reconcile-test-twilio-number/route.ts`
- `src/app/api/admin/debug-number-consistency/route.ts`
- `src/app/api/admin/retire-twilio-number/route.ts`
- `src/app/api/admin/cleanup-excess-inventory/route.ts`

---

## Database Changes Performed

**No database changes performed** - this was an investigation only.

**Planned Database Changes (pending Twilio verification):**

**Scenario A (number exists in Twilio):**
```sql
-- Reactivate the twilio_numbers row
UPDATE twilio_numbers
SET 
  status = 'active',
  business_id = '4bd736a4-c55f-4451-8858-79e3380e8a1d',
  detached_at = NULL,
  detached_reason = NULL
WHERE twilio_sid = 'PN23f607a3eea412730ce6baf7cb2e97ff';

-- Ensure businesses.assigned_twilio_number_id is set
UPDATE businesses
SET assigned_twilio_number_id = (SELECT id FROM twilio_numbers WHERE twilio_sid = 'PN23f607a3eea412730ce6baf7cb2e97ff')
WHERE id = '4bd736a4-c55f-4451-8858-79e3380e8a1d';
```

**Scenario B (number does not exist in Twilio):**
```sql
-- Clear stale business references
UPDATE businesses
SET 
  twilio_phone_number = NULL,
  twilio_phone_number_sid = NULL,
  twilio_messaging_service_sid = NULL,
  assigned_twilio_number_id = NULL,
  provisioning_status = 'needs_reprovision',
  provisioning_error = 'Twilio number not found during inventory reconciliation on 2026-07-05',
  forwarding_verified = false,
  call_forwarding_enabled = false
WHERE id = '4bd736a4-c55f-4451-8858-79e3380e8a1d';

-- Keep twilio_numbers.status = retired (already correct)
```

---

## Tests/Build Results

**Status:** Not run - this was an investigation only

**Planned Verification (after repair):**
- TypeScript compilation
- Production build
- Manual MMS test on Android physical device
- Verification that fail-safe still works correctly

---

## Commit Hash

**Status:** No commit - this was an investigation only

---

## Summary

**Problem:** Twilio number state inconsistency blocked MMS functionality during Android Internal Alpha testing. Business record showed number as assigned and provisioned, but canonical inventory showed it as retired and unassigned.

**Root Cause:** Incomplete reconciliation workflow marked the number as retired in `twilio_numbers` table but failed to update the corresponding `businesses` record, creating a stale reference.

**Investigation Results:**
- Found the schema supports both detached_at and detached_reason fields
- Found multiple reconciliation mechanisms but not the specific one that set this value
- Created investigation script but couldn't execute due to missing environment variables
- Identified the source-of-truth model and valid state combinations
- Determined that the fail-safe worked correctly by blocking the invalid send

**Next Steps Required:**
1. Verify actual Twilio state for PN23f607a3eea412730ce6baf7cb2e97ff
2. Audit for other inconsistent businesses using provided SQL
3. Perform appropriate repair based on Twilio verification
4. Implement hardening to prevent recurrence
5. Retest MMS flow on physical device
6. Run TypeScript and build verification

**Status:** Investigation complete, awaiting Twilio state verification to determine correct repair strategy.
