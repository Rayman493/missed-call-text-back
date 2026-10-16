-- Apple In-App Purchase (StoreKit 2) provider support for iOS subscriptions.
-- Mirrors 20261003000000_google_play_billing.sql: provider distinction on
-- businesses plus an App Store Server Notifications V2 event ledger.
-- Stripe and Google Play columns/semantics are unchanged. Apple identity is
-- the originalTransactionId (stable across renewals) — one Apple
-- subscription activates at most one business.

-- Provider CHECK: extend to 'apple'. The inline CHECK added in
-- 20261003000000_google_play_billing.sql only allows ('stripe','google_play').
ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_subscription_provider_check;
ALTER TABLE businesses
  ADD CONSTRAINT businesses_subscription_provider_check
    CHECK (subscription_provider IN ('stripe', 'google_play', 'apple'));

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_bundle_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_environment TEXT,
  ADD COLUMN IF NOT EXISTS apple_is_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apple_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS apple_last_verified_at timestamptz;

-- One Apple subscription (originalTransactionId) may activate at most one
-- business. originalTransactionId is stable across renewals and restores.
CREATE UNIQUE INDEX IF NOT EXISTS businesses_apple_original_transaction_id_key
  ON businesses (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

-- App Store Server Notifications V2 ledger (mirrors google_play_rtdn_events).
-- notificationUUID is the idempotency key; message_id keeps the column name
-- aligned with the Stripe/Play ledgers.
CREATE TABLE IF NOT EXISTS apple_assn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  notification_type TEXT,
  subtype TEXT,
  original_transaction_id TEXT,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  processing_started_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apple_assn_events_original_transaction_id
  ON apple_assn_events (original_transaction_id);

ALTER TABLE apple_assn_events ENABLE ROW LEVEL SECURITY;

-- Service-role only table: no client-facing policies are required.

-- Extend the owner-only column guard to the Apple billing columns. Identical
-- body to 20261004000000_google_play_owner_only_columns.sql with the apple_*
-- columns appended — members keep row-level UPDATE for operational fields.
create or replace function public.enforce_business_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side writes (service_role, anon key not carrying a user, triggers)
  -- are unrestricted. Only authenticated end-user writes are checked.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  -- The business owner may change any column on their own business.
  if exists (
    select 1 from public.business_memberships
    where business_id = new.id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    return new;
  end if;

  -- Member write: allowed only when no owner-only column changes.
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    -- telephony / provisioning lifecycle
    or new.business_phone_number is distinct from old.business_phone_number
    or new.business_phone_changed_at is distinct from old.business_phone_changed_at
    or new.business_phone_carrier is distinct from old.business_phone_carrier
    or new.phone_carrier is distinct from old.phone_carrier
    or new.carrier is distinct from old.carrier
    or new.forwarding_phone_number is distinct from old.forwarding_phone_number
    or new.twilio_phone_number is distinct from old.twilio_phone_number
    or new.twilio_phone_number_sid is distinct from old.twilio_phone_number_sid
    or new.twilio_messaging_service_sid is distinct from old.twilio_messaging_service_sid
    or new.twilio_subaccount_sid is distinct from old.twilio_subaccount_sid
    or new.twilio_auth_token is distinct from old.twilio_auth_token
    or new.assigned_twilio_number_id is distinct from old.assigned_twilio_number_id
    or new.twilio_release_at is distinct from old.twilio_release_at
    or new.twilio_release_grace_days is distinct from old.twilio_release_grace_days
    or new.twilio_release_reason is distinct from old.twilio_release_reason
    or new.twilio_release_status is distinct from old.twilio_release_status
    or new.twilio_released_at is distinct from old.twilio_released_at
    or new.provisioned_at is distinct from old.provisioned_at
    or new.provisioning_status is distinct from old.provisioning_status
    or new.provisioning_error is distinct from old.provisioning_error
    or new.provisioning_lock_id is distinct from old.provisioning_lock_id
    or new.last_provisioning_attempt_at is distinct from old.last_provisioning_attempt_at
    or new.sender_pool_attached_at is distinct from old.sender_pool_attached_at
    or new.messaging_status is distinct from old.messaging_status
    or new.sms_type is distinct from old.sms_type
    or new.a2p_campaign_sid is distinct from old.a2p_campaign_sid
    or new.a2p_status is distinct from old.a2p_status
    or new.campaign_registered_at is distinct from old.campaign_registered_at
    -- call forwarding lifecycle
    or new.call_forwarding_enabled is distinct from old.call_forwarding_enabled
    or new.call_forwarding_status is distinct from old.call_forwarding_status
    or new.forwarding_verified is distinct from old.forwarding_verified
    or new.forwarding_verified_at is distinct from old.forwarding_verified_at
    or new.forwarding_instructions_confirmed_at is distinct from old.forwarding_instructions_confirmed_at
    or new.test_call_received_at is distinct from old.test_call_received_at
    or new.test_sms_sent_at is distinct from old.test_sms_sent_at
    or new.phone_setup_completed_at is distinct from old.phone_setup_completed_at
    -- Stripe / billing lifecycle
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_connect_account_id is distinct from old.stripe_connect_account_id
    or new.stripe_connect_status is distinct from old.stripe_connect_status
    or new.stripe_terminal_location_id is distinct from old.stripe_terminal_location_id
    or new.stripe_details_submitted is distinct from old.stripe_details_submitted
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_price_id is distinct from old.subscription_price_id
    or new.trial_started_at is distinct from old.trial_started_at
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.current_period_end is distinct from old.current_period_end
    or new.cancel_at is distinct from old.cancel_at
    or new.cancel_at_period_end is distinct from old.cancel_at_period_end
    or new.checkout_completed_at is distinct from old.checkout_completed_at
    or new.manual_access_enabled is distinct from old.manual_access_enabled
    or new.manual_access_expires_at is distinct from old.manual_access_expires_at
    or new.manual_access_granted_at is distinct from old.manual_access_granted_at
    or new.manual_access_granted_by is distinct from old.manual_access_granted_by
    or new.manual_access_note is distinct from old.manual_access_note
    or new.manual_access_reason is distinct from old.manual_access_reason
    or new.is_protected_account is distinct from old.is_protected_account
    or new.protected_reason is distinct from old.protected_reason
    -- onboarding / address (address drives Stripe Terminal location sync)
    or new.onboarding_status is distinct from old.onboarding_status
    or new.onboarding_step is distinct from old.onboarding_step
    or new.business_address_line1 is distinct from old.business_address_line1
    or new.business_address_line2 is distinct from old.business_address_line2
    or new.business_address_city is distinct from old.business_address_city
    or new.business_address_state is distinct from old.business_address_state
    or new.business_address_postal_code is distinct from old.business_address_postal_code
    or new.business_address_country is distinct from old.business_address_country
    -- Google Play billing lifecycle
    or new.subscription_provider is distinct from old.subscription_provider
    or new.google_play_purchase_token is distinct from old.google_play_purchase_token
    or new.google_play_product_id is distinct from old.google_play_product_id
    or new.google_play_order_id is distinct from old.google_play_order_id
    or new.google_play_linked_purchase_token is distinct from old.google_play_linked_purchase_token
    or new.google_play_package_name is distinct from old.google_play_package_name
    or new.google_play_is_trial is distinct from old.google_play_is_trial
    or new.google_play_revoked_at is distinct from old.google_play_revoked_at
    or new.google_play_last_verified_at is distinct from old.google_play_last_verified_at
    -- Apple In-App Purchase billing lifecycle
    or new.apple_original_transaction_id is distinct from old.apple_original_transaction_id
    or new.apple_transaction_id is distinct from old.apple_transaction_id
    or new.apple_product_id is distinct from old.apple_product_id
    or new.apple_bundle_id is distinct from old.apple_bundle_id
    or new.apple_environment is distinct from old.apple_environment
    or new.apple_is_trial is distinct from old.apple_is_trial
    or new.apple_revoked_at is distinct from old.apple_revoked_at
    or new.apple_last_verified_at is distinct from old.apple_last_verified_at
  then
    raise exception 'owner_only_field: only the business owner can change this field'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
