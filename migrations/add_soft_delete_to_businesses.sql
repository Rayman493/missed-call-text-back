-- Add soft-delete columns to businesses table
-- This preserves business data for abuse prevention while marking as deleted

-- Add deleted_at column for soft-delete
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Add deleted_by column to track who deleted the account (admin vs self)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS deleted_by text;

-- Add deletion_reason column for audit trail
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS deletion_reason text;

-- Add index on deleted_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_deleted_at ON businesses(deleted_at);
CREATE INDEX IF NOT EXISTS idx_businesses_twilio_phone_number_deleted ON businesses(twilio_phone_number) WHERE deleted_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN businesses.deleted_at IS 'Soft-delete timestamp. NULL = active, non-NULL = deleted';
COMMENT ON COLUMN businesses.deleted_by IS 'Who deleted the account: "self" or "admin"';
COMMENT ON COLUMN businesses.deletion_reason IS 'Reason for deletion: "user_request", "admin_action", "fraud", "abuse", etc.';
