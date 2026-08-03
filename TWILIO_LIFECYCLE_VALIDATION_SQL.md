# Twilio Number Lifecycle Validation SQL Queries

These queries are for post-deploy validation to ensure data integrity after implementing the P0 Twilio number lifecycle safety fixes.

## Query 1: Active/trialing businesses with invalid number linkage

Identifies businesses with active or trialing subscriptions that have invalid Twilio number references.

```sql
-- Active/trialing businesses with invalid number linkage
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.subscription_status,
  b.twilio_phone_number,
  b.twilio_phone_number_sid,
  b.assigned_twilio_number_id,
  tn.id as twilio_number_id,
  tn.phone_number as twilio_actual_phone,
  tn.twilio_sid as twilio_actual_sid,
  tn.business_id as twilio_business_id,
  tn.status as twilio_status,
  CASE 
    WHEN b.assigned_twilio_number_id IS NOT NULL AND tn.id IS NULL THEN 'Missing twilio_number record'
    WHEN b.assigned_twilio_number_id IS NOT NULL AND b.assigned_twilio_number_id != tn.id THEN 'ID mismatch'
    WHEN b.twilio_phone_number IS NOT NULL AND b.twilio_phone_number != tn.phone_number THEN 'Phone number mismatch'
    WHEN b.twilio_phone_number_sid IS NOT NULL AND b.twilio_phone_number_sid != tn.twilio_sid THEN 'SID mismatch'
    WHEN tn.business_id != b.id THEN 'Business ID mismatch'
    ELSE 'OK'
  END as linkage_issue
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id OR b.twilio_phone_number = tn.phone_number
WHERE b.subscription_status IN ('active', 'trialing')
  AND (
    b.assigned_twilio_number_id IS NOT NULL 
    OR b.twilio_phone_number IS NOT NULL
    OR b.twilio_phone_number_sid IS NOT NULL
  )
ORDER BY b.subscription_status, linkage_issue;
```

## Query 2: Retired/available/released numbers still referenced by businesses

Identifies Twilio numbers that are retired, available, or released but still referenced by businesses.

```sql
-- Retired/available/released numbers still referenced by businesses
SELECT 
  tn.id as twilio_number_id,
  tn.phone_number,
  tn.twilio_sid,
  tn.status,
  tn.business_id as twilio_business_id,
  tn.detached_at,
  tn.detached_reason,
  b.id as business_id,
  b.name as business_name,
  b.twilio_phone_number as business_phone,
  b.assigned_twilio_number_id as business_assigned_id,
  b.subscription_status,
  b.is_protected_account,
  CASE 
    WHEN tn.status = 'retired' THEN 'Retired number with business reference'
    WHEN tn.status = 'available' THEN 'Available number with business reference'
    WHEN tn.status = 'released' THEN 'Released number with business reference'
    ELSE 'Other'
  END as issue_type
FROM twilio_numbers tn
INNER JOIN businesses b ON (
  b.twilio_phone_number = tn.phone_number 
  OR b.twilio_phone_number_sid = tn.twilio_sid
  OR b.assigned_twilio_number_id = tn.id
)
WHERE tn.status IN ('retired', 'available', 'released')
  OR (tn.status = 'retired' AND tn.business_id IS NOT NULL)
ORDER BY tn.status, issue_type;
```

## Query 3: Protected businesses with pending release or detached assigned numbers

Identifies protected accounts that have pending release schedules or detached assigned numbers.

```sql
-- Protected businesses with pending release or detached assigned numbers
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.is_protected_account,
  b.protected_reason,
  b.subscription_status,
  b.twilio_release_status,
  b.twilio_release_at,
  b.twilio_release_reason,
  b.twilio_phone_number,
  b.assigned_twilio_number_id,
  tn.status as twilio_number_status,
  tn.business_id as twilio_business_id,
  tn.detached_at,
  tn.detached_reason,
  CASE 
    WHEN b.is_protected_account = true AND b.twilio_release_status = 'scheduled' THEN 'Protected account with scheduled release'
    WHEN b.is_protected_account = true AND tn.business_id IS NULL THEN 'Protected account with detached number'
    WHEN b.is_protected_account = true AND tn.status = 'retired' THEN 'Protected account with retired number'
    WHEN b.is_protected_account = true AND tn.status = 'released' THEN 'Protected account with released number'
    ELSE 'OK'
  END as issue_type
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id
WHERE b.is_protected_account = true
  AND (
    b.twilio_release_status = 'scheduled'
    OR tn.business_id IS NULL
    OR tn.status IN ('retired', 'released')
  )
ORDER BY b.protected_reason, issue_type;
```

