-- SQL to identify duplicate conversations
-- This query finds leads that have multiple conversations for the same business

-- Find all (business_id, lead_id) pairs with multiple conversations
SELECT 
  business_id,
  lead_id,
  COUNT(*) as conversation_count,
  ARRAY_AGG(id ORDER BY created_at) as conversation_ids,
  ARRAY_AGG(created_at ORDER BY created_at) as created_at,
  ARRAY_AGG(status ORDER BY created_at) as statuses
FROM conversations
GROUP BY business_id, lead_id
HAVING COUNT(*) > 1
ORDER BY conversation_count DESC;

-- Find conversations with message counts to help identify canonical conversation
SELECT 
  c.id,
  c.business_id,
  c.lead_id,
  c.status,
  c.created_at,
  COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
WHERE (c.business_id, c.lead_id) IN (
  SELECT business_id, lead_id
  FROM conversations
  GROUP BY business_id, lead_id
  HAVING COUNT(*) > 1
)
GROUP BY c.id, c.business_id, c.lead_id, c.status, c.created_at
ORDER BY c.business_id, c.lead_id, c.created_at;

-- Summary statistics
SELECT 
  COUNT(DISTINCT business_id) as businesses_with_duplicates,
  COUNT(DISTINCT lead_id) as leads_with_duplicates,
  SUM(conversation_count) as total_duplicate_conversations,
  SUM(conversation_count) - COUNT(DISTINCT lead_id) as excess_conversations
FROM (
  SELECT 
    business_id,
    lead_id,
    COUNT(*) as conversation_count
  FROM conversations
  GROUP BY business_id, lead_id
  HAVING COUNT(*) > 1
) duplicates;
