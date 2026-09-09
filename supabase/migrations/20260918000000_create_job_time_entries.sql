-- Minimal job time tracking V1
-- Stores persisted start/stop timestamps; no background timers, no labor-cost fields.

create table if not exists job_time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common lookups
create index if not exists job_time_entries_business_id_idx on job_time_entries(business_id);
create index if not exists job_time_entries_job_id_idx on job_time_entries(job_id);
create index if not exists job_time_entries_active_idx on job_time_entries(business_id) where ended_at is null;

-- Row-level security: only the business owner can access their time entries
alter table job_time_entries enable row level security;

create policy "job_time_entries_select_own"
  on job_time_entries for select
  using (business_id in (select id from businesses where user_id = auth.uid()));

create policy "job_time_entries_insert_own"
  on job_time_entries for insert
  with check (business_id in (select id from businesses where user_id = auth.uid()));

create policy "job_time_entries_update_own"
  on job_time_entries for update
  using (business_id in (select id from businesses where user_id = auth.uid()))
  with check (business_id in (select id from businesses where user_id = auth.uid()));

create policy "job_time_entries_delete_own"
  on job_time_entries for delete
  using (business_id in (select id from businesses where user_id = auth.uid()));

-- updated_at trigger
create or replace function trigger_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_job_time_entries on job_time_entries;
create trigger set_updated_at_job_time_entries
  before update on job_time_entries
  for each row execute function trigger_set_updated_at();