## Query 4: Businesses with forwarding_verified=true but no valid assigned number

Identifies businesses that have forwarding marked as verified but don't have a valid Twilio number assignment.

```sql
-- Businesses with forwarding_verified=true but no valid assigned number
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.forwarding_verified,
  b.forwarding_verified_at,
  b.call_forwarding_enabled,
  b.call_forwarding_status,
  b.twilio_phone_number,
  b.twilio_phone_number_sid,
  b.assigned_twilio_number_id,
  tn.id as twilio_number_id,
  tn.phone_number as twilio_actual_phone,
  tn.twilio_sid as twilio_actual_sid,
  tn.status as twilio_status,
  tn.business_id as twilio_business_id,
  CASE 
    WHEN b.forwarding_verified = true AND b.twilio_phone_number IS NULL THEN 'Forwarding verified but no phone number'
    WHEN b.forwarding_verified = true AND tn.id IS NULL THEN 'Forwarding verified but no twilio_number record'
    WHEN b.forwarding_verified = true AND tn.business_id != b.id THEN 'Forwarding verified but number assigned to different business'
    WHEN b.forwarding_verified = true AND tn.status IN ('retired', 'released', 'available') THEN 'Forwarding verified but number not active'
    ELSE 'OK'
  END as issue_type
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id
WHERE b.forwarding_verified = true
  AND (
    b.twilio_phone_number IS NULL
    OR tn.id IS NULL
    OR tn.business_id != b.id
    OR tn.status IN ('retired', 'released', 'available')
  )
ORDER BY issue_type;
```

## Query 5: Cross-table reference integrity check

Comprehensive check for all businesses and Twilio numbers to ensure reference integrity.

```sql
-- Cross-table reference integrity check
SELECT 
  'business_to_twilio' as check_type,
  b.id as business_id,
  b.twilio_phone_number,
  b.twilio_phone_number_sid,
  b.assigned_twilio_number_id,
  tn.id as twilio_number_id,
  tn.phone_number,
  tn.twilio_sid,
  tn.business_id,
  CASE 
    WHEN b.assigned_twilio_number_id IS NOT NULL AND tn.id IS NULL THEN 'Orphaned assigned_twilio_number_id'
    WHEN b.assigned_twilio_number_id IS NOT NULL AND b.assigned_twilio_number_id != tn.id THEN 'ID mismatch'
    WHEN b.twilio_phone_number IS NOT NULL AND b.twilio_phone_number != tn.phone_number THEN 'Phone number mismatch'
    WHEN b.twilio_phone_number_sid IS NOT NULL AND b.twilio_phone_number_sid != tn.twilio_sid THEN 'SID mismatch'
    WHEN tn.business_id IS NOT NULL AND tn.business_id != b.id THEN 'Business ID mismatch'
    ELSE 'OK'
  END as status
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id
WHERE b.assigned_twilio_number_id IS NOT NULL
  OR b.twilio_phone_number IS NOT NULL
  OR b.twilio_phone_number_sid IS NOT NULL

UNION ALL

SELECT 
  'twilio_to_business' as check_type,
  tn.business_id as business_id,
  tn.phone_number as twilio_phone_number,
  tn.twilio_sid as twilio_phone_number_sid,
  tn.id as assigned_twilio_number_id,
  tn.id as twilio_number_id,
  tn.phone_number,
  tn.twilio_sid,
  tn.business_id,
  CASE 
    WHEN tn.business_id IS NOT NULL AND b.id IS NULL THEN 'Orphaned business_id in twilio_numbers'
    WHEN tn.business_id IS NOT NULL AND b.assigned_twilio_number_id != tn.id THEN 'assigned_twilio_number_id mismatch'
    WHEN tn.business_id IS NOT NULL AND b.twilio_phone_number != tn.phone_number THEN 'twilio_phone_number mismatch'
    WHEN tn.business_id IS NOT NULL AND b.twilio_phone_number_sid != tn.twilio_sid THEN 'twilio_phone_number_sid mismatch'
    ELSE 'OK'
  END as status
FROM twilio_numbers tn
LEFT JOIN businesses b ON tn.business_id = b.id
WHERE tn.business_id IS NOT NULL
  OR tn.status = 'assigned'
ORDER BY status, check_type;
```

