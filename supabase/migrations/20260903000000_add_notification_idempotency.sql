-- Add idempotency key column to prevent duplicate AI intake notifications
-- Migration: 20260903000000_add_notification_idempotency.sql
-- Purpose: Add atomic idempotency for ai_intake_completed notifications to prevent race conditions

-- Add idempotency_key column (nullable for backward compatibility)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index for atomic idempotency
-- PostgreSQL allows multiple NULL values in unique indexes, so no partial index needed
-- This ensures only one notification per (business_id, type, idempotency_key)
-- when idempotency_key is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_business_type_idempotency
  ON public.notifications(business_id, type, idempotency_key);

-- Add comment
COMMENT ON COLUMN public.notifications.idempotency_key IS 'Idempotency key to prevent duplicate notifications (e.g., aiCallRecordId for ai_intake_completed)';
COMMENT ON INDEX idx_notifications_business_type_idempotency IS 'Unique constraint for atomic notification deduplication. Allows NULL values for non-idempotent notification types.';