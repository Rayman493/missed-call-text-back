-- Backfill retired_at for historical retired numbers
-- This migration safely infers retirement timestamps from existing fields

-- First, analyze the current state (this is informational, not applied)
-- SELECT 
--   COUNT(*) as total_retired,
--   COUNT(retired_at) as has_retired_at,
--   COUNT(detached_at) as has_detached_at,
--   COUNT(CASE WHEN retired_at IS NULL THEN 1 END) as needs_backfill
-- FROM twilio_numbers
-- WHERE status = 'retired';

-- Backfill retired_at from trusted timestamps in priority order:
-- 1. detached_at (most reliable - indicates when detached from business)
-- 2. updated_at (if recent and not reflecting unrelated edits)
-- 3. created_at (fallback - at least gives a maximum age)
-- 4. Leave null if no reliable timestamp can be inferred

UPDATE twilio_numbers
SET retired_at = COALESCE(
  detached_at,
  CASE 
    -- Only use updated_at if detached_reason suggests retirement
    WHEN detached_reason IN ('account_deletion', 'manual_retired', 'admin_retired', 'cleanup') THEN updated_at
    ELSE NULL
  END,
  created_at
)
WHERE status = 'retired'
  AND retired_at IS NULL;

-- Add comment to explain the backfill logic
COMMENT ON COLUMN twilio_numbers.retired_at IS 'Timestamp when number was marked as retired. Backfilled from detached_at (preferred), updated_at (if retirement-related), or created_at (fallback).';

-- Note: Numbers with retired_at still NULL after backfill should be excluded from automatic release
-- and flagged for manual review. These can be identified with:
-- SELECT id, phone_number, status, detached_at, detached_reason, created_at, updated_at
-- FROM twilio_numbers
-- WHERE status = 'retired' AND retired_at IS NULL;