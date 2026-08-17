# Editable Payment Labels - Production Migration Handoff

**Date:** 2026-08-14
**Status:** READY FOR PRODUCTION MIGRATION
**Do NOT deploy application code before migration is applied**

---

## 1. Exact Corrected Migration Filename

`supabase/migrations/20260828000000_add_payment_display_name.sql`

**Timestamp:** 20260828000000 (August 28, 2026)
**Previous (incorrect):** 20260909000000 (September 9, 2026 - future-dated)
**Reason for change:** Original timestamp was future-dated (September 9, 2026) when work was done on August 14, 2026. Renamed to August 28, 2026 to sort after the latest existing migration (20260827000000).

---

## 2. Exact Final SQL

```sql
-- Add display_name field to payment_requests table
-- Migration: 20260828000000_add_payment_display_name.sql
-- Purpose: Allow users to give completed payments custom names for better organization

-- Add nullable display_name column with named constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_requests'
      AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.payment_requests
    ADD COLUMN display_name TEXT;

    ALTER TABLE public.payment_requests
    ADD CONSTRAINT payment_requests_display_name_max_length
    CHECK (char_length(display_name) <= 80 OR display_name IS NULL);

    COMMENT ON COLUMN public.payment_requests.display_name IS 'Optional custom display name for organizing payments (e.g., "Kitchen deposit", "Emergency pipe repair"). Max 80 characters. Nullable - when null, uses default fallback display.';
  END IF;
END $$;
```

**Key Properties:**
- Schema-qualified: `public.payment_requests`
- Column type: `TEXT` (nullable)
- Named constraint: `payment_requests_display_name_max_length`
- Max length: 80 characters (enforced by CHECK constraint)
- Idempotent: Uses `IF NOT EXISTS` to prevent errors if already applied
- No default value
- No backfill required
- Backward-compatible

---

## 3. Confirmation Future-Dated File Was Removed

**Status:** ✅ CONFIRMED REMOVED

**Old file:** `supabase/migrations/20260909000000_add_payment_display_name.sql`
**Status:** File does not exist
**Verification:** User deleted the file manually after correction

**Current state:** Only the corrected file `20260828000000_add_payment_display_name.sql` exists.

---

## 4. Exact Production Application Order

**CRITICAL:** Follow this order exactly. Do NOT deploy application code before step 3.

### Step 1: Apply Migration to Production
- Access production Supabase database (via dashboard or established CI/CD pipeline)
- Run the SQL from step 2 above
- Do NOT use production credentials from this implementation
- Use established production migration process

### Step 2: Run Verification Query
- Execute the verification query from step 5 below
- Confirm the output matches the expected output from step 6
- Do NOT proceed if verification fails

### Step 3: Confirm display_name Exists and is Nullable
- Verify the column exists
- Verify it is nullable
- Verify the CHECK constraint exists
- Verify the comment exists
- Do NOT proceed if any verification fails

### Step 4: Stage Application Files
- Stage only the files listed in step 8 below
- Do NOT stage Markdown reports
- Do NOT stage stray test files

