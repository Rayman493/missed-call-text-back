-- PI-B2: Membership-based authorization for billing document RPCs.
--
-- assign_billing_document_number and convert_quote_to_invoice still
-- authorized via businesses.user_id = auth.uid() (owner-only). Team Access V1
-- grants business_memberships rows day-to-day access, and billing_documents
-- RLS already permits member insert/update/delete — but members could not
-- create documents or convert accepted quotes because these SECURITY DEFINER
-- functions rejected any caller who was not the owner.
--
-- This migration redefines ONLY the authorization predicate in both
-- functions, from owner-only to membership-based:
--   EXISTS (SELECT 1 FROM business_memberships bm
--           WHERE bm.business_id = ... AND bm.user_id = auth.uid())
-- Owners retain a membership row (role 'owner'), so owner behavior is
-- unchanged. The functions remain SECURITY DEFINER, non-public, and keep all
-- counter locking, document numbering, status validation, and idempotent
-- conversion semantics.
--
-- This migration is ADDITIVE and CONSERVATIVE:
--   - CREATE OR REPLACE FUNCTION only; no table/column/RLS changes.
--   - No data updates.
--   - Grants are re-applied identically.

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

    -- Authorization: the calling user must be a member of this business.
    IF NOT EXISTS (
        SELECT 1 FROM business_memberships bm
        WHERE bm.business_id = p_business_id AND bm.user_id = auth.uid()
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

CREATE OR REPLACE FUNCTION convert_quote_to_invoice(p_quote_id uuid)
RETURNS uuid AS $$
DECLARE
    v_quote billing_documents%ROWTYPE;
    v_invoice_id uuid;
    v_invoice_number text;
BEGIN
    SELECT document.*
    INTO v_quote
    FROM billing_documents document
    WHERE document.id = p_quote_id
      AND EXISTS (
          SELECT 1 FROM business_memberships bm
          WHERE bm.business_id = document.business_id AND bm.user_id = auth.uid()
      )
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found';
    END IF;
    IF v_quote.document_type <> 'quote' THEN
        RAISE EXCEPTION 'Only quotes can be converted to invoices';
    END IF;
    IF v_quote.status <> 'accepted' THEN
        RAISE EXCEPTION 'Only accepted quotes can be converted to invoices';
    END IF;

    SELECT document.id
    INTO v_invoice_id
    FROM billing_documents document
    WHERE document.business_id = v_quote.business_id
      AND document.document_type = 'invoice'
      AND document.source_quote_id = v_quote.id
    ORDER BY document.created_at ASC
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
        RETURN v_invoice_id;
    END IF;

    v_invoice_number := assign_billing_document_number(v_quote.business_id, 'invoice');

    INSERT INTO billing_documents (
        business_id, document_type, status, document_number, display_name,
        issue_date, customer_id, job_id, subtotal_cents, discount_cents,
        tax_cents, total_cents, currency, notes, terms, source_quote_id
    ) VALUES (
        v_quote.business_id, 'invoice', 'draft', v_invoice_number, v_quote.display_name,
        CURRENT_DATE, v_quote.customer_id, v_quote.job_id, v_quote.subtotal_cents,
        v_quote.discount_cents, v_quote.tax_cents, v_quote.total_cents,
        COALESCE(v_quote.currency, 'usd'), v_quote.notes, v_quote.terms, v_quote.id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO billing_document_items (
        document_id, sort_order, description, quantity, unit_label,
        unit_price_cents, line_total_cents
    )
    SELECT
        v_invoice_id, item.sort_order, item.description, item.quantity,
        item.unit_label, item.unit_price_cents, item.line_total_cents
    FROM billing_document_items item
    WHERE item.document_id = v_quote.id
    ORDER BY item.sort_order;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION convert_quote_to_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION convert_quote_to_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION convert_quote_to_invoice(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
