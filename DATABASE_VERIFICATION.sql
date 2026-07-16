-- Database Verification Queries for Operational Monitoring
-- Run these in Supabase SQL Editor to confirm migrations were applied successfully

-- 1. Verify operational_alerts table exists
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'operational_alerts';

-- Expected: 1 row with table_name='operational_alerts', table_type='BASE TABLE'

-- 2. Verify operational_alerts table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'operational_alerts'
ORDER BY ordinal_position;

-- Expected columns: id, condition_id, severity, current_state, first_triggered_at, 
-- last_triggered_at, last_alerted_at, alert_count_for_period, alert_count_period_start,
-- resolved_at, latest_summary, created_at, updated_at

-- 3. Verify operational_alerts indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'operational_alerts';

-- Expected indexes: idx_operational_alerts_condition_id, idx_operational_alerts_current_state,
-- idx_operational_alerts_last_triggered_at, operational_alerts_pkey

-- 4. Verify operational_alerts constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'operational_alerts'::regclass;

-- Expected: operational_alerts_pkey (primary key), operational_alerts_condition_id_key (unique),
-- operational_alerts_severity_check, operational_alerts_current_state_check

-- 5. Verify claim_operational_alert function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'claim_operational_alert';

-- Expected: 1 row with routine_name='claim_operational_alert', routine_type='FUNCTION'

-- 6. Verify final_recovery_outcome column exists on ai_call_records
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'ai_call_records'
AND column_name = 'final_recovery_outcome';

-- Expected: 1 row with column_name='final_recovery_outcome', data_type='text', is_nullable='YES'

-- 7. Verify final_recovery_outcome check constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'ai_call_records'::regclass
AND conname LIKE '%final_recovery_outcome%';

-- Expected: Check constraint with values: ai_success, voicemail_success, sms_success, unrecovered

-- 8. Verify final_recovery_outcome index
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'ai_call_records'
AND indexname LIKE '%final_recovery_outcome%';

-- Expected: idx_ai_call_records_final_recovery_outcome

-- 9. Test claim_operational_alert function (safe test)
-- This will create a test record but won't send email
SELECT claim_operational_alert('test-verification-123', 'critical') as result;

-- Expected: JSON with claimed=true, alert_count=1, last_alerted_at timestamp

-- 10. Clean up test record
DELETE FROM operational_alerts WHERE condition_id = 'test-verification-123';

-- Expected: 1 row deleted
