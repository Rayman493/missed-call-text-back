-- Smart Call Filtering v1 Database Tables
-- Create tables for filtering settings, whitelists, blacklists, and decision logs

-- Extend businesses table with filtering settings
alter table businesses 
add column if not exists smart_filtering_enabled boolean default false,
add column if not exists only_text_unknown_callers boolean default false,
add column if not exists business_hours_enabled boolean default false,
add column if not exists business_hours_start time default '09:00:00',
add column if not exists business_hours_end time default '17:00:00',
add column if not exists business_hours_timezone text default 'America/New_York',
add column if not exists repeat_call_protection_enabled boolean default false,
add column if not exists repeat_call_cooldown_hours integer default 24,
add column if not exists spam_detection_enabled boolean default false,
add column if not exists after_hours_message text default null;

-- Whitelist table for approved numbers
create table if not exists allowed_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone_number text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone_number)
);

-- Blacklist table for blocked numbers
create table if not exists blocked_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone_number text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone_number)
);

-- Personal contacts table (numbers that should never receive auto-texts)
create table if not exists personal_contact_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone_number text not null,
  name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone_number)
);

-- Filtering decision logs for debugging and analytics
create table if not exists filtering_decision_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  caller_phone text not null,
  call_sid text,
  decision text not null, -- 'allowed' or 'blocked'
  reason text not null, -- e.g., 'blocked_repeat_caller', 'blocked_blacklist', etc.
  filter_details jsonb, -- Additional context about the filtering decision
  created_at timestamptz not null default now()
);

-- Create indexes for performance
create index if not exists idx_allowed_numbers_business_id on allowed_numbers(business_id);
create index if not exists idx_allowed_numbers_phone on allowed_numbers(phone_number);
create index if not exists idx_blocked_numbers_business_id on blocked_numbers(business_id);
create index if not exists idx_blocked_numbers_phone on blocked_numbers(phone_number);
create index if not exists idx_personal_contact_numbers_business_id on personal_contact_numbers(business_id);
create index if not exists idx_personal_contact_numbers_phone on personal_contact_numbers(phone_number);
create index if not exists idx_filtering_decision_logs_business_id on filtering_decision_logs(business_id);
create index if not exists idx_filtering_decision_logs_caller_phone on filtering_decision_logs(caller_phone);
create index if not exists idx_filtering_decision_logs_created_at on filtering_decision_logs(created_at);
create index if not exists idx_filtering_decision_logs_decision on filtering_decision_logs(decision);

-- Enable Row Level Security (RLS) for all new tables
alter table allowed_numbers enable row level security;
alter table blocked_numbers enable row level security;
alter table personal_contact_numbers enable row level security;
alter table filtering_decision_logs enable row level security;

-- RLS Policies for allowed_numbers
create policy "Users can view their own allowed numbers" on allowed_numbers
  for select using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can insert their own allowed numbers" on allowed_numbers
  for insert with check (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can update their own allowed numbers" on allowed_numbers
  for update using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can delete their own allowed numbers" on allowed_numbers
  for delete using (auth.uid() in (select user_id from businesses where id = business_id));

-- RLS Policies for blocked_numbers
create policy "Users can view their own blocked numbers" on blocked_numbers
  for select using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can insert their own blocked numbers" on blocked_numbers
  for insert with check (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can update their own blocked numbers" on blocked_numbers
  for update using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can delete their own blocked numbers" on blocked_numbers
  for delete using (auth.uid() in (select user_id from businesses where id = business_id));

-- RLS Policies for personal_contact_numbers
create policy "Users can view their own personal contact numbers" on personal_contact_numbers
  for select using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can insert their own personal contact numbers" on personal_contact_numbers
  for insert with check (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can update their own personal contact numbers" on personal_contact_numbers
  for update using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can delete their own personal contact numbers" on personal_contact_numbers
  for delete using (auth.uid() in (select user_id from businesses where id = business_id));

-- RLS Policies for filtering_decision_logs
create policy "Users can view their own filtering decision logs" on filtering_decision_logs
  for select using (auth.uid() in (select user_id from businesses where id = business_id));

create policy "Users can insert their own filtering decision logs" on filtering_decision_logs
  for insert with check (auth.uid() in (select user_id from businesses where id = business_id));

-- Trigger to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create triggers for tables with updated_at
create trigger update_allowed_numbers_updated_at before update on allowed_numbers
  for each row execute function update_updated_at_column();

create trigger update_blocked_numbers_updated_at before update on blocked_numbers
  for each row execute function update_updated_at_column();

create trigger update_personal_contact_numbers_updated_at before update on personal_contact_numbers
  for each row execute function update_updated_at_column();
