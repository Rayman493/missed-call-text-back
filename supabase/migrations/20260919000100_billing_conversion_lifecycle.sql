ALTER TABLE billing_documents REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'billing_documents'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE billing_documents;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM billing_documents
        WHERE source_quote_id IS NOT NULL
          AND document_type = 'invoice'
        GROUP BY source_quote_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate derived invoices exist; run the Batch 4 duplicate audit before adding the source quote invariant';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_one_invoice_per_source_quote_idx
    ON billing_documents (source_quote_id)
    WHERE source_quote_id IS NOT NULL AND document_type = 'invoice';

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
      AND document.business_id IN (
          SELECT business.id FROM businesses business WHERE business.user_id = auth.uid()
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
