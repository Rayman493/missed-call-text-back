-- Add forwarding_verified field to businesses table
-- This field persists forwarding verification state once set

ALTER TABLE businesses 
ADD COLUMN forwarding_verified BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX idx_businesses_forwarding_verified ON businesses(forwarding_verified);

-- Add comment
COMMENT ON COLUMN businesses.forwarding_verified IS 'Persistent flag indicating call forwarding has been verified. Once set to TRUE, never automatically reverts to FALSE.';
