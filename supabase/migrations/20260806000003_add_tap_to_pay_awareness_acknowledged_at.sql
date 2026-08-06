-- Add Tap to Pay on iPhone awareness acknowledgment field to businesses table
-- Migration: 20260806000003_add_tap_to_pay_awareness_acknowledged_at.sql
-- Purpose: Track when eligible existing users acknowledge the Tap to Pay on iPhone awareness modal

BEGIN;

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS tap_to_pay_awareness_acknowledged_at timestamptz;

COMMENT ON COLUMN businesses.tap_to_pay_awareness_acknowledged_at IS 'Timestamp when the business acknowledged the Tap to Pay on iPhone awareness modal. NULL means not yet acknowledged. Used to show the awareness moment only once to eligible existing users.';

COMMIT;
