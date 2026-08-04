-- Migration: create_jobs_table
-- Jobs are the lightweight scheduling/job-tracking entity for local service businesses.
-- They live on the Schedule page alongside Google Calendar events.
-- Jobs can be created manually OR from a ReplyFlow lead.

create type job_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),

  -- Ownership
  business_id uuid not null references businesses(id) on delete cascade,

  -- Core job fields
  title text not null,
  customer_name text,
  customer_phone text,
  service_address text,
  notes text,

  -- Scheduling
  scheduled_date date,
  scheduled_time time,

  -- Status
  status job_status not null default 'scheduled',

  -- ReplyFlow linkage (both optional — manual jobs have neither)
  lead_id uuid references leads(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,

  -- Source tracking
  source text not null default 'manual' check (source in ('manual', 'replyflow')),

  -- Future extension point: payment status (null = no payment requested yet)
  payment_status text check (payment_status in ('none', 'requested', 'paid')) default 'none',

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists jobs_business_id_idx on jobs(business_id);
create index if not exists jobs_scheduled_date_idx on jobs(scheduled_date);
create index if not exists jobs_status_idx on jobs(status);
create index if not exists jobs_lead_id_idx on jobs(lead_id);

-- Auto-update updated_at
create or replace function update_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_updated_at_trigger
  before update on jobs
  for each row execute function update_jobs_updated_at();

-- RLS
alter table jobs enable row level security;

-- Businesses can only see their own jobs
create policy "jobs_select_own" on jobs
  for select using (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );

create policy "jobs_insert_own" on jobs
  for insert with check (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );

create policy "jobs_update_own" on jobs
  for update using (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );

create policy "jobs_delete_own" on jobs
  for delete using (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );
