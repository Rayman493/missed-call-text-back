-- Add user_id column to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add twilio_messaging_service_sid column to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid text;

-- Add updated_at column for tracking
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);

-- Enable Row Level Security
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own businesses
CREATE POLICY "Users can view own businesses"
ON businesses FOR SELECT
USING (auth.uid() = user_id);

-- Create policy: Users can insert their own businesses
CREATE POLICY "Users can insert own businesses"
ON businesses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own businesses
CREATE POLICY "Users can update own businesses"
ON businesses FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own businesses
CREATE POLICY "Users can delete own businesses"
ON businesses FOR DELETE
USING (auth.uid() = user_id);
