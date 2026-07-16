-- Migration: create_tasks_table
-- Tasks are lightweight todo items for daily command center functionality
-- They support optional associations with leads and jobs

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  
  -- Ownership
  business_id uuid not null references businesses(id) on delete cascade,
  
  -- Core task fields
  title text not null,
  notes text,
  
  -- Due date/time
  due_date date,
  due_time time,
  
  -- Completion status
  completed boolean not null default false,
  completed_at timestamptz,
  
  -- Optional associations
  lead_id uuid references leads(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists tasks_business_id_idx on tasks(business_id);
create index if not exists tasks_due_date_idx on tasks(due_date);
create index if not exists tasks_completed_idx on tasks(completed);
create index if not exists tasks_lead_id_idx on tasks(lead_id);
create index if not exists tasks_job_id_idx on tasks(job_id);

-- Auto-update updated_at
create or replace function update_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at_trigger
  before update on tasks
  for each row execute function update_tasks_updated_at();

-- RLS
alter table tasks enable row level security;

-- Businesses can only see their own tasks
create policy "tasks_select_own" on tasks
  for select using (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );

create policy "tasks_insert_own" on tasks
  for insert with check (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );

create policy "tasks_update_own" on tasks
  for update using (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );

create policy "tasks_delete_own" on tasks
  for delete using (
    business_id in (
      select id from businesses where user_id = auth.uid()
    )
  );
