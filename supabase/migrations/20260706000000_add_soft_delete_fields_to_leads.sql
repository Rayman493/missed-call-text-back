-- Add soft-delete fields to leads table
-- Migration: 20260706000000_add_soft_delete_fields_to_leads.sql
-- Purpose: Enable safe deletion and restoration of leads

-- Add deleted_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN deleted_at timestamptz;
        RAISE NOTICE 'Added deleted_at column to leads table';
    ELSE
        RAISE NOTICE 'deleted_at column already exists in leads table';
    END IF;
END $$;

-- Add deleted_by column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'deleted_by'
    ) THEN
        ALTER TABLE leads ADD COLUMN deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added deleted_by column to leads table';
    ELSE
        RAISE NOTICE 'deleted_by column already exists in leads table';
    END IF;
END $$;

-- Add restored_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'restored_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN restored_at timestamptz;
        RAISE NOTICE 'Added restored_at column to leads table';
    ELSE
        RAISE NOTICE 'restored_at column already exists in leads table';
    END IF;
END $$;

-- Add deletion_reason column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'deletion_reason'
    ) THEN
        ALTER TABLE leads ADD COLUMN deletion_reason TEXT;
        RAISE NOTICE 'Added deletion_reason column to leads table';
    ELSE
        RAISE NOTICE 'deletion_reason column already exists in leads table';
    END IF;
END $$;

-- Add indexes for soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at);
CREATE INDEX IF NOT EXISTS idx_leads_deleted_by ON leads(deleted_by);

-- Add comments for documentation
COMMENT ON COLUMN leads.deleted_at IS 'Timestamp when the lead was soft-deleted. Null if not deleted.';
COMMENT ON COLUMN leads.deleted_by IS 'User who deleted the lead. Null if not deleted.';
COMMENT ON COLUMN leads.restored_at IS 'Timestamp when the lead was restored after deletion. Null if never restored.';
COMMENT ON COLUMN leads.deletion_reason IS 'Optional reason for deletion.';
