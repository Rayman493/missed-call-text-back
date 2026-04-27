-- Create follow_up_jobs table for scheduled follow-up messages
create table if not exists follow_up_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  message_body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  scheduled_for timestamptz not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error_message text,
  last_error_code text,
  created_at timestamptz not null default now()
);

-- Create indexes for performance
create index if not exists idx_follow_up_jobs_lead_id on follow_up_jobs(lead_id);
create index if not exists idx_follow_up_jobs_business_id on follow_up_jobs(business_id);
create index if not exists idx_follow_up_jobs_status on follow_up_jobs(status);
create index if not exists idx_follow_up_jobs_scheduled_for on follow_up_jobs(scheduled_for);
