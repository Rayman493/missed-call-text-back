-- Add comprehensive Row Level Security (RLS) policies for all tables
-- CRITICAL SECURITY: Prevents cross-tenant data leakage

-- Enable RLS on all tables if not already enabled
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE twilio_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;

-- ========================================
-- BUSINESSES TABLE RLS POLICIES
-- ========================================

-- Users can only view their own businesses
CREATE POLICY "Users can view own businesses"
ON businesses FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own businesses
CREATE POLICY "Users can insert own businesses"
ON businesses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own businesses
CREATE POLICY "Users can update own businesses"
ON businesses FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own businesses
CREATE POLICY "Users can delete own businesses"
ON businesses FOR DELETE
USING (auth.uid() = user_id);

-- ========================================
-- LEADS TABLE RLS POLICIES
-- ========================================

-- Users can only view leads for their own businesses
CREATE POLICY "Users can view own business leads"
ON leads FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can insert leads for their own businesses
CREATE POLICY "Users can insert own business leads"
ON leads FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can update leads for their own businesses
CREATE POLICY "Users can update own business leads"
ON leads FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can delete leads for their own businesses
CREATE POLICY "Users can delete own business leads"
ON leads FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- ========================================
-- CONVERSATIONS TABLE RLS POLICIES
-- ========================================

-- Users can only view conversations for their own businesses
CREATE POLICY "Users can view own business conversations"
ON conversations FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can insert conversations for their own businesses
CREATE POLICY "Users can insert own business conversations"
ON conversations FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can update conversations for their own businesses
CREATE POLICY "Users can update own business conversations"
ON conversations FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can delete conversations for their own businesses
CREATE POLICY "Users can delete own business conversations"
ON conversations FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- ========================================
-- MESSAGES TABLE RLS POLICIES
-- ========================================

-- Users can only view messages for their own businesses (via leads)
CREATE POLICY "Users can view own business messages"
ON messages FOR SELECT
USING (
  auth.uid() IN (
    SELECT b.user_id 
    FROM messages m
    JOIN leads l ON m.lead_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE m.id = messages.id
  )
);

-- Users can insert messages for their own businesses
CREATE POLICY "Users can insert own business messages"
ON messages FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT b.user_id 
    FROM leads l
    JOIN businesses b ON l.business_id = b.id
    WHERE l.id = lead_id
  )
);

-- Users can update messages for their own businesses
CREATE POLICY "Users can update own business messages"
ON messages FOR UPDATE
USING (
  auth.uid() IN (
    SELECT b.user_id 
    FROM messages m
    JOIN leads l ON m.lead_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE m.id = messages.id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT b.user_id 
    FROM leads l
    JOIN businesses b ON l.business_id = b.id
    WHERE l.id = lead_id
  )
);

-- Users can delete messages for their own businesses
CREATE POLICY "Users can delete own business messages"
ON messages FOR DELETE
USING (
  auth.uid() IN (
    SELECT b.user_id 
    FROM messages m
    JOIN leads l ON m.lead_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE m.id = messages.id
  )
);

-- ========================================
-- FOLLOW_UP_JOBS TABLE RLS POLICIES
-- ========================================

-- Users can only view follow-up jobs for their own businesses
CREATE POLICY "Users can view own business follow_up_jobs"
ON follow_up_jobs FOR SELECT
USING (
  auth.uid() IN (
    SELECT b.user_id 
    FROM follow_up_jobs f
    JOIN leads l ON f.lead_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE f.id = follow_up_jobs.id
  )
);

-- Users can insert follow-up jobs for their own businesses
CREATE POLICY "Users can insert own business follow_up_jobs"
ON follow_up_jobs FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT b.user_id 
    FROM leads l
    JOIN businesses b ON l.business_id = b.id
    WHERE l.id = lead_id
  )
);

-- Users can update follow-up jobs for their own businesses
CREATE POLICY "Users can update own business follow_up_jobs"
ON follow_up_jobs FOR UPDATE
USING (
  auth.uid() IN (
    SELECT b.user_id 
    FROM follow_up_jobs f
    JOIN leads l ON f.lead_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE f.id = follow_up_jobs.id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT b.user_id 
    FROM leads l
    JOIN businesses b ON l.business_id = b.id
    WHERE l.id = lead_id
  )
);

-- Users can delete follow-up jobs for their own businesses
CREATE POLICY "Users can delete own business follow_up_jobs"
ON follow_up_jobs FOR DELETE
USING (
  auth.uid() IN (
    SELECT b.user_id 
    FROM follow_up_jobs f
    JOIN leads l ON f.lead_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE f.id = follow_up_jobs.id
  )
);

-- ========================================
-- TWILIO_NUMBERS TABLE RLS POLICIES
-- ========================================

-- Users can only view Twilio numbers for their own businesses
CREATE POLICY "Users can view own business twilio_numbers"
ON twilio_numbers FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can insert Twilio numbers for their own businesses
CREATE POLICY "Users can insert own business twilio_numbers"
ON twilio_numbers FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can update Twilio numbers for their own businesses
CREATE POLICY "Users can update own business twilio_numbers"
ON twilio_numbers FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can delete Twilio numbers for their own businesses
CREATE POLICY "Users can delete own business twilio_numbers"
ON twilio_numbers FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- ========================================
-- CALL_EVENTS TABLE RLS POLICIES
-- ========================================

-- Users can only view call events for their own businesses
CREATE POLICY "Users can view own business call_events"
ON call_events FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can insert call events for their own businesses
CREATE POLICY "Users can insert own business call_events"
ON call_events FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can update call events for their own businesses
CREATE POLICY "Users can update own business call_events"
ON call_events FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- Users can delete call events for their own businesses
CREATE POLICY "Users can delete own business call_events"
ON call_events FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id FROM businesses WHERE id = business_id
  )
);

-- ========================================
-- SECURITY VALIDATION QUERIES
-- ========================================

-- Test RLS policies (run as authenticated user)
-- These queries should return empty results for cross-tenant data access

-- Test: Users should only see their own business
-- SELECT * FROM businesses WHERE user_id != auth.uid();

-- Test: Users should only see leads for their business
-- SELECT * FROM leads WHERE business_id NOT IN (SELECT id FROM businesses WHERE user_id = auth.uid());

-- Test: Users should only see messages for their leads
-- SELECT * FROM messages WHERE lead_id NOT IN (
--   SELECT id FROM leads WHERE business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
-- );

-- ========================================
-- PERFORMANCE INDEXES FOR RLS
-- ========================================

-- Create indexes to support RLS policy performance
CREATE INDEX IF NOT EXISTS idx_businesses_user_id_rls ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_business_id_rls ON leads(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id_rls ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id_rls ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_lead_id_rls ON follow_up_jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_business_id_rls ON twilio_numbers(business_id);
CREATE INDEX IF NOT EXISTS idx_call_events_business_id_rls ON call_events(business_id);

-- Composite indexes for complex RLS joins
CREATE INDEX IF NOT EXISTS idx_messages_lead_business_join ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_lead_business_join ON follow_up_jobs(lead_id);
