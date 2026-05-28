-- Add forwarding_verified_at field to businesses table
-- This field tracks when forwarding was first verified

ALTER TABLE businesses 
ADD COLUMN forwarding_verified_at TIMESTAMPTZ;

-- Add index for performance
CREATE INDEX idx_businesses_forwarding_verified_at ON businesses(forwarding_verified_at);

-- Add comment
COMMENT ON COLUMN businesses.forwarding_verified_at IS 'Timestamp when call forwarding was first verified. Set once and never updated.';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
