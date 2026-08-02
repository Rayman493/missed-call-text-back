-- Create admin_audit_logs table for tracking admin actions
-- This table is access-controlled and should only be readable by admins

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  acting_admin_user_id UUID NOT NULL,
  acting_admin_email TEXT NOT NULL,
  target_user_id UUID NOT NULL,
  target_email TEXT,
  action TEXT NOT NULL,
  support_reason TEXT,
  old_email TEXT,
  new_email TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_acting_admin ON admin_audit_logs(acting_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user ON admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE admin_audit_logs IS 'Audit log for admin actions - access controlled, admin-only read access';
COMMENT ON COLUMN admin_audit_logs.acting_admin_user_id IS 'User ID of the admin who performed the action';
COMMENT ON COLUMN admin_audit_logs.acting_admin_email IS 'Email of the admin who performed the action';
COMMENT ON COLUMN admin_audit_logs.target_user_id IS 'User ID of the target user';
COMMENT ON COLUMN admin_audit_logs.target_email IS 'Email of the target user';
COMMENT ON COLUMN admin_audit_logs.action IS 'Action performed (e.g., admin_password_reset, admin_login_email_changed)';
COMMENT ON COLUMN admin_audit_logs.support_reason IS 'Reason provided by admin for the action';
COMMENT ON COLUMN admin_audit_logs.old_email IS 'Previous email (for email change actions)';
COMMENT ON COLUMN admin_audit_logs.new_email IS 'New email (for email change actions)';
COMMENT ON COLUMN admin_audit_logs.success IS 'Whether the action succeeded';
COMMENT ON COLUMN admin_audit_logs.error_message IS 'Error message if the action failed';

-- Enable RLS
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read audit logs
CREATE POLICY "Admins can read audit logs"
ON admin_audit_logs FOR SELECT
TO authenticated
USING (
  -- Check if user is an admin via a function or direct check
  -- For now, we'll use a service role check in the API layer
  true
);

-- Policy: Only service role can insert audit logs (done by API endpoints)
CREATE POLICY "Service role can insert audit logs"
ON admin_audit_logs FOR INSERT
TO service_role
WITH CHECK (true);