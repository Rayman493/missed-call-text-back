-- Add manual access override fields to businesses table
-- This allows admins to grant free/extended access without Stripe

ALTER TABLE businesses
ADD COLUMN manual_access_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN manual_access_expires_at TIMESTAMPTZ NULL,
ADD COLUMN manual_access_reason TEXT NULL,
ADD COLUMN manual_access_note TEXT NULL,
ADD COLUMN manual_access_granted_at TIMESTAMPTZ NULL,
ADD COLUMN manual_access_granted_by UUID NULL;

-- Add index on manual_access_enabled for faster queries
CREATE INDEX idx_businesses_manual_access_enabled ON businesses(manual_access_enabled);

-- Add index on manual_access_expires_at for faster expiry checks
CREATE INDEX idx_businesses_manual_access_expires_at ON businesses(manual_access_expires_at);

-- Add foreign key constraint for manual_access_granted_by (references users table)
ALTER TABLE businesses
ADD CONSTRAINT fk_manual_access_granted_by
FOREIGN KEY (manual_access_granted_by)
REFERENCES auth.users(id)
ON DELETE SET NULL;
