-- Backfill retired_at for historical retired numbers
-- This migration safely infers retirement timestamps from existing fields

-- Backfill retired_at from trusted timestamps only:
-- 1. detached_at (most reliable - indicates when detached from business)
-- 2. updated_at only for confirmed manual retirement reasons (not account_deletion)
--
-- Rows without trustworthy retirement timestamps will retain retired_at = NULL
-- and must be manually reviewed before release

UPDATE twilio_numbers
SET retired_at = COALESCE(
  detached_at,
  CASE 
    -- Only use updated_at for confirmed manual retirement reasons
    -- account_deletion normally returns numbers to available, not retired
    WHEN detached_reason IN ('manual_retired', 'admin_retired', 'cleanup') THEN updated_at
    ELSE NULL
  END
)
WHERE status = 'retired'
  AND retired_at IS NULL;

-- Add comment to explain the backfill logic
COMMENT ON COLUMN twilio_numbers.retired_at IS 'Timestamp when number was marked as retired. Backfilled from detached_at (preferred) or updated_at (only for manual_retired, admin_retired, cleanup). NULL requires manual review before release.';

-- Provide counts for verification (informational, not applied)
-- SELECT 
--   COUNT(*) as total_retired,
--   COUNT(retired_at) as has_retired_at,
--   COUNT(CASE WHEN retired_at IS NOT NULL AND detached_at IS NOT NULL THEN 1 END) as backfilled_from_detached_at,
--   COUNT(CASE WHEN retired_at IS NOT NULL AND detached_at IS NULL AND detached_reason IN ('manual_retired', 'admin_retired', 'cleanup') THEN 1 END) as backfilled_from_updated_at,
--   COUNT(CASE WHEN retired_at IS NULL THEN 1 END) as needs_manual_review
-- FROM twilio_numbers
-- WHERE status = 'retired';

-- Numbers with retired_at still NULL after backfill require manual review:
-- SELECT id, phone_number, status, detached_at, detached_reason, created_at, updated_at
-- FROM twilio_numbers
-- WHERE status = 'retired' AND retired_at IS NULL;