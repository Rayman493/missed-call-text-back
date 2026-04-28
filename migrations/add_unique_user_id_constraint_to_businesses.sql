-- Add unique constraint on user_id to prevent duplicate businesses per user
-- Migration: 004_add_unique_user_id_constraint_to_businesses.sql

-- Add unique constraint on user_id to ensure exactly one business per user
ALTER TABLE businesses 
ADD CONSTRAINT businesses_user_id_unique UNIQUE (user_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT businesses_user_id_unique IS 'Ensures exactly one business per user';
