-- Migration: add_geocoded_coordinates_to_jobs
-- Purpose: Add geocoded coordinates to jobs table for Schedule map view
-- This enables efficient map rendering without repeated geocoding

-- Add geocoding fields to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS latitude numeric,
ADD COLUMN IF NOT EXISTS longitude numeric,
ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
ADD COLUMN IF NOT EXISTS geocoded_address text;

-- Add index on coordinates for efficient spatial queries
CREATE INDEX IF NOT EXISTS jobs_coordinates_idx ON jobs(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add index on geocoded_address for cache lookup
CREATE INDEX IF NOT EXISTS jobs_geocoded_address_idx ON jobs(geocoded_address) 
WHERE geocoded_address IS NOT NULL;

-- Add comment to document the purpose
COMMENT ON COLUMN jobs.latitude IS 'Geocoded latitude from service_address, used for Schedule map view';
COMMENT ON COLUMN jobs.longitude IS 'Geocoded longitude from service_address, used for Schedule map view';
COMMENT ON COLUMN jobs.geocoded_at IS 'Timestamp when address was last geocoded';
COMMENT ON COLUMN jobs.geocoded_address IS 'Normalized address form used for geocoding cache';
