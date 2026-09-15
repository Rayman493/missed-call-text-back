-- Optional human-readable display name for billing documents.
-- Display_name is organizational metadata; canonical document_number remains immutable.
ALTER TABLE billing_documents
    ADD COLUMN IF NOT EXISTS display_name text NULL CHECK (length(display_name) <= 80);

COMMENT ON COLUMN billing_documents.display_name IS 'Optional human-readable document name, separate from the immutable canonical document_number.';
