-- Add forwarding verification columns to businesses table
-- This allows tracking whether call forwarding has been verified through test calls

-- Add forwarding_verified column
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS forwarding_verified boolean NOT NULL DEFAULT false;

-- Add forwarding_verified_at column  
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS forwarding_verified_at timestamptz;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_businesses_forwarding_verified ON public.businesses(forwarding_verified);
CREATE INDEX IF NOT EXISTS idx_businesses_forwarding_verified_at ON public.businesses(forwarding_verified_at);

-- Add comments for documentation
COMMENT ON COLUMN public.businesses.forwarding_verified IS 'Whether call forwarding has been verified through at least one successful test call';
COMMENT ON COLUMN public.businesses.forwarding_verified_at IS 'Timestamp when forwarding was first verified';
