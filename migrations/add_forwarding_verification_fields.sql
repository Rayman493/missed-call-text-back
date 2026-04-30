-- Add forwarding verification fields to businesses table
-- This allows tracking whether call forwarding has been tested and verified

-- Add forwarding verification fields
alter table businesses 
add column if not exists forwarding_verified boolean default false,
add column if not exists forwarding_verified_at timestamptz null;

-- Create index for performance
create index if not exists idx_businesses_forwarding_verified on businesses(forwarding_verified);
create index if not exists idx_businesses_forwarding_verified_at on businesses(forwarding_verified_at);

-- Add comment for documentation
comment on column businesses.forwarding_verified is 'Whether call forwarding has been verified with at least one successful test call';
comment on column businesses.forwarding_verified_at is 'Timestamp when forwarding was first verified';
