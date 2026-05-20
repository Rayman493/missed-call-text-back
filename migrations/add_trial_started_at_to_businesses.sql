-- Add trial_started_at column to businesses table for 30-day trial cooldown tracking
-- Migration: add_trial_started_at_to_businesses.sql

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

COMMENT ON COLUMN businesses.trial_started_at IS 'Trial start timestamp for 30-day cooldown tracking. Used to determine when a business can start another free trial.';
