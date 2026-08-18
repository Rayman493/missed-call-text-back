-- ============================================================================
-- PRODUCTION MULTI-ROW ATOMIC CLAIM AUDIT
-- ============================================================================
-- READ-ONLY INVESTIGATION
-- DO NOT modify any data
-- ============================================================================

-- ============================================================================
-- COUNT HOW MANY ROWS THE CURRENT UPDATE PREDICATE CAN MATCH
-- ============================================================================
-- This is equivalent to the WHERE clause used in the atomic claim UPDATE
-- If this returns >1 row, the current UPDATE can target multiple rows

SELECT
    id,
    phone_number,
    business_id,
    status,
    sms_status,
    provisioning_status,
    created_at
FROM public.twilio_numbers
WHERE business_id IS NULL
  AND status = 'available'
  AND sms_status = 'ready'
  AND provisioning_status = 'ready'
ORDER BY created_at ASC;

-- ============================================================================
-- COUNT TOTAL ROWS MATCHING THE PREDICATE
-- ============================================================================

SELECT
    COUNT(*) as row_count
FROM public.twilio_numbers
WHERE business_id IS NULL
  AND status = 'available'
  AND sms_status = 'ready'
  AND provisioning_status = 'ready';

-- ============================================================================
-- VERIFY THE SPECIFIC CANDIDATE FROM PRODUCTION LOGS
-- ============================================================================
-- candidateId: 35ffee2a-02a8-421a-91ba-9c83916cf285

SELECT
    id,
    phone_number,
    business_id,
    status,
    sms_status,
    provisioning_status,
    created_at
FROM public.twilio_numbers
WHERE id = '35ffee2a-02a8-421a-91ba-9c83916cf285';

-- ============================================================================
-- VERIFY THE TARGET BUSINESS
-- ============================================================================
-- businessId: 2f2ece83-6f00-4ea7-a004-34c3e4584a35

SELECT
    id,
    business_id,
    subscription_status,
    provisioning_status
FROM public.businesses
WHERE id = '2f2ece83-6f00-4ea7-a004-34c3e4584a35';

-- ============================================================================
-- VERIFY NO ASSIGNED ROWS FOR THE BUSINESS
-- ============================================================================

SELECT
    id,
    phone_number,
    business_id,
    status
FROM public.twilio_numbers
WHERE business_id = '2f2ece83-6f00-4ea7-a004-34c3e4584a35'
  AND status IN ('active', 'assigned');