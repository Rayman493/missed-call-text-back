-- Backfill body and direction for legacy AI intake messages
-- that were written with the content-only shape before the
-- current body/direction contract.

UPDATE messages
SET
  body = content,
  direction = COALESCE(
    direction,
    CASE
      WHEN message_type = 'transcript' THEN 'inbound'
      ELSE 'outbound'
    END
  )
WHERE
  body IS NULL
  AND content IS NOT NULL
  AND message_type IN ('summary', 'transcript', 'system');
