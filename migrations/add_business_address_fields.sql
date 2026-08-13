-- Add canonical business address fields to businesses table
-- ReplyFlow owns the canonical merchant business address for Terminal Location creation
-- and future business-location features. Stripe KYC address is not readable after Express onboarding.

alter table businesses
  add column if not exists business_address_line1 text,
  add column if not exists business_address_line2 text,
  add column if not exists business_address_city text,
  add column if not exists business_address_state text,
  add column if not exists business_address_postal_code text,
  add column if not exists business_address_country text default 'US';

-- Add comment to document the purpose
comment on column businesses.business_address_line1 is 'Canonical merchant business address (street address) - used for Terminal Location and business profile';
comment on column businesses.business_address_line2 is 'Canonical merchant business address (suite/unit/line 2) - used for Terminal Location and business profile';
comment on column businesses.business_address_city is 'Canonical merchant business address (city) - used for Terminal Location and business profile';
comment on column businesses.business_address_state is 'Canonical merchant business address (state) - used for Terminal Location and business profile';
comment on column businesses.business_address_postal_code is 'Canonical merchant business address (ZIP/postal code) - used for Terminal Location and business profile';
comment on column businesses.business_address_country is 'Canonical merchant business address (country) - used for Terminal Location and business profile';