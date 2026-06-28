-- ============================================
-- ReplyFlow Business Data Reset Script
-- ============================================
-- Purpose: Clears ALL test/demo data for a single business
-- Usage: Run in Supabase SQL Editor
-- 
-- This script:
-- - Deletes all business-owned child records (leads, conversations, messages, etc.)
-- - Resets business state counters
-- - Preserves account, phone number, billing, and configuration
-- 
-- DO NOT modify:
-- - users, auth
-- - Stripe customer/subscription
-- - Stripe Connect account
-- - Twilio phone number assignment
-- - Business settings
-- - Forwarding configuration
-- - Calendar integration
-- - Subscription/trial status
-- ============================================

DO $$
DECLARE
    -- Replace this placeholder UUID with the actual business UUID to reset
    target_business_id UUID := '00000000-0000-0000-0000-000000000000';
    deleted_count INTEGER;
    leads_count INTEGER;
    conversations_count INTEGER;
    messages_count INTEGER;
BEGIN
    -- Validate business_id is not the placeholder
    IF target_business_id = '00000000-0000-0000-0000-000000000000' THEN
        RAISE EXCEPTION 'Please replace the placeholder UUID (00000000-0000-0000-0000-000000000000) with the actual business UUID';
    END IF;
    
    -- Verify business exists
    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = target_business_id) THEN
        RAISE EXCEPTION 'Business with ID % does not exist', target_business_id;
    END IF;
    
    RAISE NOTICE 'Starting data reset for business: %', target_business_id;
    RAISE NOTICE '============================================';
    
    -- ============================================
    -- SECTION 1: DELETE CHILD TABLES
    -- ============================================
    -- Delete in correct dependency order to avoid foreign key violations
    
    -- 1.1 Delete message_media (references messages)
    DELETE FROM message_media
    WHERE message_id IN (
        SELECT m.id FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.business_id = target_business_id
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % message_media records', deleted_count;
    
    -- 1.2 Delete messages (references conversations, leads, business)
    DELETE FROM messages
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % messages records', deleted_count;
    
    -- 1.3 Delete payment_requests (references leads, conversations, business)
    DELETE FROM payment_requests
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % payment_requests records', deleted_count;
    
    -- 1.4 Delete voicemail_recordings (references business, leads, conversations)
    DELETE FROM voicemail_recordings
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % voicemail_recordings records', deleted_count;
    
    -- 1.5 Delete ai_call_records (references business, leads, conversations)
    DELETE FROM ai_call_records
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % ai_call_records records', deleted_count;
    
    -- 1.6 Delete follow_up_jobs (references lead_id, conversation_id)
    -- Note: follow_up_jobs table references leads and conversations
    DELETE FROM follow_up_jobs
    WHERE lead_id IN (
        SELECT id FROM leads WHERE business_id = target_business_id
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % follow_up_jobs records', deleted_count;
    
    -- ============================================
    -- SECTION 2: DELETE CONVERSATIONS
    -- ============================================
    -- Conversations reference leads and business
    DELETE FROM conversations
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % conversations records', deleted_count;
    
    -- ============================================
    -- SECTION 3: DELETE NOTIFICATIONS
    -- ============================================
    -- Notifications reference business
    DELETE FROM notifications
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % notifications records', deleted_count;
    
    -- ============================================
    -- SECTION 4: DELETE LEADS
    -- ============================================
    -- Leads reference business
    DELETE FROM leads
    WHERE business_id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % leads records', deleted_count;
    
    -- ============================================
    -- SECTION 5: RESET BUSINESS STATE
    -- ============================================
    -- Reset business counters and onboarding/test flags
    -- This returns the business to a clean testing state
    
    UPDATE businesses
    SET 
        -- Reset counters
        missed_call_count = 0,
        recovered_call_count = 0,
        
        -- Reset onboarding/test flags
        first_test_call_completed_at = NULL
        
        -- Note: We do NOT reset these protected fields:
        -- - subscription_status, stripe_customer_id, stripe_subscription_id
        -- - twilio_phone_number, twilio_phone_number_status
        -- - forwarding_enabled, forwarding_verified, forwarding_verified_at
        -- - calendar_integration_enabled
        -- - trial_started_at, trial_ends_at
        -- - onboarding_status (preserve this to maintain account state)
    WHERE id = target_business_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Updated business state for % business records', deleted_count;
    
    -- ============================================
    -- SECTION 6: CLEANUP OPTIONAL TABLES
    -- ============================================
    -- Clean up any other business-owned records that may not exist in all deployments
    
    -- 6.1 Delete system_sms for this business (if table exists)
    BEGIN
        -- Check if system_sms table has business_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'system_sms' AND column_name = 'business_id'
        ) THEN
            DELETE FROM system_sms WHERE business_id = target_business_id;
            RAISE NOTICE 'Deleted system_sms records';
        END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
        RAISE NOTICE 'system_sms table or business_id column does not exist, skipping';
    END;
    
    -- 6.2 Delete call_events for this business (if table exists)
    BEGIN
        -- Check if call_events table has business_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'call_events' AND column_name = 'business_id'
        ) THEN
            DELETE FROM call_events WHERE business_id = target_business_id;
            RAISE NOTICE 'Deleted call_events records';
        END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
        RAISE NOTICE 'call_events table or business_id column does not exist, skipping';
    END;
    
    -- ============================================
    -- VERIFICATION
    -- ============================================
    -- Confirm all data was deleted for the target business
    SELECT COUNT(*) INTO leads_count FROM leads WHERE business_id = target_business_id;
    SELECT COUNT(*) INTO conversations_count FROM conversations WHERE business_id = target_business_id;
    SELECT COUNT(*) INTO messages_count FROM messages WHERE business_id = target_business_id;
    
    RAISE NOTICE '============================================';
    RAISE NOTICE 'RESET COMPLETE FOR BUSINESS: %', target_business_id;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Remaining records:';
    RAISE NOTICE '  - Leads: %', leads_count;
    RAISE NOTICE '  - Conversations: %', conversations_count;
    RAISE NOTICE '  - Messages: %', messages_count;
    RAISE NOTICE '============================================';
    
    IF leads_count = 0 AND conversations_count = 0 AND messages_count = 0 THEN
        RAISE NOTICE 'SUCCESS: All data has been cleared for this business';
    ELSE
        RAISE WARNING 'WARNING: Some records remain. Check the results above.';
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Reset failed: %', SQLERRM;
END $$;
