-- Online Booking Phase 1: intake foundation
-- Creates the booking settings, weekly hours, availability exceptions,
-- booking requests, and request history tables.
--
-- Product contract: a booking request is PRE-CUSTOMER. Submitting a request
-- must not create leads, jobs, appointments, or conversations. lead_id /
-- appointment_id / job_id stay NULL until a later accept/convert flow.

-- ---------------------------------------------------------------------------
-- 1. booking_settings — one row per business
-- ---------------------------------------------------------------------------
create table if not exists public.booking_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,

  enabled boolean not null default false,
  public_slug text unique,

  -- IANA timezone the weekly hours and generated slots are interpreted in.
  -- Defaults to the business hours timezone when first enabled.
  timezone text not null default 'America/New_York',

  default_duration_minutes integer not null default 60
    check (default_duration_minutes > 0 and default_duration_minutes <= 480),
  slot_interval_minutes integer not null default 30
    check (slot_interval_minutes > 0 and slot_interval_minutes <= 240),
  min_notice_minutes integer not null default 120
    check (min_notice_minutes >= 0),
  booking_window_days integer not null default 30
    check (booking_window_days > 0 and booking_window_days <= 365),

  -- When true and no booking_hours rows exist, availability is derived from
  -- businesses.business_hours_start/end (Mon–Fri) so owners do not have to
  -- re-enter their normal hours.
  use_business_hours boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_settings_slug_format
    check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{2,63}$')
);

create index if not exists idx_booking_settings_business_id
  on public.booking_settings(business_id);
create unique index if not exists idx_booking_settings_public_slug
  on public.booking_settings(public_slug) where public_slug is not null;

-- ---------------------------------------------------------------------------
-- 2. booking_hours — recurring weekly availability (one window per day)
-- ---------------------------------------------------------------------------
-- day_of_week uses the JavaScript convention: 0 = Sunday … 6 = Saturday.
create table if not exists public.booking_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),

  constraint booking_hours_one_window_per_day
    unique (business_id, day_of_week),
  constraint booking_hours_start_before_end
    check (start_time < end_time)
);

create index if not exists idx_booking_hours_business_id
  on public.booking_hours(business_id);

-- ---------------------------------------------------------------------------
-- 3. booking_exceptions — one-off blocked time (vacation, day off, personal)
-- ---------------------------------------------------------------------------
-- label is INTERNAL ONLY and must never be exposed through public APIs.
create table if not exists public.booking_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  label text,
  created_at timestamptz not null default now(),

  constraint booking_exceptions_start_before_end
    check (start_at < end_at)
);

create index if not exists idx_booking_exceptions_business_range
  on public.booking_exceptions(business_id, start_at, end_at);

-- ---------------------------------------------------------------------------
-- 4. booking_requests — ONE persistent request through negotiation
-- ---------------------------------------------------------------------------
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  -- High-entropy opaque token for the public continuation URL. Never exposes
  -- the row id and cannot be used to enumerate other requests.
  continuation_token text not null unique,

  -- Idempotency key supplied by the client so a double submit cannot create
  -- a second request for the same logical booking.
  client_request_id text unique,

  status text not null default 'pending' check (status in (
    'pending',
    'business_proposed',
    'customer_reselected',
    'accepted',
    'declined',
    'cancelled',
    'expired'
  )),

  -- Customer snapshot — enough to create a canonical customer later without
  -- asking the business to re-enter anything.
  customer_name text not null,
  customer_phone text,
  normalized_phone text,
  customer_email text,
  customer_address text,
  service text,
  notes text,

  -- Original customer-requested window (never mutated after creation).
  requested_start timestamptz not null,
  requested_end timestamptz not null,

  -- Currently negotiated window (business proposal or customer reselect).
  current_proposed_start timestamptz,
  current_proposed_end timestamptz,

  -- Business timezone at request time (display aid for both sides).
  timezone text not null,

  -- Pending/active requests hold their effective window for other public
  -- bookers until this instant (prevents obvious multi-customer pileups
  -- without permanent calendar reservations).
  hold_expires_at timestamptz not null default (now() + interval '48 hours'),

  -- Linkage for the later accept/convert phase — always NULL in Phase 1.
  lead_id uuid references public.leads(id) on delete set null,
  appointment_id text,
  job_id uuid references public.jobs(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_requests_requested_range
    check (requested_start < requested_end),
  constraint booking_requests_proposed_range
    check (current_proposed_start is null or current_proposed_start < current_proposed_end)
);

create index if not exists idx_booking_requests_business_status
  on public.booking_requests(business_id, status);
create index if not exists idx_booking_requests_business_created
  on public.booking_requests(business_id, created_at desc);
create index if not exists idx_booking_requests_hold
  on public.booking_requests(business_id, hold_expires_at)
  where status in ('pending', 'business_proposed', 'customer_reselected');

-- ---------------------------------------------------------------------------
-- 5. booking_request_events — structured negotiation history
-- ---------------------------------------------------------------------------
-- Powers the later timeline: "Requested Tue 2:00 PM → Business suggested Wed
-- 10:30 AM → Customer selected Thu 1:00 PM → Accepted".
create table if not exists public.booking_request_events (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,

  event_type text not null check (event_type in (
    'created',
    'time_proposed',
    'time_selected',
    'accepted',
    'declined',
    'cancelled',
    'expired'
  )),
  actor text not null default 'customer' check (actor in ('customer', 'business', 'system')),

  from_status text,
  to_status text,

  -- The time window associated with this event (requested/proposed/selected).
  start_at timestamptz,
  end_at timestamptz,

  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_request_events_request
  on public.booking_request_events(booking_request_id, created_at);
create index if not exists idx_booking_request_events_business
  on public.booking_request_events(business_id, created_at);

-- ---------------------------------------------------------------------------
-- 6. Allow 'online_booking' as a canonical customer source (future convert)
-- ---------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('ai_voice', 'sms', 'manual', 'web', 'online_booking') or source is null);

-- ---------------------------------------------------------------------------
-- 7. Row Level Security — owner-scoped only; public access is via service-role
--    API routes and never directly against these tables.
-- ---------------------------------------------------------------------------
alter table public.booking_settings enable row level security;
alter table public.booking_hours enable row level security;
alter table public.booking_exceptions enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_request_events enable row level security;

create policy "Users can view own booking settings"
  on public.booking_settings for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can insert own booking settings"
  on public.booking_settings for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can update own booking settings"
  on public.booking_settings for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()))
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can view own booking hours"
  on public.booking_hours for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can insert own booking hours"
  on public.booking_hours for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can update own booking hours"
  on public.booking_hours for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()))
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can delete own booking hours"
  on public.booking_hours for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can view own booking exceptions"
  on public.booking_exceptions for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can insert own booking exceptions"
  on public.booking_exceptions for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can update own booking exceptions"
  on public.booking_exceptions for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()))
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can delete own booking exceptions"
  on public.booking_exceptions for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can view own booking requests"
  on public.booking_requests for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));
create policy "Users can update own booking requests"
  on public.booking_requests for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()))
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can view own booking request events"
  on public.booking_request_events for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));
