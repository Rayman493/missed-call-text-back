-- Booking dual-conversion support.
-- A booking request may now create at most one Appointment AND at most one Job.
-- Existing rows (neither / appointment only / job only) remain valid; only the
-- mutual-exclusion CHECK is removed. Application code enforces the at-most-one
-- per-type invariant.

alter table public.booking_requests
  drop constraint if exists booking_requests_one_operational_record;
