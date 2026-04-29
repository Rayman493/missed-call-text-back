-- Enable Row Level Security for all tables and create proper policies
-- This is critical for production security to prevent cross-account data access

-- Enable RLS for leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Create policies for leads table
CREATE POLICY "Users can view own leads" 
ON leads FOR SELECT 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert own leads" 
ON leads FOR INSERT 
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update own leads" 
ON leads FOR UPDATE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete own leads" 
ON leads FOR DELETE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

-- Enable RLS for messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policies for messages table
CREATE POLICY "Users can view own messages" 
ON messages FOR SELECT 
USING (lead_id IN (
  SELECT l.id FROM leads l 
  JOIN businesses b ON l.business_id = b.id 
  WHERE b.user_id = auth.uid()
));

CREATE POLICY "Users can insert own messages" 
ON messages FOR INSERT 
WITH CHECK (lead_id IN (
  SELECT l.id FROM leads l 
  JOIN businesses b ON l.business_id = b.id 
  WHERE b.user_id = auth.uid()
));

CREATE POLICY "Users can update own messages" 
ON messages FOR UPDATE 
USING (lead_id IN (
  SELECT l.id FROM leads l 
  JOIN businesses b ON l.business_id = b.id 
  WHERE b.user_id = auth.uid()
))
WITH CHECK (lead_id IN (
  SELECT l.id FROM leads l 
  JOIN businesses b ON l.business_id = b.id 
  WHERE b.user_id = auth.uid()
));

CREATE POLICY "Users can delete own messages" 
ON messages FOR DELETE 
USING (lead_id IN (
  SELECT l.id FROM leads l 
  JOIN businesses b ON l.business_id = b.id 
  WHERE b.user_id = auth.uid()
));

-- Enable RLS for conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create policies for conversations table
CREATE POLICY "Users can view own conversations" 
ON conversations FOR SELECT 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert own conversations" 
ON conversations FOR INSERT 
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update own conversations" 
ON conversations FOR UPDATE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete own conversations" 
ON conversations FOR DELETE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

-- Enable RLS for follow_up_jobs table
ALTER TABLE follow_up_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for follow_up_jobs table
CREATE POLICY "Users can view own follow_up_jobs" 
ON follow_up_jobs FOR SELECT 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert own follow_up_jobs" 
ON follow_up_jobs FOR INSERT 
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update own follow_up_jobs" 
ON follow_up_jobs FOR UPDATE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete own follow_up_jobs" 
ON follow_up_jobs FOR DELETE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

-- Enable RLS for call_events table
ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;

-- Create policies for call_events table
CREATE POLICY "Users can view own call_events" 
ON call_events FOR SELECT 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert own call_events" 
ON call_events FOR INSERT 
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update own call_events" 
ON call_events FOR UPDATE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete own call_events" 
ON call_events FOR DELETE 
USING (business_id IN (
  SELECT id FROM businesses WHERE user_id = auth.uid()
));

-- Check if twilio_numbers table exists and add RLS if it does
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'twilio_numbers') THEN
        -- Enable RLS for twilio_numbers table
        ALTER TABLE twilio_numbers ENABLE ROW LEVEL SECURITY;

        -- Create policies for twilio_numbers table
        CREATE POLICY "Users can view own twilio_numbers" 
        ON twilio_numbers FOR SELECT 
        USING (business_id IN (
          SELECT id FROM businesses WHERE user_id = auth.uid()
        ));

        CREATE POLICY "Users can insert own twilio_numbers" 
        ON twilio_numbers FOR INSERT 
        WITH CHECK (business_id IN (
          SELECT id FROM businesses WHERE user_id = auth.uid()
        ));

        CREATE POLICY "Users can update own twilio_numbers" 
        ON twilio_numbers FOR UPDATE 
        USING (business_id IN (
          SELECT id FROM businesses WHERE user_id = auth.uid()
        ))
        WITH CHECK (business_id IN (
          SELECT id FROM businesses WHERE user_id = auth.uid()
        ));

        CREATE POLICY "Users can delete own twilio_numbers" 
        ON twilio_numbers FOR DELETE 
        USING (business_id IN (
          SELECT id FROM businesses WHERE user_id = auth.uid()
        ));
    END IF;
END $$;

-- Create indexes for better RLS performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_leads_business_id_user_id ON leads(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id_business_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id_user_id ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_business_id_user_id ON follow_up_jobs(business_id);
CREATE INDEX IF NOT EXISTS idx_call_events_business_id_user_id ON call_events(business_id);
