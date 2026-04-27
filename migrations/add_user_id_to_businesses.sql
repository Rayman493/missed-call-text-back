-- Add user_id column to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
