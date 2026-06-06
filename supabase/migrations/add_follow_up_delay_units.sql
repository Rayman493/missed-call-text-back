-- Add delay unit columns to businesses table for flexible follow-up timing
-- This allows follow-ups to be scheduled in minutes, hours, or days instead of just days

-- Add delay unit columns for each follow-up step
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS follow_up_1_delay_unit TEXT DEFAULT 'days' CHECK (follow_up_1_delay_unit IN ('minutes', 'hours', 'days'));

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS follow_up_2_delay_unit TEXT DEFAULT 'days' CHECK (follow_up_2_delay_unit IN ('minutes', 'hours', 'days'));

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS follow_up_3_delay_unit TEXT DEFAULT 'days' CHECK (follow_up_3_delay_unit IN ('minutes', 'hours', 'days'));

-- Add index for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_businesses_follow_up_delay_units ON businesses(follow_up_1_delay_unit, follow_up_2_delay_unit, follow_up_3_delay_unit);

-- Add comment to document the change
COMMENT ON COLUMN businesses.follow_up_1_delay_unit IS 'Time unit for follow-up 1 delay: minutes, hours, or days';
COMMENT ON COLUMN businesses.follow_up_2_delay_unit IS 'Time unit for follow-up 2 delay: minutes, hours, or days';
COMMENT ON COLUMN businesses.follow_up_3_delay_unit IS 'Time unit for follow-up 3 delay: minutes, hours, or days';
