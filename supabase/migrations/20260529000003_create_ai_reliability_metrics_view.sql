-- Create AI reliability metrics view for Phase 7: Success Rate Reporting
-- This view provides comprehensive success rate metrics for AI calls

CREATE OR REPLACE VIEW ai_reliability_metrics AS
WITH 
-- Get all AI calls from ai_call_records
all_ai_calls AS (
  SELECT 
    business_id,
    call_sid,
    outcome,
    created_at,
    extraction_failed,
    CASE 
      WHEN outcome = 'completed' AND extraction_failed = false THEN 'successful'
      WHEN outcome = 'voicemail_fallback' THEN 'voicemail_fallback'
      WHEN outcome = 'caller_hung_up' THEN 'caller_hung_up'
      ELSE 'failed'
    END as call_result
  FROM ai_call_records
  WHERE created_at >= NOW() - INTERVAL '30 days'
),

-- Get all failures from ai_call_failures
all_failures AS (
  SELECT 
    business_id,
    call_sid,
    failure_stage,
    failure_reason,
    created_at
  FROM ai_call_failures
  WHERE created_at >= NOW() - INTERVAL '30 days'
),

-- Combine calls and failures for comprehensive metrics
combined_metrics AS (
  SELECT 
    COALESCE(ac.business_id, af.business_id) as business_id,
    COALESCE(ac.call_sid, af.call_sid) as call_sid,
    COALESCE(ac.call_result, 'failed') as call_result,
    COALESCE(ac.created_at, af.created_at) as created_at,
    af.failure_stage,
    af.failure_reason
  FROM all_ai_calls ac
  FULL OUTER JOIN all_failures af ON ac.call_sid = af.call_sid AND ac.business_id = af.business_id
)

SELECT 
  -- Total counts
  COUNT(*) as total_ai_calls,
  
  -- Success metrics
  COUNT(*) FILTER (WHERE call_result = 'successful') as successful_ai_calls,
  COUNT(*) FILTER (WHERE call_result = 'voicemail_fallback') as voicemail_fallback_calls,
  COUNT(*) FILTER (WHERE call_result = 'caller_hung_up') as caller_hung_up_calls,
  COUNT(*) FILTER (WHERE call_result = 'failed') as connection_failures,
  
  -- Failure breakdown
  COUNT(*) FILTER (WHERE failure_stage = 'OPENAI_CONNECT_FAILED') as openai_connection_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'SESSION_READY_TIMEOUT') as session_timeouts,
  COUNT(*) FILTER (WHERE failure_stage = 'NO_AUDIO_RECEIVED') as dead_air_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'VOICEMAIL_FALLBACK') as voicemail_fallback_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'CALLER_HUNG_UP') as caller_hung_up_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'UNKNOWN') as unknown_failures,
  
  -- Success rates (as percentages)
  ROUND(
    (COUNT(*) FILTER (WHERE call_result = 'successful') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as ai_success_rate_percent,
  
  ROUND(
    (COUNT(*) FILTER (WHERE call_result = 'voicemail_fallback') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as fallback_rate_percent,
  
  ROUND(
    (COUNT(*) FILTER (WHERE call_result = 'failed') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as failure_rate_percent,
  
  -- Specific failure rates
  ROUND(
    (COUNT(*) FILTER (WHERE failure_stage = 'OPENAI_CONNECT_FAILED') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as connection_failure_rate_percent,
  
  ROUND(
    (COUNT(*) FILTER (WHERE failure_stage = 'SESSION_READY_TIMEOUT') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as session_timeout_rate_percent,
  
  ROUND(
    (COUNT(*) FILTER (WHERE failure_stage = 'NO_AUDIO_RECEIVED') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as dead_air_failure_rate_percent,
  
  -- Time period
  MIN(created_at) as earliest_call,
  MAX(created_at) as latest_call,
  CURRENT_DATE as report_date

FROM combined_metrics;

-- Create a per-business version of the metrics
CREATE OR REPLACE VIEW ai_reliability_metrics_by_business AS
WITH 
-- Get all AI calls from ai_call_records
all_ai_calls AS (
  SELECT 
    business_id,
    call_sid,
    outcome,
    created_at,
    extraction_failed,
    CASE 
      WHEN outcome = 'completed' AND extraction_failed = false THEN 'successful'
      WHEN outcome = 'voicemail_fallback' THEN 'voicemail_fallback'
      WHEN outcome = 'caller_hung_up' THEN 'caller_hung_up'
      ELSE 'failed'
    END as call_result
  FROM ai_call_records
  WHERE created_at >= NOW() - INTERVAL '30 days'
),

-- Get all failures from ai_call_failures
all_failures AS (
  SELECT 
    business_id,
    call_sid,
    failure_stage,
    failure_reason,
    created_at
  FROM ai_call_failures
  WHERE created_at >= NOW() - INTERVAL '30 days'
),

-- Combine calls and failures for comprehensive metrics
combined_metrics AS (
  SELECT 
    COALESCE(ac.business_id, af.business_id) as business_id,
    COALESCE(ac.call_sid, af.call_sid) as call_sid,
    COALESCE(ac.call_result, 'failed') as call_result,
    COALESCE(ac.created_at, af.created_at) as created_at,
    af.failure_stage,
    af.failure_reason
  FROM all_ai_calls ac
  FULL OUTER JOIN all_failures af ON ac.call_sid = af.call_sid AND ac.business_id = af.business_id
)

SELECT 
  business_id,
  
  -- Total counts
  COUNT(*) as total_ai_calls,
  
  -- Success metrics
  COUNT(*) FILTER (WHERE call_result = 'successful') as successful_ai_calls,
  COUNT(*) FILTER (WHERE call_result = 'voicemail_fallback') as voicemail_fallback_calls,
  COUNT(*) FILTER (WHERE call_result = 'caller_hung_up') as caller_hung_up_calls,
  COUNT(*) FILTER (WHERE call_result = 'failed') as connection_failures,
  
  -- Failure breakdown
  COUNT(*) FILTER (WHERE failure_stage = 'OPENAI_CONNECT_FAILED') as openai_connection_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'SESSION_READY_TIMEOUT') as session_timeouts,
  COUNT(*) FILTER (WHERE failure_stage = 'NO_AUDIO_RECEIVED') as dead_air_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'VOICEMAIL_FALLBACK') as voicemail_fallback_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'CALLER_HUNG_UP') as caller_hung_up_failures,
  COUNT(*) FILTER (WHERE failure_stage = 'UNKNOWN') as unknown_failures,
  
  -- Success rates (as percentages)
  ROUND(
    (COUNT(*) FILTER (WHERE call_result = 'successful') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as ai_success_rate_percent,
  
  ROUND(
    (COUNT(*) FILTER (WHERE call_result = 'voicemail_fallback') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as fallback_rate_percent,
  
  ROUND(
    (COUNT(*) FILTER (WHERE call_result = 'failed') * 100.0 / NULLIF(COUNT(*), 0)), 2
  ) as failure_rate_percent,
  
  -- Time period
  MIN(created_at) as earliest_call,
  MAX(created_at) as latest_call,
  CURRENT_DATE as report_date

FROM combined_metrics
GROUP BY business_id
ORDER BY total_ai_calls DESC;

-- Add comments
COMMENT ON VIEW ai_reliability_metrics IS 'Overall AI call reliability metrics and success rates';
COMMENT ON VIEW ai_reliability_metrics_by_business IS 'Per-business AI call reliability metrics and success rates';
