-- Google Play Billing provider support for Android subscriptions
-- Adds a provider distinction to businesses and an RTDN event ledger.
-- Stripe columns and semantics are unchanged; existing Stripe rows are
-- backfilled to subscription_provider = 'stripe'.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS subscription_provider TEXT CHECK (subscription_provider IN ('stripe', 'google_play')),
  ADD COLUMN IF NOT EXISTS google_play_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_play_product_id TEXT,
  ADD COLUMN IF NOT EXISTS google_play_order_id TEXT,
  ADD COLUMN IF NOT EXISTS google_play_linked_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_play_package_name TEXT,
  ADD COLUMN IF NOT EXISTS google_play_is_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_play_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_play_last_verified_at timestamptz;

-- One Google Play purchase token may activate at most one business.
CREATE UNIQUE INDEX IF NOT EXISTS businesses_google_play_purchase_token_key
  ON businesses (google_play_purchase_token)
  WHERE google_play_purchase_token IS NOT NULL;

-- One Google account subscription may activate at most one business across
-- upgrade/downgrade token rotation (linkedPurchaseToken chains).
CREATE UNIQUE INDEX IF NOT EXISTS businesses_google_play_linked_purchase_token_key
  ON businesses (google_play_linked_purchase_token)
  WHERE google_play_linked_purchase_token IS NOT NULL;

-- Backfill existing Stripe subscribers.
UPDATE businesses
SET subscription_provider = 'stripe'
WHERE stripe_subscription_id IS NOT NULL
  AND subscription_provider IS NULL;

-- Real-time Developer Notifications ledger (mirrors stripe_webhook_events).
CREATE TABLE IF NOT EXISTS google_play_rtdn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  notification_type INTEGER,
  purchase_token TEXT,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  processing_started_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_play_rtdn_events_purchase_token
  ON google_play_rtdn_events (purchase_token);

ALTER TABLE google_play_rtdn_events ENABLE ROW LEVEL SECURITY;

-- Service-role only table: no client-facing policies are required.
