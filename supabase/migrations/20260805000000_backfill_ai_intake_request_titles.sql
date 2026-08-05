-- Backfill AI Intake Request Titles
-- This migration fixes existing records with bad request values (conversational filler)
-- by attempting to recover the actual service from the raw details field.
-- Only updates records when confidence is high.

-- Bad request patterns to identify records that need backfill
-- These are the conversational filler patterns that should be replaced
-- with actual service names extracted from the details field.

-- Step 1: Identify records with bad request values in ai_call_records.extracted_info
-- The request field is stored as reasonForCalling or serviceRequested in extracted_info JSONB

-- First, let's create a temporary function to extract a canonical request title from text
-- This is a simplified version of the TypeScript generateCanonicalRequestTitle function
CREATE OR REPLACE FUNCTION extract_service_from_details(details TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  IF details IS NULL OR details = '' THEN
    RETURN NULL;
  END IF;

  -- Remove common conversational prefixes
  result := regexp_replace(details, '^(I was looking to|I would like to|I want to|I need to|I''m looking for|Can you|Could you|I was wondering if|I need someone to|I need a|I need an?)\s*', '', 'i');
  
  -- Remove pronouns at the start
  result := regexp_replace(result, '^(my|our|someone to|somebody to)\s*', '', 'i');
  
  -- Remove trailing filler
  result := regexp_replace(result, '\s*(please|thanks|thank you|asap|as soon as possible|when possible)?\s*$', '', 'i');
  
  -- Capitalize first letter of each word (simple title case)
  result := initcap(trim(result));
  
  -- Limit to 5 words
  result := (
    SELECT array_to_string(array_slice(string_to_array(result, ' '), 1, 5), ' ')
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update ai_call_records where reasonForCalling contains bad patterns
-- Only update if the details field contains enough information to recover the service

UPDATE ai_call_records
SET extracted_info = jsonb_set(
  COALESCE(extracted_info, '{}'::jsonb),
  '{reasonForCalling}',
  to_jsonb(extract_service_from_details(extracted_info->>'importantDetails'))
)
WHERE 
  -- Only update if reasonForCalling exists and matches bad patterns
  extracted_info ? 'reasonForCalling'
  AND (
    extracted_info->>'reasonForCalling' ~* '^(was looking|looking for|i need|i want|can you|could you|i was wondering|we need|looking|get my|the customer wants|service request|general inquiry|general service|request|inquiry)$'
    OR extracted_info->>'reasonForCalling' ~* '^(i|we|you|my|your|our)\s'
    OR length(trim(extracted_info->>'reasonForCalling')) <= 2
  )
  -- Only update if importantDetails contains enough information
  AND extracted_info ? 'importantDetails'
  AND length(trim(extracted_info->>'importantDetails')) > 10
  -- Only update if the extracted service is different from the current value
  AND extract_service_from_details(extracted_info->>'importantDetails') IS NOT NULL
  AND extract_service_from_details(extracted_info->>'importantDetails') != trim(extracted_info->>'reasonForCalling');

-- Step 3: Update leads.raw_metadata where request field contains bad patterns
-- This handles cases where the request is stored directly in raw_metadata

UPDATE leads
SET raw_metadata = jsonb_set(
  COALESCE(raw_metadata, '{}'::jsonb),
  '{request}',
  to_jsonb(extract_service_from_details(raw_metadata->>'additionalDetails'))
)
WHERE 
  -- Only update if request exists and matches bad patterns
  raw_metadata ? 'request'
  AND (
    raw_metadata->>'request' ~* '^(was looking|looking for|i need|i want|can you|could you|i was wondering|we need|looking|get my|the customer wants|service request|general inquiry|general service|request|inquiry)$'
    OR raw_metadata->>'request' ~* '^(i|we|you|my|your|our)\s'
    OR length(trim(raw_metadata->>'request')) <= 2
  )
  -- Only update if additionalDetails contains enough information
  AND raw_metadata ? 'additionalDetails'
  AND length(trim(raw_metadata->>'additionalDetails')) > 10
  -- Only update if the extracted service is different from the current value
  AND extract_service_from_details(raw_metadata->>'additionalDetails') IS NOT NULL
  AND extract_service_from_details(raw_metadata->>'additionalDetails') != trim(raw_metadata->>'request');

-- Step 4: Update leads.raw_metadata where serviceRequested contains bad patterns
-- This handles the legacy serviceRequested field

UPDATE leads
SET raw_metadata = jsonb_set(
  COALESCE(raw_metadata, '{}'::jsonb),
  '{serviceRequested}',
  to_jsonb(extract_service_from_details(raw_metadata->>'additionalDetails'))
)
WHERE 
  -- Only update if serviceRequested exists and matches bad patterns
  raw_metadata ? 'serviceRequested'
  AND (
    raw_metadata->>'serviceRequested' ~* '^(was looking|looking for|i need|i want|can you|could you|i was wondering|we need|looking|get my|the customer wants|service request|general inquiry|general service|request|inquiry)$'
    OR raw_metadata->>'serviceRequested' ~* '^(i|we|you|my|your|our)\s'
    OR length(trim(raw_metadata->>'serviceRequested')) <= 2
  )
  -- Only update if additionalDetails contains enough information
  AND raw_metadata ? 'additionalDetails'
  AND length(trim(raw_metadata->>'additionalDetails')) > 10
  -- Only update if the extracted service is different from the current value
  AND extract_service_from_details(raw_metadata->>'additionalDetails') IS NOT NULL
  AND extract_service_from_details(raw_metadata->>'additionalDetails') != trim(raw_metadata->>'serviceRequested');

-- Step 5: Clean up the temporary function
DROP FUNCTION IF EXISTS extract_service_from_details;

-- Step 6: Add a comment to document the backfill
COMMENT ON COLUMN ai_call_records.extracted_info IS 'AI extracted information. Backfilled on 2026-08-05 to fix conversational filler in reasonForCalling field.';
COMMENT ON COLUMN leads.raw_metadata IS 'Raw metadata from AI intake. Backfilled on 2026-08-05 to fix conversational filler in request/serviceRequested fields.';
