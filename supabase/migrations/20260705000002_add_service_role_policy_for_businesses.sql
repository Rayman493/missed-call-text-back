-- Add service role bypass policy for businesses table
-- This allows server-side signup to create business rows using supabaseAdmin (service role)
-- without being blocked by RLS policies

-- Enable RLS on businesses table if not already enabled
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Drop any existing service role policy if it exists
DROP POLICY IF EXISTS "Service role can manage businesses" ON businesses;

-- Create policy to allow service role full access to businesses table
-- This is needed for server-side operations like signup bootstrap
CREATE POLICY "Service role can manage businesses"
    ON businesses
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create policy for authenticated users to view their own business
DROP POLICY IF EXISTS "Users can view their own business" ON businesses;

CREATE POLICY "Users can view their own business"
    ON businesses
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy for authenticated users to update their own business
DROP POLICY IF EXISTS "Users can update their own business" ON businesses;

CREATE POLICY "Users can update their own business"
    ON businesses
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Comment for documentation
COMMENT ON POLICY "Service role can manage businesses" ON businesses IS 'Allows service role (supabaseAdmin) to bypass RLS for server-side operations like signup';
