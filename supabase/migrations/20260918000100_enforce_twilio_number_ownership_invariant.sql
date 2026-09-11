-- Enforce canonical ownership invariant for business-owned Twilio numbers
--
-- Canonical invariant (per audit):
--   status IN ('assigned', 'active')  =>  business_id IS NOT NULL
--
-- Background:
--   The codebase assumes this invariant in every writer, reader, integrity monitor,
--   and the partial unique index idx_twilio_numbers_business_active_unique. However
--   business_id is nullable and uses ON DELETE SET NULL, so a hard business deletion
--   could silently produce status='assigned' with business_id=NULL. The cleanup cron
--   only processes retired/release_pending rows, so orphan assigned rows persisted
--   indefinitely and continued to receive voice-status callbacks.
--
-- Approach:
--   Use CHECK (...) NOT VALID so that:
--     * new INSERT / UPDATE operations MUST satisfy the invariant
--     * historical violations remain temporarily for deliberate reconciliation
--     * the constraint can be VALIDATEd later via ALTER TABLE ... VALIDATE CONSTRAINT
--       once historical orphan rows have been reconciled
--
-- Do NOT validate this constraint in this batch. Historical reconciliation is a
-- separate, deliberate operation.

-- 1. Re-add 'reserved' to the status CHECK constraint.
--    'reserved' is a legitimate canonical status written by:
--      - src/app/api/cron/reclaim-twilio-numbers/route.ts (churn grace period)
--      - src/app/api/admin/reset-test-data/route.ts (test reset)
--    and read by src/app/api/cron/process-expired-reservations/route.ts which
--    transitions expired reservations back to 'available'.
--    A later migration (20260705000001 / 20260722000000) accidentally dropped
--    'reserved' from the CHECK constraint, so writing it now violates the
--    constraint. Re-add it to match the canonical lifecycle.
ALTER TABLE twilio_numbers DROP CONSTRAINT IF EXISTS twilio_numbers_status_check;

ALTER TABLE twilio_numbers
ADD CONSTRAINT twilio_numbers_status_check
CHECK (status IN (
  'active', 'released', 'error',
  'available', 'assigned', 'failed', 'quarantined',
  'retired', 'release_pending', 'reserved'
));

-- 2. Enforce the ownership invariant for new writes only (NOT VALID).
--    Historical rows that violate the invariant remain queryable and are
--    intentionally left for a separate reconciliation batch.
ALTER TABLE twilio_numbers
ADD CONSTRAINT twilio_numbers_assigned_requires_business_id
CHECK (
  status NOT IN ('assigned', 'active')
  OR business_id IS NOT NULL
) NOT VALID;

COMMENT ON CONSTRAINT twilio_numbers_assigned_requires_business_id ON twilio_numbers IS
  'Business-owned statuses (assigned, active) require a non-null business_id. NOT VALID: historical violations are retained temporarily for deliberate reconciliation. Validate after reconciliation via ALTER TABLE twilio_numbers VALIDATE CONSTRAINT twilio_numbers_assigned_requires_business_id;';

COMMENT ON CONSTRAINT twilio_numbers_status_check ON twilio_numbers IS
  'Number status: active (in use), released (deleted from Twilio), error (legacy provisioning failed), available (warm inventory, unassigned), assigned (warm inventory or live purchase assigned to a business), failed (warm inventory provisioning failed), quarantined (warm inventory blocked from use), retired (blocked from reassignment, awaiting cleanup release), release_pending (cleanup claimed, attempting Twilio release), reserved (30-day churn grace period)';
