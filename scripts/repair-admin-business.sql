-- Safe repair for ReplyFlowHQ Admin business (4bd736a4-c55f-4451-8858-79e3380e8a1d)
-- This script sets the business to needs_reprovision state before triggering the canonical reprovisioning workflow
--
-- Context: The business references a Twilio number (+19853321745 / PN23f607a3eea412730ce6baf7cb2e97ff)
-- that no longer exists in Twilio (404 error). The canonical twilio_numbers row shows:
-- status = retired, business_id = null, detached_reason = manual_inventory_reconciliation_not_in_twilio
--
-- This script safely prepares the business for canonical reprovisioning by setting provisioning_status
-- to 'needs_reprovision'. The /api/admin/reprovision-twilio-number endpoint will then:
-- 1. Clear stale Twilio assignment (twilio_phone_number, twilio_phone_number_sid, etc.)
-- 2. Trigger canonical provisioning workflow
-- 3. Assign a new valid number from warm inventory or purchase a new one

-- Update business to needs_reprovision state
UPDATE businesses
SET 
  provisioning_status = 'needs_reprovision',
  provisioning_error = 'Twilio number PN23f607a3eea412730ce6baf7cb2e97ff not found during inventory reconciliation on 2026-07-05',
  last_provisioning_attempt_at = NOW()
WHERE id = '4bd736a4-c55f-4451-8858-79e3380e8a1d';

-- Verify the update
SELECT 
  id,
  name,
  twilio_phone_number,
  twilio_phone_number_sid,
  provisioning_status,
  provisioning_error,
  assigned_twilio_number_id
FROM businesses
WHERE id = '4bd736a4-c55f-4451-8858-79e3380e8a1d';
