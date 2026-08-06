create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  twilio_phone_number text not null,
  auto_reply_message text not null default 'Hi, this is ReplyFlow. Sorry we missed your call—how can we help? Reply STOP to opt out.',
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  caller_phone text not null,
  status text not null default 'new',
  first_contact_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, caller_phone)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  from_phone text not null,
  to_phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists call_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  caller_phone text not null,
  call_status text not null,
  twilio_call_sid text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_business_id on leads(business_id);
create index if not exists idx_messages_lead_id on messages(lead_id);
create index if not exists idx_call_events_business_id on call_events(business_id);
