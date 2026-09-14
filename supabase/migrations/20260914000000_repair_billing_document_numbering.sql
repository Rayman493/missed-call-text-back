-- Repair billing document numbering: guarantee the canonical
-- assign_billing_document_number RPC exists with correct security.
--
-- PRODUCTION STATE RECONCILIATION:
--   Production had a PARTIAL / INCONSISTENT billing migration state.
--   The billing tables (billing_documents, billing_document_items,
--   billing_document_counters) and Batch 2 columns (including
--   businesses.logo_url) already existed in production. The missing
--   object was the assign_billing_document_number RPC, which caused
--   PGRST202 errors when saving Quote/Invoice drafts. The RPC was
--   manually restored in production; this migration is the canonical
--   codebase record of that repair so future environments receive the
--   correct function and security configuration.
--
-- This migration is IDEMPOTENT and CONSERVATIVE:
--   - CREATE TABLE IF NOT EXISTS is a no-op when tables already exist.
--   - DROP FUNCTION IF EXISTS + CREATE FUNCTION guarantees the canonical
--     RPC definition regardless of prior state. Existing counters and
--     documents are NOT touched.
--   - ALTER TABLE ENABLE ROW LEVEL SECURITY is idempotent.
--   - RLS policies and triggers are NOT recreated here — they come from
--     the foundation migration (20260913210000) which created the tables.
--     Recreating them would be unnecessary risk to healthy policies.
--   - No DROP TABLE, TRUNCATE, or counter reset.

-- ---------------------------------------------------------------------------
-- Ensure billing tables exist (no-op in production; helps fresh environments
-- where the foundation migration was not yet applied).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'invoice')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'cancelled', 'accepted', 'declined', 'expired', 'paid', 'overdue')),
    customer_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
    document_number TEXT NOT NULL,
    issue_date date NOT NULL DEFAULT CURRENT_DATE,
    valid_until date,
    due_date date,
    notes TEXT,
    terms TEXT,
    subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
    total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    sent_at timestamptz,
    payment_request_id uuid REFERENCES payment_requests(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, document_type, document_number)
);

CREATE INDEX IF NOT EXISTS idx_billing_documents_business_id ON billing_documents(business_id);
CREATE INDEX IF NOT EXISTS idx_billing_documents_business_type ON billing_documents(business_id, document_type);
CREATE INDEX IF NOT EXISTS idx_billing_documents_business_status ON billing_documents(business_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_documents_customer_id ON billing_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_documents_job_id ON billing_documents(job_id);

CREATE TABLE IF NOT EXISTS billing_document_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    unit_label TEXT,
    unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (line_total_cents >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_document_items_document_id ON billing_document_items(document_id);
CREATE INDEX IF NOT EXISTS idx_billing_document_items_sort ON billing_document_items(document_id, sort_order);

CREATE TABLE IF NOT EXISTS billing_document_counters (
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'invoice')),
    next_number INTEGER NOT NULL DEFAULT 1001,
    PRIMARY KEY (business_id, document_type)
);

-- ---------------------------------------------------------------------------
-- RLS (idempotent — ensures enabled even if foundation was not applied)
-- ---------------------------------------------------------------------------
ALTER TABLE billing_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_document_counters ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RPC: assign_billing_document_number
-- Concurrency-safe document number assignment using a per-business/type
-- row lock. Returns the document number string (e.g. 'Q-1001' or 'INV-1001').
--
-- Security model:
--   SECURITY DEFINER — runs as the migration owner (postgres) so it can
--   INSERT/UPDATE the counter table even though RLS only grants SELECT
--   to authenticated users. The function validates that p_business_id
--   belongs to the calling user (auth.uid()) before assigning a number,
--   preventing cross-business privilege escalation.
--
--   search_path is locked to 'public' only (pg_temp intentionally excluded)
--   to prevent search-path injection via temporary objects.
--
-- DROP first (IF EXISTS) then CREATE to handle:
--   - function missing entirely (partial migration state)
--   - function exists with different signature
--   - function exists without SECURITY DEFINER / search_path
-- Existing counters and documents are NOT affected by DROP+CREATE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS assign_billing_document_number(uuid, text);

CREATE FUNCTION assign_billing_document_number(
    p_business_id uuid,
    p_document_type text
) RETURNS text AS $$
DECLARE
    v_assigned INTEGER;
    v_prefix TEXT;
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
    -- This prevents cross-business number assignment.
    IF NOT EXISTS (
        SELECT 1 FROM businesses
        WHERE id = p_business_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Business does not belong to the current user';
    END IF;

    -- Ensure the counter row exists (first call for this business+type).
    -- Does nothing if the row already exists — preserves existing counters.
    INSERT INTO billing_document_counters (business_id, document_type, next_number)
    VALUES (p_business_id, p_document_type, 1001)
    ON CONFLICT (business_id, document_type) DO NOTHING;

    -- Atomically get the current value and increment for the next caller.
    -- The counter stores the NEXT number to assign; we return the current
    -- value (before increment) so the first document gets 1001, not 1000.
    UPDATE billing_document_counters
    SET next_number = next_number + 1
    WHERE business_id = p_business_id AND document_type = p_document_type
    RETURNING next_number - 1 INTO v_assigned;

    v_number := v_prefix || v_assigned::text;

    RETURN v_number;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Allow authenticated users to call the numbering RPC.
-- The function itself enforces business ownership.
-- anon is intentionally NOT granted execute.
GRANT EXECUTE ON FUNCTION assign_billing_document_number(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Explicitly reload PostgREST schema cache so the RPC is immediately
-- discoverable by the API layer without waiting for the periodic refresh.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
