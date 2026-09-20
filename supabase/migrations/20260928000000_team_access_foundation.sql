-- ============================================================================
-- Team Access V1 — Foundation
-- Creates business_memberships + team_invites, backfills owner memberships,
-- and installs the atomic invite-acceptance function.
--
-- This migration is ADDITIVE ONLY:
--   - businesses.user_id remains the owner-of-record compatibility field.
--   - No existing policies on data tables are changed here (see
--     20260928010000_team_access_rls_cutover.sql).
--   - Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- business_memberships
-- Authorization source of truth for "which users may access which business".
-- V1 roles: 'owner' (exactly one per business) and 'member'.
-- ----------------------------------------------------------------------------
create table if not exists public.business_memberships (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'member')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint business_memberships_business_user_key unique (business_id, user_id)
);

-- Exactly one owner membership per business
create unique index if not exists business_memberships_one_owner
  on public.business_memberships (business_id) where role = 'owner';

create index if not exists business_memberships_user_idx
  on public.business_memberships (user_id);
create index if not exists business_memberships_business_idx
  on public.business_memberships (business_id);

alter table public.business_memberships enable row level security;

-- Self-contained policy: a user can read ONLY their own membership rows.
-- IMPORTANT: this policy must never subquery businesses (which itself
-- references business_memberships after the cutover) to avoid recursion.
drop policy if exists "users can read own memberships" on public.business_memberships;
create policy "users can read own memberships"
  on public.business_memberships
  for select
  using (user_id = auth.uid());

-- No client INSERT/UPDATE/DELETE policies: all membership mutations go
-- through service-role server routes (invite accept, owner revoke, backfill).

-- ----------------------------------------------------------------------------
-- team_invites
-- Pending invitations. Plaintext tokens are NEVER stored — only sha256 hashes.
-- RLS enabled with NO policies → denied to anon/authenticated; service role only.
-- ----------------------------------------------------------------------------
create table if not exists public.team_invites (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  phone        text not null,
  token_hash   text not null unique,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by   uuid not null references auth.users(id),
  accepted_by  uuid references auth.users(id),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  cancelled_at timestamptz
);

-- One pending invite per (business, phone)
create unique index if not exists team_invites_one_pending_per_phone
  on public.team_invites (business_id, phone) where status = 'pending';

create index if not exists team_invites_business_idx
  on public.team_invites (business_id);
create index if not exists team_invites_token_hash_idx
  on public.team_invites (token_hash);

alter table public.team_invites enable row level security;
-- Intentionally no policies: service-role only.

-- ----------------------------------------------------------------------------
-- Owner backfill (idempotent)
-- Every existing business creator becomes its OWNER membership.
-- ----------------------------------------------------------------------------
insert into public.business_memberships (business_id, user_id, role)
select b.id, b.user_id, 'owner'
from public.businesses b
where b.user_id is not null
on conflict (business_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- Owner membership for NEW businesses
-- businesses.user_id remains the owner-of-record field; every new business row
-- automatically gains an 'owner' membership for that user. Covers all insert
-- paths (complete-signup, getOrCreateBusiness, seeds, admin tools).
-- ----------------------------------------------------------------------------
create or replace function public.create_owner_membership_for_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into public.business_memberships (business_id, user_id, role)
    values (new.id, new.user_id, 'owner')
    on conflict (business_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_create_owner_membership on public.businesses;
create trigger businesses_create_owner_membership
  after insert on public.businesses
  for each row
  execute function public.create_owner_membership_for_new_business();

-- ----------------------------------------------------------------------------
-- accept_team_invite(token_hash, user_id)
-- Atomic invite acceptance. Locks the invite row, validates state, creates
-- the membership, and marks the invite accepted in ONE transaction so a
-- partial state (membership without acceptance, or vice versa) is impossible.
--
-- Security definer is required: team_invites and business_memberships writes
-- have no client-facing RLS policies (service-role mediated routes only).
--
-- Returns jsonb: { ok: true, business_id, already?: true }
--             or { ok: false, reason: 'not_found'|'cancelled'|'expired'|
--               'already_accepted'|'has_business'|'already_in_business' }
-- ----------------------------------------------------------------------------
create or replace function public.accept_team_invite(p_token_hash text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites%rowtype;
begin
  select * into v_invite
    from public.team_invites
    where token_hash = p_token_hash
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_invite.status = 'accepted' then
    -- Idempotent retry: if THIS user already holds the membership, report success.
    if exists (
      select 1 from public.business_memberships
      where business_id = v_invite.business_id and user_id = p_user_id
    ) then
      return jsonb_build_object('ok', true, 'business_id', v_invite.business_id, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_accepted');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', v_invite.status);
  end if;

  if v_invite.expires_at < now() then
    update public.team_invites set status = 'expired' where id = v_invite.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- An owner of a business must not join another business as a member.
  if exists (select 1 from public.businesses where user_id = p_user_id)
     or exists (select 1 from public.business_memberships where user_id = p_user_id and role = 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'has_business');
  end if;

  -- Already a member of this business: mark invite accepted, success.
  if exists (
    select 1 from public.business_memberships
    where business_id = v_invite.business_id and user_id = p_user_id
  ) then
    update public.team_invites
      set status = 'accepted', accepted_by = p_user_id, accepted_at = now()
      where id = v_invite.id;
    return jsonb_build_object('ok', true, 'business_id', v_invite.business_id, 'already', true);
  end if;

  -- V1 invariant: one business membership per user.
  if exists (select 1 from public.business_memberships where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_in_business');
  end if;

  insert into public.business_memberships (business_id, user_id, role, invited_by)
  values (v_invite.business_id, p_user_id, 'member', v_invite.invited_by);

  update public.team_invites
    set status = 'accepted', accepted_by = p_user_id, accepted_at = now()
    where id = v_invite.id;

  return jsonb_build_object('ok', true, 'business_id', v_invite.business_id);
end;
$$;

revoke all on function public.accept_team_invite(text, uuid) from public;
revoke all on function public.accept_team_invite(text, uuid) from anon;
revoke all on function public.accept_team_invite(text, uuid) from authenticated;
grant execute on function public.accept_team_invite(text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Realtime: clients subscribe to membership DELETE events for revocation
-- detection (see BusinessContext membership-watch channel).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.business_memberships;
