-- Create conversations table
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  status text not null default 'open',
  source text not null default 'missed_call',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  summary text null,
  created_at timestamptz not null default now()
);

-- Add conversation_id to messages table
alter table messages 
add column conversation_id uuid references conversations(id) on delete cascade;

-- Add conversation_id to call_events table  
alter table call_events 
add column conversation_id uuid references conversations(id) on delete cascade;

-- Create indexes for performance
create index idx_conversations_lead_id on conversations(lead_id);
create index idx_conversations_business_id on conversations(business_id);
create index idx_conversations_status on conversations(status);
create index idx_conversations_last_activity on conversations(last_activity_at desc nulls_last);
create index idx_messages_conversation_id on messages(conversation_id);
create index idx_call_events_conversation_id on call_events(conversation_id);

-- Create unique constraint to prevent duplicate conversations
create unique index idx_conversations_unique_open on conversations(lead_id, business_id) 
where status = 'open';