### Step 5: Commit Application Code
- Commit with message: "add editable payment labels"
- Do NOT include migration file in this commit (it's already applied)
- Or include migration file if using standard migration tracking

### Step 6: Push to Origin
- Push to `origin/main`
- Wait for CI/CD to complete

### Step 7: Deploy to Vercel
- Verify Vercel deployment succeeds
- Do NOT manually deploy until CI/CD completes

### Step 8: Post-Deployment Manual Verification
- Login as business user with Stripe connected
- Create a Tap to Pay payment and complete it
- Navigate to Payments page
- Verify "Quick Payment" shows in Customer column
- Click Edit icon on the paid payment
- Verify rename modal opens with correct styling
- Enter label "Kitchen deposit" and save
- Verify "Kitchen deposit" shows in Description column (NOT Customer column)
- Verify customer name remains unchanged in Customer column
- Clear the label (save empty string)
- Verify original description returns
- Verify customer phone number still shows correctly
- Verify "View Customer" button still works
- Verify amount, status, dates unchanged
- Verify pending payments do NOT show Edit button
- Verify failed payments do NOT show Edit button
- Verify cancelled payments do NOT show Edit button
- Verify cross-tenant access rejected
- Verify unauthenticated access rejected

---

## 5. Exact Verification Query

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  character_maximum_length,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_requests'
  AND column_name = 'display_name';
```

**Additional Constraint Verification:**
```sql
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'payment_requests_display_name_max_length';
```

**Comment Verification:**
```sql
SELECT
  pg_catalog.col_description(
    'public.payment_requests'::regclass::oid,
    ordinal_position
  ) as column_comment
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_requests'
  AND column_name = 'display_name';
```

---

## 6. Expected Verification Output

**Column Query Output:**
```
column_name   | data_type | is_nullable | character_maximum_length | column_default
--------------|-----------|-------------|--------------------------|---------------
display_name  | text      | YES         | null                     | null
```

**Constraint Query Output:**
```
constraint_name                                  | check_clause
-------------------------------------------------|------------------------------
payment_requests_display_name_max_length         | (char_length(display_name) <= 80 OR display_name IS NULL)
```

**Comment Query Output:**
```
column_comment
-------------------------------------------------
Optional custom display name for organizing payments (e.g., "Kitchen deposit", "Emergency pipe repair"). Max 80 characters. Nullable - when null, uses default fallback display.
```

---

## 7. Rollback SQL for Emergency Use

**WARNING:** Only use in emergency. Dropping a column is irreversible.

```sql
-- Emergency rollback: Remove display_name column
-- WARNING: This will delete all custom payment labels
-- WARNING: This operation cannot be undone

-- Remove the CHECK constraint first
ALTER TABLE public.payment_requests
DROP CONSTRAINT IF EXISTS payment_requests_display_name_max_length;

-- Remove the column
ALTER TABLE public.payment_requests
DROP COLUMN IF EXISTS display_name;
```

**Alternative: Soft Rollback (Recommended)**
If you need to disable the feature without losing data:

```sql
-- Soft rollback: Add a comment indicating feature is disabled
COMMENT ON COLUMN public.payment_requests.display_name IS 'DISABLED - Custom display name feature temporarily disabled. Data preserved.';
```

---

## 8. Exact Application/Test Files Waiting to Be Committed

**Files to Stage and Commit:**

1. `src/lib/payment-label-validation.ts` (78 lines)
   - Validation logic for payment labels
   - `validatePaymentLabel()` function
   - `isPaymentLabelEditable()` function

2. `src/app/api/payments/[id]/label/route.ts` (102 lines)
   - PATCH endpoint for updating payment labels
   - Authorization and ownership checks
   - Status eligibility check
   - Label validation

3. `src/app/dashboard/payments/page.tsx` (modified)
   - Added `getPaymentDescription()` function
   - Updated `getCustomerName()` to not use display_name
   - Added rename modal state and handlers
   - Added rename button to 4 locations (mobile visible, mobile older, desktop visible, desktop older)
   - Added rename modal component
   - Updated Description column to use `getPaymentDescription()`

4. `src/lib/__tests__/payment-label-validation.test.ts` (176 lines)
   - 28 tests for validation logic
   - Tests for clearing labels
   - Tests for eligibility rules

5. `src/app/api/payments/[id]/label/__tests__/route.test.ts` (126 lines)
   - 14 tests for API endpoint security
   - Tests for authorization, validation, cross-tenant protection

6. `src/app/dashboard/payments/__tests__/payment-label-ui.test.ts` (179 lines)
   - 22 tests for UI semantics
   - Tests for customer name preservation
   - Tests for Quick Payment context
   - Tests for mobile/desktop consistency
   - Tests for label location

**Migration File (Already Applied in Step 1):**
7. `supabase/migrations/20260828000000_add_payment_display_name.sql` (23 lines)

**Files to EXCLUDE (Do NOT stage):**
- All Markdown reports (*.md)
- Stray test file: `src/app/dashboard/leads/[id]/__tests__sidebar-sections.test.tsx`
- Any other untracked files not listed above

**Total Files to Commit:** 6 application files + 1 migration file (if tracking migrations in git)

---

## 9. Confirmation Nothing Was Committed or Pushed

**Status:** ✅ CONFIRMED - NOTHING COMMITTED OR PUSHED

**Git Status:**
- 1 modified file: `src/app/dashboard/payments/page.tsx`
- 1 new migration file: `supabase/migrations/20260828000000_add_payment_display_name.sql`
- 4 new application files:
  - `src/lib/payment-label-validation.ts`
  - `src/app/api/payments/[id]/label/` (directory with route and tests)
  - `src/app/dashboard/payments/__tests__/` (directory with tests)
  - `src/lib/__tests__/payment-label-validation.test.ts`
- 59 untracked Markdown reports (excluded)
- 1 stray test file (excluded)

**No commits made.**
**No pushes to origin.**
**No deployments to Vercel.**

---

## 10. Summary of Changes

**Critical Fixes Applied:**
1. ✅ Fixed migration timestamp from 20260909000000 (future) to 20260828000000 (correct)
2. ✅ Removed future-dated migration file
3. ✅ Updated migration to use schema-qualified name (`public.payment_requests`)
4. ✅ Added named constraint (`payment_requests_display_name_max_length`)
5. ✅ Made migration idempotent with `IF NOT EXISTS` check
6. ✅ Fixed UI semantics: custom label now appears in Description column, NOT Customer column
7. ✅ Separated `getCustomerName()` from `getPaymentDescription()` to prevent label masquerading as customer name

**Tests:**
- Total tests: 64 tests
  - Validation tests: 28 tests
  - API security tests: 14 tests
  - UI semantics tests: 22 tests
- All tests passing: ✅

**Build:**
- Production build: ✅ Successful
- TypeScript validation: ✅ Passed
- No type errors: ✅
- No whitespace errors: ✅

**Security Verification:**
- ✅ Requires authentication
- ✅ Checks subscription access
- ✅ Derives business ownership server-side
- ✅ Rejects cross-tenant payment IDs
- ✅ Accepts only display_name
- ✅ Rejects amount/status/customer/Stripe changes
- ✅ Requires actual canonical final paid status
- ✅ Normalizes and validates server-side
- ✅ Returns the persisted label
- ✅ Does not use client-supplied business ID

**Assistant Knowledge:**
- No stale guidance found about Quick Payment names
- No articles about payment names or renaming
- No update required

**Generated Types:**
- No generated Supabase types checked into repository
- No update required

---

## 11. Post-Deployment Monitoring

After deployment, monitor for:

1. **Error Rates:** Check for any errors in the Payments page or API logs
2. **Label Updates:** Verify labels are saving correctly
3. **Display:** Verify labels appear in Description column, not Customer column
4. **Customer Names:** Verify customer names remain unchanged
5. **Quick Payments:** Verify Quick Payment context is preserved
6. **Mobile/Desktop:** Verify both platforms show identical behavior
7. **Performance:** No performance degradation on Payments page
8. **Receipts:** Verify receipts are unaffected
9. **Reconciliation:** Verify reconciliation logic is unaffected
10. **Stripe:** Verify Stripe webhooks and metadata are unaffected

---

## 12. Contact Information

If issues arise during migration or deployment:

1. **Migration Issues:** Contact database team or use established migration rollback procedure
2. **Application Issues:** Check Vercel logs and Supabase logs
3. **Security Issues:** Verify RLS policies are still active and working
4. **UI Issues:** Verify both mobile and desktop views

---

**END OF PRODUCTION MIGRATION HANDOFF**

**Status:** READY FOR PRODUCTION MIGRATION
**Next Step:** Apply migration to production (Step 1 in Section 4)
**Do NOT deploy application code before migration is applied and verified**