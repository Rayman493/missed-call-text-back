-- Create leads and conversations tables for AI voice intake
-- Migration: 20260527000000_create_leads_and_conversations.sql
-- Purpose: Store leads and conversations from AI voice intake

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    source TEXT DEFAULT 'ai_voice' CHECK (source IN ('ai_voice', 'sms', 'manual', 'web')),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'needs_follow_up', 'in_progress', 'completed', 'archived')),
    
    -- Lead metadata
    raw_metadata jsonb,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    
    UNIQUE(business_id, phone)
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    call_sid TEXT,
    ai_call_session_id uuid REFERENCES ai_call_sessions(id) ON DELETE SET NULL,
    
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    sender TEXT NOT NULL CHECK (sender IN ('ai', 'caller', 'system', 'user')),
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'note', 'summary', 'transcript')),
    
    -- Structured data for AI summaries
    structured_data jsonb,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_business_id ON leads(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_call_sid ON conversations(call_sid);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- RLS (Row Level Security) Policies
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for leads
CREATE POLICY "Users can view leads for their businesses"
    ON leads
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "System can insert leads"
    ON leads
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "System can update leads"
    ON leads
    FOR UPDATE
    WITH CHECK (true);

-- Policies for conversations
CREATE POLICY "Users can view conversations for their businesses"
    ON conversations
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "System can insert conversations"
    ON conversations
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "System can update conversations"
    ON conversations
    FOR UPDATE
    WITH CHECK (true);

-- Policies for messages
CREATE POLICY "Users can view messages for their businesses"
    ON messages
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "System can insert messages"
    ON messages
    FOR INSERT
    WITH CHECK (true);

-- Trigger to update updated_at timestamp on leads
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at timestamp on conversations
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE leads IS 'Leads generated from AI voice intake, SMS, or other sources';
COMMENT ON TABLE conversations IS 'Conversations with leads';
COMMENT ON TABLE messages IS 'Messages within conversations';
