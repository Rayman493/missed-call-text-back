-- Meeting records metadata table (ReplyFlow-private)
-- DO NOT APPLY TO PRODUCTION AUTOMATICALLY

begin;

create table if not exists public.meeting_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  google_calendar_event_id text not null,
  lead_id uuid null references public.leads(id) on delete set null,
  job_id uuid null references public.jobs(id) on delete set null,
  status text not null check (status in ('upcoming','completed')) default 'upcoming',
  completed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_meeting_records_business_event
  on public.meeting_records (business_id, google_calendar_event_id);

-- Helpful index for business scoping
create index if not exists idx_meeting_records_business_updated_at
  on public.meeting_records (business_id, updated_at desc);

-- Trigger to keep updated_at fresh
create or replace function public.meeting_records_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_meeting_records_updated_at on public.meeting_records;
create trigger trg_meeting_records_updated_at
before update on public.meeting_records
for each row execute function public.meeting_records_set_updated_at();

-- Enable RLS
alter table public.meeting_records enable row level security;

-- RLS: allow business owner to select/insert/update
drop policy if exists meeting_records_select_policy on public.meeting_records;
create policy meeting_records_select_policy
on public.meeting_records
for select
using (
  exists (
    select 1 from public.businesses b
    where b.id = meeting_records.business_id
      and b.user_id = auth.uid()
  )
);

drop policy if exists meeting_records_insert_policy on public.meeting_records;
create policy meeting_records_insert_policy
on public.meeting_records
for insert
with check (
  exists (
    select 1 from public.businesses b
    where b.id = meeting_records.business_id
      and b.user_id = auth.uid()
  )
);

drop policy if exists meeting_records_update_policy on public.meeting_records;
create policy meeting_records_update_policy
on public.meeting_records
for update
using (
  exists (
    select 1 from public.businesses b
    where b.id = meeting_records.business_id
      and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = meeting_records.business_id
      and b.user_id = auth.uid()
  )
);

commit;
