-- Harden active-timer uniqueness: at most one row per business where ended_at IS NULL.
-- This is enforced at the database level to prevent races between concurrent Start requests.

-- Drop the non-unique partial index from the original migration
drop index if exists job_time_entries_active_idx;

-- Create a UNIQUE partial index so the database itself rejects a second active timer
-- for the same business, regardless of API-level pre-checks.
create unique index if not exists job_time_entries_one_active_per_business_idx
  on job_time_entries (business_id)
  where ended_at is null;
