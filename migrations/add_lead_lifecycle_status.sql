-- Add lightweight lead lifecycle support
-- This adds the new lifecycle states while preserving existing functionality

-- Update existing lead_status values to match new lifecycle
-- Map existing statuses to new lifecycle:
-- - 'new' stays 'new' 
-- - 'qualified' -> 'active'
-- - 'replied' -> 'active'
-- - 'closed' -> 'completed'
-- - Keep 'blocked' as separate status (for ignore contact functionality)

update leads 
set lead_status = 'active' 
where lead_status in ('qualified', 'replied');

update leads 
set lead_status = 'completed' 
where lead_status = 'closed';

-- Add check constraint for lifecycle states
alter table leads 
add constraint if not exists check_lead_status 
check (lead_status in ('new', 'active', 'completed', 'blocked'));

-- Add index for performance on lifecycle queries
create index if not exists idx_leads_lifecycle_status on leads(lead_status);

-- Add updated_at timestamp for lifecycle tracking
alter table leads 
add column if not exists updated_at timestamptz not null default now();

-- Create trigger to update updated_at on status changes
create or replace function update_lead_updated_at()
returns trigger as $$
begin
    if old.lead_status is distinct from new.lead_status then
        new.updated_at = now();
    end if;
    return new;
end;
$$ language plpgsql;

-- Drop trigger if exists and recreate
drop trigger if exists trigger_update_lead_updated_at on leads;
create trigger trigger_update_lead_updated_at
    before update on leads
    for each row
    execute function update_lead_updated_at();
