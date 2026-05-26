-- Add customer profile fields to leads table
-- Migration: 20250526010000_add_customer_profile_fields.sql

-- Add new optional fields for lightweight customer profile system
ALTER TABLE leads 
ADD COLUMN contact_name TEXT,
ADD COLUMN company_name TEXT,
ADD COLUMN notes TEXT,
ADD COLUMN tags TEXT[];

-- Add indexes for better search performance
CREATE INDEX idx_leads_contact_name_gin ON leads USING gin(to_tsvector('english', contact_name)) WHERE contact_name IS NOT NULL;
CREATE INDEX idx_leads_company_name_gin ON leads USING gin(to_tsvector('english', company_name)) WHERE company_name IS NOT NULL;
CREATE INDEX idx_leads_tags ON leads USING gin(tags) WHERE tags IS NOT NULL;

-- Add comment to document the purpose
COMMENT ON COLUMN leads.contact_name IS 'Optional contact name for the lead/customer';
COMMENT ON COLUMN leads.company_name IS 'Optional company name for the lead/customer';
COMMENT ON COLUMN leads.notes IS 'Optional notes about the lead/customer';
COMMENT ON COLUMN leads.tags IS 'Optional tags for categorizing leads/customers';
