-- Fix Out of Office datetime persistence by changing column types from TIMESTAMPTZ to TEXT
-- Problem: TIMESTAMPTZ columns cause PostgreSQL to apply timezone conversion, corrupting the values
-- Solution: Store timezone-less ISO strings (format: "yyyy-MM-ddThh:mm:ss") like Business Hours
-- Migration: 20260618000002_fix_out_of_office_column_types.sql

-- Step 1: Check if columns need conversion (are currently TIMESTAMPTZ)
-- We'll use a DO block to safely handle the conversion only if needed
DO $$
DECLARE
  start_type TEXT;
  end_type TEXT;
BEGIN
  -- Get current data types
  SELECT data_type INTO start_type
  FROM information_schema.columns
  WHERE table_name = 'businesses' AND column_name = 'out_of_office_start';

  SELECT data_type INTO end_type
  FROM information_schema.columns
  WHERE table_name = 'businesses' AND column_name = 'out_of_office_end';

  -- Only proceed if columns are TIMESTAMPTZ (not already TEXT)
  IF start_type = 'timestamp with time zone' AND end_type = 'timestamp with time zone' THEN
    RAISE NOTICE 'Converting out_of_office columns from TIMESTAMPTZ to TEXT';

    -- Step 2: Add temporary TEXT columns
    ALTER TABLE businesses ADD COLUMN out_of_office_start_temp TEXT;
    ALTER TABLE businesses ADD COLUMN out_of_office_end_temp TEXT;

    -- Step 3: Migrate existing data (convert TIMESTAMPTZ to timezone-less ISO string)
    UPDATE businesses
    SET out_of_office_start_temp = TO_CHAR(out_of_office_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    WHERE out_of_office_start IS NOT NULL;

    UPDATE businesses
    SET out_of_office_end_temp = TO_CHAR(out_of_office_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    WHERE out_of_office_end IS NOT NULL;

    -- Step 4: Drop old columns
    ALTER TABLE businesses DROP COLUMN out_of_office_start;
    ALTER TABLE businesses DROP COLUMN out_of_office_end;

    -- Step 5: Rename temporary columns to original names
    ALTER TABLE businesses RENAME COLUMN out_of_office_start_temp TO out_of_office_start;
    ALTER TABLE businesses RENAME COLUMN out_of_office_end_temp TO out_of_office_end;

    -- Step 6: Add comments for documentation
    COMMENT ON COLUMN businesses.out_of_office_start IS 'Start date/time for Out of Office Mode in ISO format (yyyy-MM-ddThh:mm:ss) without timezone';
    COMMENT ON COLUMN businesses.out_of_office_end IS 'End date/time for Out of Office Mode in ISO format (yyyy-MM-ddThh:mm:ss) without timezone';

    RAISE NOTICE 'Conversion completed successfully';
  ELSIF start_type = 'text' AND end_type = 'text' THEN
    RAISE NOTICE 'Columns are already TEXT, skipping conversion';
  ELSE
    RAISE NOTICE 'Unexpected column types: start=%, end=%', start_type, end_type;
  END IF;
END $$;