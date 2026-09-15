-- Harden assign_billing_document_number against counter drift.
--
-- The previous implementation only used billing_document_counters.next_number
-- and never reconciled against MAX(document_number) in billing_documents.
-- If any document was created outside the RPC (seed, manual SQL, or a prior
-- bug), the counter could drift behind existing documents and produce a
-- duplicate-key 23505 on the unique constraint.
--
-- This migration replaces the function so that:
--   next = MAX(stored_counter, existing_max_numeric + 1)
--
-- The counter row is locked with FOR UPDATE, so concurrent allocations for
-- the same business+type serialize on the row lock — no two callers can
-- receive the same number.
--
-- This migration is IDEMPOTENT and CONSERVATIVE:
--   - CREATE OR REPLACE FUNCTION preserves existing counters/documents.
--   - No DROP TABLE, TRUNCATE, or counter reset.
--   - The unique constraint remains intact.

CREATE OR REPLACE FUNCTION assign_billing_document_number(
    p_business_id uuid,
    p_document_type text
) RETURNS text AS $$
DECLARE
    v_prefix TEXT;
    v_counter_next INTEGER;
    v_existing_max INTEGER;
    v_assigned INTEGER;
    v_number TEXT;
BEGIN
    -- Validate document_type
    IF p_document_type = 'quote' THEN
        v_prefix := 'Q-';
    ELSIF p_document_type = 'invoice' THEN
        v_prefix := 'INV-';
    ELSE
        RAISE EXCEPTION 'Invalid document_type: %', p_document_type;
    END IF;

    -- Authorization: the calling user must own this business.
    IF NOT EXISTS (
        SELECT 1 FROM businesses
        WHERE id = p_business_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Business does not belong to the current user';
    END IF;

    -- Ensure the counter row exists (first call for this business+type).
    INSERT INTO billing_document_counters (business_id, document_type, next_number)
    VALUES (p_business_id, p_document_type, 1001)
    ON CONFLICT (business_id, document_type) DO NOTHING;

    -- Lock the counter row so concurrent allocations serialize.
    SELECT next_number INTO v_counter_next
    FROM billing_document_counters
    WHERE business_id = p_business_id AND document_type = p_document_type
    FOR UPDATE;

    -- Find the highest existing document number for this business+type.
    -- Extracts the trailing integer from 'Q-XXXX' / 'INV-XXXX' format.
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(document_number FROM '[0-9]+$') AS INTEGER)),
        0
    )
    INTO v_existing_max
    FROM billing_documents
    WHERE business_id = p_business_id AND document_type = p_document_type;

    -- Use whichever is higher: stored counter or existing max + 1.
    -- This makes the allocator self-healing — if the counter drifted behind
    -- existing documents, it catches up automatically.
    v_assigned := GREATEST(v_counter_next, v_existing_max + 1);

    -- Persist the updated counter.
    UPDATE billing_document_counters
    SET next_number = v_assigned + 1
    WHERE business_id = p_business_id AND document_type = p_document_type;

    v_number := v_prefix || v_assigned::text;
    RETURN v_number;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Re-apply security grants (idempotent — same as previous migration).
REVOKE ALL ON FUNCTION assign_billing_document_number(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION assign_billing_document_number(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION assign_billing_document_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_billing_document_number(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
