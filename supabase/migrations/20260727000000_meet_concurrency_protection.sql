-- Add lease fields for concurrent processing protection
-- Prevents duplicate processing when multiple cron invocations run simultaneously

begin;

alter table public.meeting_records
  add column if not exists processing_started_at timestamptz;

-- Index for efficient lease-based queries
create index if not exists idx_meeting_records_processing_started_at
  on public.meeting_records (processing_started_at)
  where processing_started_at is not null;

comment on column public.meeting_records.processing_started_at is 'Timestamp when processing started. Used for lease-based concurrency protection. NULL if not currently being processed. Stale leases (older than 15 minutes) can be reclaimed.';

commit;
