-- Online Booking Phase 2: operational workflow
-- Business actions (accept/reject/suggest), customer conversion, and the
-- Appointment-XOR-Job invariant for converted bookings.
--
-- Additive only: one new CHECK on booking_requests, widened CHECKs on
-- booking_request_events + notifications, and one index.

-- ---------------------------------------------------------------------------
-- 1. One primary operational record — a converted booking is EITHER an
--    Appointment (Google Calendar event id) OR a Job, never both.
-- ---------------------------------------------------------------------------
alter table public.booking_requests
  add constraint booking_requests_one_operational_record
  check (not (appointment_id is not null and job_id is not null));

-- ---------------------------------------------------------------------------
-- 2. Traceability index for converted requests (booking → customer).
-- ---------------------------------------------------------------------------
create index if not exists idx_booking_requests_lead_id
  on public.booking_requests(lead_id) where lead_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Widen booking_request_events.event_type for Phase 2 history.
--    Existing types preserved; adds conversion + SMS delivery records.
-- ---------------------------------------------------------------------------
alter table public.booking_request_events
  drop constraint if exists booking_request_events_event_type_check;

alter table public.booking_request_events
  add constraint booking_request_events_event_type_check
  check (event_type in (
    'created',
    'time_proposed',
    'time_selected',
    'accepted',
    'declined',
    'cancelled',
    'expired',
    'lead_linked',
    'appointment_created',
    'job_created',
    'sms_sent',
    'sms_failed'
  ));

-- ---------------------------------------------------------------------------
-- 4. Widen notifications.type for business-facing booking notifications.
--    One type covers the booking lifecycle; data.event distinguishes cause.
-- ---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new_lead',
    'customer_reply',
    'followup_completed',
    'followup_sent',
    'forwarding_disconnected',
    'sms_failed',
    'trial_ending',
    'subscription_issue',
    'voicemail_received',
    'missed_call',
    'ai_intake_completed',
    'payment_requested',
    'payment_created',
    'payment_completed',
    'calendar_connected',
    'calendar_disconnected',
    'appointment_created',
    'appointment_deleted',
    'personal_voicemail',
    'reminder',
    'booking_request'
  ));
