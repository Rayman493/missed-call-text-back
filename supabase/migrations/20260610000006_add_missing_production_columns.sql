-- Add missing columns to production schema
-- Migration: 20260610000006_add_missing_production_columns.sql
-- Purpose: Add correlation_id to ai_call_sessions and source to leads
-- These columns are missing in production but required by application code
-- Backfill based on actual production audit results

-- ============================================================
-- 1. ADD correlation_id TO ai_call_sessions
-- ============================================================

-- Add column (idempotent)
ALTER TABLE public.ai_call_sessions
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Add index for efficient querying by correlation_id
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_correlation_id
ON public.ai_call_sessions(correlation_id);

-- Add comment
COMMENT ON COLUMN public.ai_call_sessions.correlation_id IS
'Unified correlation ID for tracing AI call lifecycle across all components (Twilio webhook, AI session, transcript, customer creation, notifications)';

-- ============================================================
-- 2. ADD source TO leads
-- ============================================================

-- Add column as NULL initially (safe for existing rows)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS source TEXT;

-- Backfill rows with proven manual provenance only
UPDATE public.leads
SET source = 'manual'
WHERE source IS NULL
  AND (
    raw_metadata->>'creation_source' IN (
      'manual',
      'manual_entry',
      'manual_backfill',
      'manual_payment_request'
    )
    OR raw_metadata->>'source' IN (
      'manual',
      'manual_entry',
      'manual_backfill',
      'manual_payment_request'
    )
  );

-- Set DEFAULT for new inserts only
ALTER TABLE public.leads
ALTER COLUMN source SET DEFAULT 'ai_voice';

-- Add CHECK constraint (allows canonical values OR NULL)
-- PostgreSQL DO block for idempotent constraint creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_source_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_source_check
      CHECK (source IN ('ai_voice', 'sms', 'manual', 'web') OR source IS NULL);
  END IF;
END
$$;

-- Add index for source analytics
CREATE INDEX IF NOT EXISTS idx_leads_source
ON public.leads(source);

-- Add comment
COMMENT ON COLUMN public.leads.source IS
'Canonical lead source classification: ai_voice (AI phone intake), sms (SMS interaction), manual (manual entry), web (web form). NULL for historical rows with uncertain provenance.';