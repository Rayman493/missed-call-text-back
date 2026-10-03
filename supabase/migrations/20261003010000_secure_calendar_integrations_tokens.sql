-- Secure calendar_integrations OAuth tokens
--
-- Problem: business members could SELECT access_token/refresh_token directly
-- via PostgREST under the membership-based RLS policies, and could also
-- insert/update/delete integration rows (owner-only management authority).
--
-- Fix:
-- 1) Column-level grants: the PostgREST `authenticated` role loses table-level
--    SELECT and regains SELECT only on non-token columns (plus calendar_email
--    when present). Members (and owners) can still read connection state
--    (id/provider/scope/expires_at/calendar_email/timestamps) but
--    access_token/refresh_token can no longer be read through PostgREST by
--    any user JWT. The service_role role is untouched — all token access is
--    server-side (api/google/calendar/*, api/jobs, lib/google/token).
-- 2) RLS write policies become owner-only: members cannot create, update, or
--    delete integration rows via PostgREST. Member day-to-day calendar usage
--    is unaffected (all sync writes go through the service role already).

-- ---- 1) Column-level token protection ----------------------------------------

revoke select on public.calendar_integrations from authenticated;

grant select (
  id,
  business_id,
  provider,
  token_type,
  expires_at,
  scope,
  created_at,
  updated_at
) on public.calendar_integrations to authenticated;

-- calendar_email is a non-secret display column present in production but not
-- defined in the migration chain; grant it only when the column exists so the
-- migration also applies cleanly to environments that lack it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'calendar_integrations'
      and column_name = 'calendar_email'
  ) then
    execute 'grant select (calendar_email) on public.calendar_integrations to authenticated';
  end if;
end $$;

-- ---- 2) Owner-only write policies ---------------------------------------------

drop policy if exists "Users can insert their own calendar integrations" on public.calendar_integrations;
create policy "Users can insert their own calendar integrations"
  on public.calendar_integrations
  for insert
  with check (business_id in (
    select business_id from public.business_memberships
    where user_id = auth.uid() and role = 'owner'
  ));

drop policy if exists "Users can update their own calendar integrations" on public.calendar_integrations;
create policy "Users can update their own calendar integrations"
  on public.calendar_integrations
  for update
  using (business_id in (
    select business_id from public.business_memberships
    where user_id = auth.uid() and role = 'owner'
  ))
  with check (business_id in (
    select business_id from public.business_memberships
    where user_id = auth.uid() and role = 'owner'
  ));

drop policy if exists "Users can delete their own calendar integrations" on public.calendar_integrations;
create policy "Users can delete their own calendar integrations"
  on public.calendar_integrations
  for delete
  using (business_id in (
    select business_id from public.business_memberships
    where user_id = auth.uid() and role = 'owner'
  ));

-- SELECT policy intentionally unchanged: members may still read non-token
-- connection state columns (guarded by the column grants above).
