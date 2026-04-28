-- Create twilio_numbers table to track all Twilio phone numbers
create table if not exists twilio_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  phone_number text not null unique,
  twilio_sid text not null unique,
  number_type text not null default 'voice' check (number_type in ('voice', 'sms', 'both')),
  status text not null default 'active' check (status in ('active', 'released', 'error')),
  sms_status text default 'pending' check (sms_status in ('pending', 'verified', 'failed')),
  assigned_at timestamptz,
  released_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for common queries
create index if not exists idx_twilio_numbers_business_id on twilio_numbers(business_id);
create index if not exists idx_twilio_numbers_phone_number on twilio_numbers(phone_number);
create index if not exists idx_twilio_numbers_status on twilio_numbers(status);

-- Add trigger to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_twilio_numbers_updated_at
  before update on twilio_numbers
  for each row
  execute function update_updated_at_column();
