-- Add lead_status column to leads table for better inbox management
alter table leads 
add column if not exists lead_status text default 'new';

-- Add index for performance
create index if not exists idx_leads_status on leads(lead_status);

-- Add index for last activity sorting
create index if not exists idx_leads_last_activity on leads(last_message_at desc nulls_last, first_contact_at desc nulls_last, created_at desc nulls_last);
