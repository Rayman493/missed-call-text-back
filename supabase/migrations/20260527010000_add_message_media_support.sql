-- Add message_media table for MMS/media support
-- This enables storing and retrieving media attachments from Twilio MMS messages

-- Create message_media table
CREATE TABLE IF NOT EXISTS message_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT message_media_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_message_media_message_id ON message_media(message_id);
CREATE INDEX IF NOT EXISTS idx_message_media_created_at ON message_media(created_at);

-- Enable RLS
ALTER TABLE message_media ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only access media for messages in their business
CREATE POLICY "Users can view media for their business messages"
  ON message_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages
      WHERE messages.id = message_media.message_id
      AND EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = messages.lead_id
        AND leads.business_id = (
          SELECT id FROM businesses
          WHERE user_id = auth.uid()
          LIMIT 1
        )
      )
    )
  );

-- Comments for documentation
COMMENT ON TABLE message_media IS 'Stores media attachments for MMS messages from Twilio';
COMMENT ON COLUMN message_media.id IS 'Unique identifier for the media attachment';
COMMENT ON COLUMN message_media.message_id IS 'Reference to the parent message';
COMMENT ON COLUMN message_media.media_url IS 'URL to the media file (typically from Twilio)';
COMMENT ON COLUMN message_media.mime_type IS 'MIME type of the media (e.g., image/jpeg, video/mp4)';
COMMENT ON COLUMN message_media.created_at IS 'Timestamp when the media was created';
