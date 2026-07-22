-- Diagnostic query to identify stale Terminal payment records
-- This query identifies card_present payment_requests that have been pending for an extended period
-- Use this to investigate and reconcile stale records before taking any action

-- Identify Terminal payment requests that are still pending
-- Adjust the threshold based on your business requirements
SELECT 
  id,
  business_id,
  lead_id,
  job_id,
  amount_cents,
  currency,
  status,
  payment_method_type,
  stripe_payment_intent_id,
  stripe_connect_account_id,
  created_at,
  updated_at,
  expires_at
FROM payment_requests
WHERE 
  payment_method_type = 'card_present'
  AND status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour'  -- Adjust threshold as needed
ORDER BY created_at DESC;

-- For each stale record, manually verify the Stripe PaymentIntent status
-- before taking any action. Do not mass-update records without verification.

-- Example verification query for a specific PaymentIntent (run in Stripe Dashboard or API):
-- stripe paymentIntents retrieve pi_... --stripe-account acct_...

-- Based on the Stripe PaymentIntent status, appropriate actions:
-- - succeeded: Run reconciliation endpoint to mark as paid
-- - canceled: Mark local record as canceled
-- - requires_payment_method: Mark local record as failed
-- - processing: Leave as pending and check again later
-- - requires_capture: Unusual for Terminal, investigate

-- Never mass-mark all Pending records as canceled without verification,
-- as some may represent successful real charges that need reconciliation.
