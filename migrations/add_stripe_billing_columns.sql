-- Add Stripe billing columns to businesses table
alter table businesses
add column if not exists stripe_customer_id text,
add column if not exists stripe_subscription_id text,
add column if not exists subscription_status text default 'inactive',
add column if not exists subscription_price_id text,
add column if not exists current_period_end timestamptz;
