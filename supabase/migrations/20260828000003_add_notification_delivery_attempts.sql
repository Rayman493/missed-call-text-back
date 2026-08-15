-- Add notification delivery attempt tracking
-- This addresses the reliability gap where push notification delivery failures had no retry/recovery layer
-- Notifications can now track delivery attempts independently of the notification record

create type delivery_status as enum ('pending', 'sent', 'failed');

create table if not exists notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),

  -- Reference to the notification
  notification_id uuid not null references notifications(id) on delete cascade,

  -- User context for the delivery attempt
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Delivery channel
  channel text not null check (channel in ('push', 'email', 'sms')),

  -- Delivery status
  status delivery_status not null default 'pending',

  -- Retry tracking
  attempt_number integer not null default 1,
  error_message text,

  -- Timestamps
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- Prevent duplicate attempts for the same notification/channel/attempt
  constraint notification_delivery_attempts_unique unique (notification_id, channel, attempt_number)
);

-- Indexes for common query patterns
create index if not exists idx_notification_delivery_attempts_notification_id on notification_delivery_attempts(notification_id);
create index if not exists idx_notification_delivery_attempts_user_id on notification_delivery_attempts(user_id);
create index if not exists idx_notification_delivery_attempts_status on notification_delivery_attempts(status);
create index if not exists idx_notification_delivery_attempts_channel on notification_delivery_attempts(channel);

-- Index for querying failed push attempts (for retry logic)
create index if not exists idx_notification_delivery_attempts_failed_push on notification_delivery_attempts(notification_id, channel, attempted_at DESC) where channel = 'push' and status = 'failed';

-- Index for querying recent delivery attempts
create index if not exists idx_notification_delivery_attempts_attempted_at on notification_delivery_attempts(attempted_at DESC);

-- Add comments
comment on table notification_delivery_attempts is 'Tracks delivery attempts for notifications across different channels (push, email, SMS)';
comment on column notification_delivery_attempts.notification_id is 'Reference to the notification being delivered';
comment on column notification_delivery_attempts.user_id is 'User who should receive the notification';
comment on column notification_delivery_attempts.channel is 'Delivery channel: push, email, or SMS';
comment on column notification_delivery_attempts.status is 'Delivery status: pending, sent, or failed';
comment on column notification_delivery_attempts.attempt_number is 'Retry attempt number (1, 2, 3, etc.)';
comment on column notification_delivery_attempts.error_message is 'Error message if delivery failed, null if successful';
comment on column notification_delivery_attempts.attempted_at is 'Timestamp when delivery was attempted';

-- RLS
alter table notification_delivery_attempts enable row level security;

-- Service role can read/write all delivery attempts (for server-side delivery logic)
create policy "service_role_all" on notification_delivery_attempts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Users can read their own delivery attempts
create policy "users_read_own" on notification_delivery_attempts
  for select using (
    user_id = auth.uid()
  );

-- Grant permissions
grant all on notification_delivery_attempts to service_role;
grant select on notification_delivery_attempts to authenticated;