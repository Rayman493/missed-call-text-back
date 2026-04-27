-- Add cancel_at_period_end column to businesses table
alter table businesses
add column if not exists cancel_at_period_end boolean default false;
