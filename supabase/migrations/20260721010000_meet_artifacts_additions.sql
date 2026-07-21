-- Additive fields for Google Meet artifacts and AI summaries (do NOT apply automatically)
-- This migration extends meeting_records without altering existing columns or policies.

begin;

alter table public.meeting_records
  add column if not exists google_meet_space_name text,
  add column if not exists google_meet_code text,
  add column if not exists google_conference_record_name text,
  add column if not exists actual_start timestamptz,
  add column if not exists actual_end timestamptz,
  add column if not exists transcript_status text,
  add column if not exists transcript_text text,
  add column if not exists transcript_source text,
  add column if not exists transcript_fetched_at timestamptz,
  add column if not exists ai_summary text,
  add column if not exists ai_summary_structured jsonb,
  add column if not exists summarized_at timestamptz,
  add column if not exists processing_error text,
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists next_processing_attempt_at timestamptz;

-- Constrain transcript_status to known values when set (NULL allowed)
alter table public.meeting_records
  drop constraint if exists meeting_records_transcript_status_chk;

alter table public.meeting_records
  add constraint meeting_records_transcript_status_chk
  check (
    transcript_status is null
    or transcript_status in (
      'pending',
      'available',
      'processed',
      'unavailable',
      'permission_required',
      'failed'
    )
  );

-- Optional helpful index for lookups by space or conference record name
create index if not exists idx_meeting_records_space_name
  on public.meeting_records (google_meet_space_name);

create index if not exists idx_meeting_records_conf_record
  on public.meeting_records (google_conference_record_name);

commit;
