-- ============================================================================
-- Team Access — Launch Safety Ceilings
-- Enforces MAX_TEAM_MEMBERS_PER_BUSINESS (100 invited members; the owner
-- row is excluded) atomically inside accept_team_invite.
--
-- Race safety: pg_advisory_xact_lock keyed on business_id serializes
-- concurrent acceptances for the same business, so two simultaneous
-- accepts at 99 members cannot both pass the count check (99 -> 101).
-- The lock is released automatically at transaction end.
--
-- ADDITIVE ONLY: replaces the function body; no schema or policy changes.
-- Idempotent: safe to re-run.
-- ============================================================================

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

  -- Member safety ceiling. Serialize per business so concurrent accepts
  -- cannot race past the cap; count 'member' rows only — the owner never
  -- consumes a team-member seat. (MAX_TEAM_MEMBERS_PER_BUSINESS = 100,
  -- mirrored in src/lib/team-access.ts.)
  perform pg_advisory_xact_lock(hashtext(v_invite.business_id::text));

  if (select count(*) from public.business_memberships
      where business_id = v_invite.business_id and role = 'member') >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'member_limit');
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
