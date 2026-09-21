-- ============================================================================
-- Team Permissions — storage prep ONLY (zero launch behavior change)
--
-- Adds business_memberships.permissions (jsonb, nullable, no default) for
-- FUTURE sparse per-member permission overrides.
--
-- Semantics:
--   NULL (all existing + all new rows) → role defaults; identical access.
--   Sparse object → future per-key overrides, evaluated in application code.
--
-- Nothing reads or enforces this column yet: no RLS change, no trigger,
-- no backfill, no NOT NULL. Existing rows and all current access paths are
-- unaffected. See TEAM_PERMISSIONS_POST_LAUNCH_ARCHITECTURE.md.
-- ============================================================================

alter table public.business_memberships
  add column if not exists permissions jsonb;