## Query 6: Forwarding state consistency check

Checks for consistency between forwarding state and Twilio number assignment.

```sql
-- Forwarding state consistency check
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.forwarding_verified,
  b.forwarding_verified_at,
  b.call_forwarding_enabled,
  b.call_forwarding_status,
  b.phone_setup_completed_at,
  b.forwarding_instructions_confirmed_at,
  b.twilio_phone_number,
  b.assigned_twilio_number_id,
  tn.status as twilio_number_status,
  tn.sms_status as twilio_sms_status,
  tn.business_id as twilio_business_id,
  CASE 
    WHEN b.forwarding_verified = true AND (b.twilio_phone_number IS NULL OR tn.id IS NULL) THEN 'Forwarding verified without valid number'
    WHEN b.forwarding_verified = false AND b.call_forwarding_enabled = true THEN 'Forwarding not verified but enabled'
    WHEN b.phone_setup_completed_at IS NOT NULL AND b.twilio_phone_number IS NULL THEN 'Phone setup completed without number'
    WHEN b.forwarding_instructions_confirmed_at IS NOT NULL AND b.twilio_phone_number IS NULL THEN 'Forwarding confirmed without number'
    WHEN tn.sms_status = 'ready' AND b.forwarding_verified = false THEN 'SMS ready but forwarding not verified'
    ELSE 'OK'
  END as consistency_issue
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id
WHERE (
  (b.forwarding_verified = true AND (b.twilio_phone_number IS NULL OR tn.id IS NULL))
  OR (b.forwarding_verified = false AND b.call_forwarding_enabled = true)
  OR (b.phone_setup_completed_at IS NOT NULL AND b.twilio_phone_number IS NULL)
  OR (b.forwarding_instructions_confirmed_at IS NOT NULL AND b.twilio_phone_number IS NULL)
  OR (tn.sms_status = 'ready' AND b.forwarding_verified = false)
)
ORDER BY consistency_issue;
```

## Query 7: Recent lifecycle mutations audit

Shows recent lifecycle mutations for verification.

```sql
-- Recent lifecycle mutations audit (last 30 days)
SELECT 
  CASE 
    WHEN tn.detached_at IS NOT NULL THEN 'detach'
    WHEN tn.released_at IS NOT NULL THEN 'release'
    WHEN tn.status = 'retired' THEN 'retire'
    WHEN tn.business_id IS NOT NULL THEN 'assign'
    ELSE 'other'
  END as mutation_type,
  tn.id as twilio_number_id,
  tn.phone_number,
  tn.status,
  tn.business_id,
  tn.detached_at,
  tn.detached_reason,
  tn.released_at,
  b.id as business_id,
  b.name as business_name,
  b.subscription_status,
  b.is_protected_account,
  b.twilio_phone_number,
  b.assigned_twilio_number_id,
  GREATEST(
    COALESCE(tn.detached_at, tn.created_at),
    COALESCE(tn.released_at, tn.created_at),
    tn.updated_at
  ) as last_mutation
FROM twilio_numbers tn
LEFT JOIN businesses b ON tn.business_id = b.id OR b.assigned_twilio_number_id = tn.id
WHERE GREATEST(
    COALESCE(tn.detached_at, tn.created_at),
    COALESCE(tn.released_at, tn.created_at),
    tn.updated_at
  ) >= NOW() - INTERVAL '30 days'
ORDER BY last_mutation DESC;
```

## Usage

Run these queries in your Supabase SQL editor or via the Supabase CLI after deploying the P0 fixes to validate data integrity:

1. Run Query 1 to check for active/trialing businesses with invalid number linkage
2. Run Query 2 to identify orphaned references
3. Run Query 3 to check protected account safety
4. Run Query 4 to identify forwarding state inconsistencies
5. Run Query 5 for comprehensive reference integrity
6. Run Query 6 for forwarding state consistency
7. Run Query 7 to audit recent lifecycle mutations

All queries should return empty results (0 rows) if the system is in a healthy state after the P0 fixes are deployed.
