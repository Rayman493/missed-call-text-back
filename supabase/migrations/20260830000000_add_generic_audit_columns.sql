-- Add generic audit columns to admin_audit_logs
-- These columns support generic audit logging for actions like account deletion
-- that need to capture before/after state, resource identifiers, and business context

ALTER TABLE admin_audit_logs
ADD COLUMN IF NOT EXISTS target_business_id UUID,
ADD COLUMN IF NOT EXISTS resource_identifiers JSONB,
ADD COLUMN IF NOT EXISTS before_state JSONB,
ADD COLUMN IF NOT EXISTS after_state JSONB,
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Add comments
COMMENT ON COLUMN admin_audit_logs.target_business_id IS 'Business ID affected by the action (if applicable)';
COMMENT ON COLUMN admin_audit_logs.resource_identifiers IS 'Identifiers for the affected resource (e.g., business_name)';
COMMENT ON COLUMN admin_audit_logs.before_state IS 'State before the action (structured JSON)';
COMMENT ON COLUMN admin_audit_logs.after_state IS 'State after the action (structured JSON)';
COMMENT ON COLUMN admin_audit_logs.metadata IS 'Additional metadata about the action';
COMMENT ON COLUMN admin_audit_logs.correlation_id IS 'Correlation ID for tracing related actions';

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_business ON admin_audit_logs(target_business_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_correlation_id ON admin_audit_logs(correlation_id);