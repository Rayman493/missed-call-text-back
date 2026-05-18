-- Add comprehensive provisioning states to twilio_numbers table
-- Migration: add_comprehensive_provisioning_states.sql

-- Add new provisioning status column with explicit states
ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS provisioning_status text default 'purchasing' 
CHECK (provisioning_status IN (
  'purchasing',           -- Number is being purchased
  'purchased',            -- Number purchased, SID saved
  'campaign_registering', -- Campaign registration in progress
  'campaign_registered',  -- Campaign registration complete
  'sender_pool_attaching',-- Sender pool attachment in progress
  'ready',                -- Number fully provisioned and ready for use
  'failed'                -- Provisioning failed
));

-- Add provisioning error tracking
ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS provisioning_error text;

-- Add timestamp fields for provisioning lifecycle
ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS last_provisioning_attempt_at timestamptz;

ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS campaign_registered_at timestamptz;

ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS sender_pool_attached_at timestamptz;

-- Add A2P campaign SID reference
ALTER TABLE twilio_numbers
ADD COLUMN IF NOT EXISTS a2p_campaign_sid text;

-- Update existing records to have appropriate status
UPDATE twilio_numbers
SET provisioning_status = 'ready'
WHERE provisioning_status IN ('active', 'attached');

UPDATE twilio_numbers
SET provisioning_status = 'purchased'
WHERE provisioning_status NOT IN ('ready', 'purchased', 'purchasing', 'campaign_registering', 'campaign_registered', 'sender_pool_attaching', 'failed');

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_provisioning_status ON twilio_numbers(provisioning_status);
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_last_provisioning_attempt ON twilio_numbers(last_provisioning_attempt_at);

-- Comments for documentation
COMMENT ON COLUMN twilio_numbers.provisioning_status IS 'Comprehensive provisioning status: purchasing, purchased, campaign_registering, campaign_registered, sender_pool_attaching, ready, failed';
COMMENT ON COLUMN twilio_numbers.provisioning_error IS 'Detailed error message if provisioning failed at any step';
COMMENT ON COLUMN twilio_numbers.last_provisioning_attempt_at IS 'Timestamp of last provisioning attempt for retry logic';
COMMENT ON COLUMN twilio_numbers.campaign_registered_at IS 'Timestamp when A2P campaign registration completed';
COMMENT ON COLUMN twilio_numbers.sender_pool_attached_at IS 'Timestamp when number was attached to Messaging Service sender pool';
COMMENT ON COLUMN twilio_numbers.a2p_campaign_sid IS 'SID of the A2P campaign this number is registered to';
