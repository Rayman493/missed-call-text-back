-- Add soft delete columns to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
ADD COLUMN IF NOT EXISTS deletion_reason text NULL;

-- Add cancellation_reason column to follow_up_jobs table
ALTER TABLE follow_up_jobs 
ADD COLUMN IF NOT EXISTS cancellation_reason text NULL;

-- Add indexes for performance on soft delete queries
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at);
CREATE INDEX IF NOT EXISTS idx_leads_business_deleted ON leads(business_id, deleted_at) WHERE deleted_at IS NOT NULL;
