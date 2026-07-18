-- Create push_devices table for native push notification token management
-- Migration: 20260718000000_create_push_devices.sql
-- Purpose: Store device tokens for push notifications with proper security and ownership

-- Create push_devices table
CREATE TABLE IF NOT EXISTS push_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
    push_token TEXT NOT NULL,
    device_identifier TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    last_seen_at timestamptz DEFAULT now() NOT NULL,
    
    -- Ensure one user cannot have duplicate tokens for the same platform
    UNIQUE(user_id, platform, push_token)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_business_id ON push_devices(business_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_platform ON push_devices(platform);
CREATE INDEX IF NOT EXISTS idx_push_devices_enabled ON push_devices(enabled);
CREATE INDEX IF NOT EXISTS idx_push_devices_last_seen_at ON push_devices(last_seen_at DESC);

-- Enable RLS
ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own devices
CREATE POLICY "Users can view their own push devices"
    ON push_devices
    FOR SELECT
    USING (
        user_id = auth.uid()
    );

-- Policy: Users can insert their own devices (for registration)
CREATE POLICY "Users can insert their own push devices"
    ON push_devices
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
    );

-- Policy: Users can update their own devices (for token refresh, enable/disable)
CREATE POLICY "Users can update their own push devices"
    ON push_devices
    FOR UPDATE
    USING (
        user_id = auth.uid()
    );

-- Policy: Users can delete their own devices (for sign-out/unregister)
CREATE POLICY "Users can delete their own push devices"
    ON push_devices
    FOR DELETE
    USING (
        user_id = auth.uid()
    );

-- Policy: Service role can manage push devices (for push delivery and cleanup)
CREATE POLICY "Service role can manage push devices"
    ON push_devices
    FOR ALL
    USING (
        auth.role() = 'service_role'
    );

-- Trigger to update updated_at and last_seen_at timestamps
CREATE TRIGGER update_push_devices_timestamps
    BEFORE UPDATE ON push_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE push_devices IS 'Device tokens for native push notifications. One user can have multiple devices across platforms.';
COMMENT ON COLUMN push_devices.user_id IS 'Reference to auth.users - ensures proper ownership';
COMMENT ON COLUMN push_devices.business_id IS 'Reference to businesses - ensures push routing to correct business';
COMMENT ON COLUMN push_devices.platform IS 'Platform type: android or ios';
COMMENT ON COLUMN push_devices.push_token IS 'FCM token for Android or APNs token for iOS';
COMMENT ON COLUMN push_devices.device_identifier IS 'Optional device identifier for debugging and deduplication';
COMMENT ON COLUMN push_devices.enabled IS 'Whether this device should receive pushes (disabled on sign-out)';
COMMENT ON COLUMN push_devices.last_seen_at IS 'Last time this device was active/registered';
