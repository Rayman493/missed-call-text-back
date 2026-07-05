-- Harden relationship integrity for V1 launch
-- Ensures business-scoped child records cannot reference parents from a different business.

-- Align payment_requests.requested_by nullability with its ON DELETE SET NULL foreign key action.
ALTER TABLE payment_requests
ALTER COLUMN requested_by DROP NOT NULL;

-- Composite uniqueness targets for business-scoped relationship validation.
ALTER TABLE leads
ADD CONSTRAINT leads_id_business_id_unique UNIQUE (id, business_id);

ALTER TABLE conversations
ADD CONSTRAINT conversations_id_business_id_unique UNIQUE (id, business_id);

ALTER TABLE conversations
ADD CONSTRAINT conversations_id_lead_id_unique UNIQUE (id, lead_id);

ALTER TABLE messages
ADD CONSTRAINT messages_id_conversation_id_unique UNIQUE (id, conversation_id);

-- Ensure conversations belong to the same business as their lead.
ALTER TABLE conversations
ADD CONSTRAINT conversations_lead_business_match_fkey
FOREIGN KEY (lead_id, business_id)
REFERENCES leads(id, business_id)
ON DELETE CASCADE
NOT VALID;

-- Ensure messages belong to the same business as their lead and conversation.
ALTER TABLE messages
ADD CONSTRAINT messages_lead_business_match_fkey
FOREIGN KEY (lead_id, business_id)
REFERENCES leads(id, business_id)
ON DELETE CASCADE
NOT VALID;

ALTER TABLE messages
ADD CONSTRAINT messages_conversation_business_match_fkey
FOREIGN KEY (conversation_id, business_id)
REFERENCES conversations(id, business_id)
ON DELETE CASCADE
NOT VALID;

ALTER TABLE messages
ADD CONSTRAINT messages_conversation_lead_match_fkey
FOREIGN KEY (conversation_id, lead_id)
REFERENCES conversations(id, lead_id)
ON DELETE CASCADE
NOT VALID;

-- Ensure follow-up jobs belong to the same business as their lead.
ALTER TABLE follow_up_jobs
ADD CONSTRAINT follow_up_jobs_lead_business_match_fkey
FOREIGN KEY (lead_id, business_id)
REFERENCES leads(id, business_id)
ON DELETE CASCADE
NOT VALID;

-- Ensure payment requests belong to the same business as their lead and conversation.
ALTER TABLE payment_requests
ADD CONSTRAINT payment_requests_lead_business_match_fkey
FOREIGN KEY (lead_id, business_id)
REFERENCES leads(id, business_id)
ON DELETE CASCADE
NOT VALID;

ALTER TABLE payment_requests
ADD CONSTRAINT payment_requests_conversation_business_match_fkey
FOREIGN KEY (conversation_id, business_id)
REFERENCES conversations(id, business_id)
ON DELETE CASCADE
NOT VALID;

ALTER TABLE payment_requests
ADD CONSTRAINT payment_requests_conversation_lead_match_fkey
FOREIGN KEY (conversation_id, lead_id)
REFERENCES conversations(id, lead_id)
ON DELETE CASCADE
NOT VALID;

-- Ensure voicemail recordings belong to the same business as their lead and conversation.
ALTER TABLE voicemail_recordings
ADD CONSTRAINT voicemail_recordings_lead_business_match_fkey
FOREIGN KEY (lead_id, business_id)
REFERENCES leads(id, business_id)
ON DELETE CASCADE
NOT VALID;

ALTER TABLE voicemail_recordings
ADD CONSTRAINT voicemail_recordings_conversation_business_match_fkey
FOREIGN KEY (conversation_id, business_id)
REFERENCES conversations(id, business_id)
ON DELETE CASCADE
NOT VALID;
