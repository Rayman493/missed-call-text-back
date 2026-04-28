-- Add assigned_twilio_number_id to businesses table
alter table businesses 
add column if not exists assigned_twilio_number_id uuid references twilio_numbers(id) on delete set null;

-- Create index for efficient lookups
create index if not exists idx_businesses_assigned_twilio_number_id on businesses(assigned_twilio_number_id);
