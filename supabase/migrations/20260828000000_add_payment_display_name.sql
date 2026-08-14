-- Add display_name field to payment_requests table
-- Migration: 20260828000000_add_payment_display_name.sql
-- Purpose: Allow users to give completed payments custom names for better organization

-- Step 1: Add nullable display_name column independently
ALTER TABLE public.payment_requests
ADD COLUMN IF NOT EXISTS display_name text;

-- Step 2: Add named constraint independently (scoped to correct table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_requests_display_name_max_length'
      AND conrelid = 'public.payment_requests'::regclass
  ) THEN
    ALTER TABLE public.payment_requests
    ADD CONSTRAINT payment_requests_display_name_max_length
    CHECK (char_length(display_name) <= 80);
  END IF;
END $$;

-- Step 3: Apply column comment independently and unconditionally
COMMENT ON COLUMN public.payment_requests.display_name IS 'Optional custom display name for organizing payments (e.g., "Kitchen deposit", "Emergency pipe repair"). Max 80 characters. Nullable - when null, uses default fallback display.';