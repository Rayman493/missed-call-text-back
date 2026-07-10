-- SQL to clean up duplicate conversations
-- This migration preserves the canonical conversation and removes empty duplicates
-- Canonical selection: prefer conversation with messages, otherwise oldest

-- Step 1: Create a temporary table to identify canonical conversations
CREATE TEMPORARY TABLE canonical_conversations AS
WITH ranked_conversations AS (
  SELECT 
    c.id,
    c.business_id,
    c.lead_id,
    c.status,
    c.created_at,
    COUNT(m.id) as message_count,
    ROW_NUMBER() OVER (
      PARTITION BY c.business_id, c.lead_id 
      ORDER BY 
        COUNT(m.id) DESC,  -- Prefer conversations with messages
        c.created_at ASC   -- Otherwise use oldest
    ) as rank
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE (c.business_id, c.lead_id) IN (
    SELECT business_id, lead_id
    FROM conversations
    GROUP BY business_id, lead_id
    HAVING COUNT(*) > 1
  )
  GROUP BY c.id, c.business_id, c.lead_id, c.status, c.created_at
)
SELECT id, business_id, lead_id
FROM ranked_conversations
WHERE rank = 1;

-- Step 2: Identify duplicate conversations to delete (those not in canonical set)
-- Only delete conversations that have NO messages to be safe
CREATE TEMPORARY TABLE duplicate_conversations_to_delete AS
SELECT c.id, c.business_id, c.lead_id
FROM conversations c
WHERE (c.business_id, c.lead_id) IN (
  SELECT business_id, lead_id
  FROM conversations
  GROUP BY business_id, lead_id
  HAVING COUNT(*) > 1
)
AND c.id NOT IN (SELECT id FROM canonical_conversations)
AND NOT EXISTS (
  SELECT 1 FROM messages m WHERE m.conversation_id = c.id
);

-- Step 3: Review what will be deleted before executing
SELECT 
  d.id,
  d.business_id,
  d.lead_id,
  c.status,
  c.created_at,
  'No messages - safe to delete' as deletion_reason
FROM duplicate_conversations_to_delete d
JOIN conversations c ON c.id = d.id
ORDER BY d.business_id, d.lead_id, c.created_at;

-- Step 4: Execute deletion (UNCOMMENT TO RUN)
-- DELETE FROM conversations
-- WHERE id IN (SELECT id FROM duplicate_conversations_to_delete);

-- Step 5: Verify cleanup
SELECT 
  business_id,
  lead_id,
  COUNT(*) as remaining_conversations
FROM conversations
GROUP BY business_id, lead_id
HAVING COUNT(*) > 1;

-- Step 6: Cleanup temporary tables
DROP TABLE IF EXISTS canonical_conversations;
DROP TABLE IF EXISTS duplicate_conversations_to_delete;

-- IMPORTANT: Review the results from Step 3 before uncommenting Step 4
-- This ensures we only delete empty duplicate conversations
