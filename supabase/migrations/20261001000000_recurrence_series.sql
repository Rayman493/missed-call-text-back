-- Migration: recurring reminders/jobs V1
--
-- Series + exceptions model. A series references a template row (the anchor
-- occurrence — the original task/job the user created) plus a JSONB snapshot
-- used to materialize future occurrences. Occurrences are virtual until
-- touched: editing/completing/deleting a specific date writes an exception
-- row, optionally with a real materialized task/job so existing features
-- (time tracking, payments, reminder notifications) work per-occurrence.
--
-- Scoped by business_id with Team Access membership RLS — owners and
-- members can both manage recurring operational items; outsiders get zero.

create table if not exists public.recurrence_series (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  entity_type      text not null check (entity_type in ('task', 'job')),
  -- Anchor occurrence row (tasks.id or jobs.id). Nullable: the anchor row may
  -- be deleted independently while the series continues from the snapshot.
  template_id      uuid,
  -- Immutable field snapshot used to materialize future occurrences.
  template_snapshot jsonb not null,
  frequency        text not null check (frequency in ('daily','weekdays','weekly','biweekly','monthly','yearly')),
  -- YYYY-MM-DD of the first occurrence and its day-of-month (drift-free anchor).
  anchor_date      date not null,
  anchor_day       integer not null check (anchor_day between 1 and 31),
  timezone         text not null default 'America/New_York',
  end_type         text not null default 'never' check (end_type in ('never','on_date','after_occurrences')),
  end_date         date,
  max_occurrences  integer check (max_occurrences is null or (max_occurrences >= 1 and max_occurrences <= 10000)),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint recurrence_end_date_valid check (end_type <> 'on_date' or end_date is not null),
  constraint recurrence_max_occurrences_valid check (end_type <> 'after_occurrences' or max_occurrences is not null)
);

create table if not exists public.recurrence_exceptions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  series_id       uuid not null references public.recurrence_series(id) on delete cascade,
  occurrence_date date not null,
  kind            text not null check (kind in ('skipped','materialized')),
  -- Real tasks/jobs row created for this occurrence when materialized.
  -- Set null if that row is later deleted.
  materialized_id uuid,
  created_at      timestamptz not null default now(),

  constraint recurrence_exceptions_unique_date unique (series_id, occurrence_date)
);

-- Materialized occurrence rows carry their series link directly.
alter table public.tasks add column if not exists series_id uuid references public.recurrence_series(id) on delete set null;
alter table public.jobs  add column if not exists series_id uuid references public.recurrence_series(id) on delete set null;

-- Indexes
create index if not exists recurrence_series_business_idx on public.recurrence_series(business_id);
create index if not exists recurrence_series_template_idx on public.recurrence_series(entity_type, template_id);
create index if not exists recurrence_exceptions_series_idx on public.recurrence_exceptions(series_id);
create index if not exists recurrence_exceptions_materialized_idx on public.recurrence_exceptions(materialized_id) where materialized_id is not null;

-- updated_at trigger
create or replace function public.update_recurrence_series_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recurrence_series_updated_at_trigger on public.recurrence_series;
create trigger recurrence_series_updated_at_trigger
  before update on public.recurrence_series
  for each row execute function public.update_recurrence_series_updated_at();

-- RLS — Team Access membership semantics (owner and member both manage).
alter table public.recurrence_series enable row level security;
alter table public.recurrence_exceptions enable row level security;

create policy "recurrence_series_select_member" on public.recurrence_series
  for select using (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );
create policy "recurrence_series_insert_member" on public.recurrence_series
  for insert with check (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );
create policy "recurrence_series_update_member" on public.recurrence_series
  for update using (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  ) with check (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );
create policy "recurrence_series_delete_member" on public.recurrence_series
  for delete using (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );

create policy "recurrence_exceptions_select_member" on public.recurrence_exceptions
  for select using (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );
create policy "recurrence_exceptions_insert_member" on public.recurrence_exceptions
  for insert with check (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );
create policy "recurrence_exceptions_update_member" on public.recurrence_exceptions
  for update using (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  ) with check (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );
create policy "recurrence_exceptions_delete_member" on public.recurrence_exceptions
  for delete using (
    business_id in (select business_id from public.business_memberships where user_id = auth.uid())
  );

-- Realtime: series/exception changes flow to other signed-in members.
alter publication supabase_realtime add table public.recurrence_series;
alter publication supabase_realtime add table public.recurrence_exceptions;
