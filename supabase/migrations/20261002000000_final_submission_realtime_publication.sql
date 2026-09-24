-- Final submission sync: publish remaining realtime-subscribed tables.
-- The client already opens postgres_changes channels for tasks, call_events,
-- notifications and ai_call_records, but these tables were never added to the
-- supabase_realtime publication — so those channels report SUBSCRIBED yet
-- deliver zero events (same failure class as the old filtered channel bug).
-- Each table already has a business/user-scoped SELECT policy, so authorized
-- subscribers receive only their own rows once published.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'call_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE call_events;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'ai_call_records'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE ai_call_records;
    END IF;
END $$;
