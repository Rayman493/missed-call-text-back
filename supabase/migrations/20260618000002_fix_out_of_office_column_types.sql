-- Fix Out of Office datetime persistence by changing column types from TIMESTAMPTZ to TEXT
-- Problem: TIMESTAMPTZ columns cause PostgreSQL to apply timezone conversion, corrupting the values
-- Solution: Store timezone-less ISO strings (format: "yyyy-MM-ddThh:mm:ss") like Business Hours
-- Migration: 20260618000002_fix_out_of_office_column_types.sql

-- Step 1: Create new TEXT columns
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS out_of_office_start_new TEXT NULL;

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS out_of_office_end_new TEXT NULL;

-- Step 2: Migrate existing data (convert TIMESTAMPTZ to timezone-less ISO string)
-- Extract the date/time components without timezone
UPDATE businesses 
SET out_of_office_start_new = TO_CHAR(out_of_office_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
WHERE out_of_office_start IS NOT NULL;

UPDATE businesses 
SET out_of_office_end_new = TO_CHAR(out_of_office_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
WHERE out_of_office_end IS NOT NULL;

-- Step 3: Drop old columns
ALTER TABLE businesses 
DROP COLUMN IF EXISTS out_of_office_start;

ALTER TABLE businesses 
DROP COLUMN IF EXISTS out_of_office_end;

-- Step 4: Rename new columns to original names
ALTER TABLE businesses 
RENAME COLUMN out_of_office_start_new TO out_of_office_start;

ALTER TABLE businesses 
RENAME COLUMN out_of_office_end_new TO out_of_office_end;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN businesses.out_of_office_start IS 'Start date/time for Out of Office Mode in ISO format (yyyy-MM-ddThh:mm:ss) without timezone';
COMMENT ON COLUMN businesses.out_of_office_end IS 'End date/time for Out of Office Mode in ISO format (yyyy-MM-ddThh:mm:ss) without timezone';