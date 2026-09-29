-- Publish booking_requests for realtime postgres_changes.
-- BookingRequestsCard and BookingRequestDetailModal subscribe to this table,
-- but it was never added to the supabase_realtime publication — so those
-- channels report SUBSCRIBED yet deliver zero events (same failure class as
-- the old filtered channel bug documented in
-- 20261002000000_final_submission_realtime_publication.sql).
-- The table already has a business_memberships-scoped SELECT policy
-- (20260928010000_team_access_rls_cutover.sql), so authorized subscribers
-- receive only their own business's rows once published.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'booking_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE booking_requests;
    END IF;
END $$;
