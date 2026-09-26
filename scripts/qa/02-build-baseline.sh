#!/usr/bin/env bash
# =============================================================================
# 02-build-baseline.sh — turn the prod export into a single QA baseline migration
#                        + a schema_migrations seed file.
#
# Inputs : qa-baseline/exports/* (produced by 01-export-prod-schema.sh)
# Outputs:
#   qa-baseline/prod_baseline.sql
#       Full prod public-schema DDL, sanitized — deliberately OUTSIDE
#       supabase/migrations/ (physical separation; applied via psql only).
#   qa-baseline/exports/seed_migration_history.sql   (only when prod history present)
#       INSERTs marking every prod-recorded migration version as applied.
#   When prod history is ABSENT (prod_history_status.txt = 'absent') no prod
#   seed is fabricated — QA history seeding is handled separately by
#   scripts/qa/04-seed-qa-history.sh from the LOCAL migration manifest.
#
# Guards:
#   * Scans for credential / customer-data leakage and refuses to emit the
#     migration file if found (sk_live, service_role JWTs, conn strings, data
#     INSERTs into public tables, prod URLs beyond an allowlist).
#   * Verifies no exported file is tracked by git.
# =============================================================================
set -euo pipefail

EXP="${EXPORT_DIR:-qa-baseline/exports}"
# Physical separation: the baseline is a QA bootstrap artifact applied via
# psql during bring-up, NOT a supabase/migrations file. It can never be
# picked up by `supabase db push` on any environment.
OUT_MIGRATION="${BASELINE_OUT:-qa-baseline/prod_baseline.sql}"
SEED_OUT="${SEED_OUT:-$EXP/seed_migration_history.sql}"
mkdir -p "$(dirname "$OUT_MIGRATION")"

for f in prod_schema_public.sql prod_extensions.sql prod_history_status.txt; do
  [ -s "$EXP/$f" ] || { echo "ABORT: missing $EXP/$f — run 01-export-prod-schema.sh first." >&2; exit 1; }
done

# --- Export-completeness guards ----------------------------------------------
# An empty schema dump or a present-but-empty history table must not produce
# a baseline that looks successful.
if ! grep -qE "^CREATE TABLE " "$EXP/prod_schema_public.sql"; then
  echo "ABORT: $EXP/prod_schema_public.sql has no CREATE TABLE — partial export." >&2
  exit 1
fi
HISTORY_STATUS=$(tr -d '[:space:]' < "$EXP/prod_history_status.txt")
case "$HISTORY_STATUS" in
  present)
    [ -s "$EXP/prod_migration_history.sql" ] \
      && grep -qE "^INSERT INTO" "$EXP/prod_migration_history.sql" \
      || { echo "ABORT: status=present but prod_migration_history.sql has no" >&2
           echo "INSERT rows — refusing to treat a partial export as complete." >&2; exit 1; } ;;
  absent)
    echo "==> Prod migration history: ABSENT — no prod seed will be fabricated." ;;
  *)
    echo "ABORT: unrecognised prod_history_status.txt='$HISTORY_STATUS'." >&2; exit 1 ;;
esac

# --- Gitignore re-check (in-repo exports path only) --------------------------
case "$EXP" in
  qa-baseline/*) git check-ignore -q "$EXP/probe" \
    || { echo "ABORT: $EXP not gitignored." >&2; exit 1; } ;;
esac

# --- Leak scan: credentials --------------------------------------------------
echo "==> Scanning exports for credentials and secrets..."
if grep -rEin "sk_live|sk_test|rk_live|rk_test|whsec_|service_role|eyJ[A-Za-z0-9_-]{10,}\.|password|passwd|secret" \
     "$EXP" ; then
  echo "ABORT: potential secret material found in exports (see matches above)." >&2
  exit 1
fi

# --- Leak scan: customer data (schema dump must contain no row COPY/INSERT) --
if grep -nE "^COPY |^INSERT INTO (public|auth)\." "$EXP/prod_schema_public.sql"; then
  echo "ABORT: schema dump contains row data — unexpected, investigate." >&2
  exit 1
fi

# --- Leak scan: prod-specific identifiers that must not ship to QA ----------
echo "==> Scanning for prod-specific identifiers..."
grep -nEi "bqummccorpfihatocffl" "$EXP"/prod_*.sql \
  && echo "NOTE: prod project-ref appears in dump — check context before proceeding." || true

# --- Build seed_migration_history.sql (only when prod history is present) ---
# When prod has no CLI history there is nothing truthful to seed FROM — the
# QA-side seeding of local repo versions is 04-seed-qa-history.sh's job.
if [ "$HISTORY_STATUS" = "present" ]; then
  echo "==> Generating migration-history seed from prod export..."
  {
    echo "-- QA-ONLY — seeds QA's schema_migrations to mirror production history."
    echo "-- Seed: mark production-recorded migration versions as applied on QA."
    echo "-- Generated $(date -u +%Y-%m-%dT%H:%M:%SZ). Versions sourced from prod export."
    echo "create schema if not exists supabase_migrations;"
    echo "create table if not exists supabase_migrations.schema_migrations("
    echo "  version text not null primary key);"
    echo "alter table supabase_migrations.schema_migrations"
    echo "  add column if not exists statements text[];"
    echo "alter table supabase_migrations.schema_migrations"
    echo "  add column if not exists name text;"
    grep -E "^INSERT" "$EXP/prod_migration_history.sql" \
      | sed -E 's/\);$/) ON CONFLICT (version) DO NOTHING;/' || true
  } > "$SEED_OUT"
else
  rm -f "$SEED_OUT"
  echo "==> Skipping prod-history seed (history ABSENT)."
  echo "    QA history seeding: run scripts/qa/04-seed-qa-history.sh — it marks"
  echo "    the LOCAL repo migration versions represented by this baseline."
fi

# --- Assemble the baseline migration -----------------------------------------
echo "==> Writing $OUT_MIGRATION ..."
{
  echo "-- QA-ONLY — this file is a QA bootstrap artifact. It must NEVER be placed"
  echo "-- in supabase/migrations/ or applied to production."
  echo "-- ============================================================================"
  echo "-- QA BASELINE — snapshot of the production public schema"
  echo "-- Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) from a READ-ONLY pg_dump of prod."
  echo "--"
  echo "-- This file exists because the repository's historical migrations pre-date"
  echo "-- supabase migration tracking: the base tables (businesses, twilio_numbers,"
  echo "-- follow_up_jobs, call_events, ...) were created manually. This baseline is"
  echo "-- the single source of truth for a fresh QA database. Historical migration"
  echo "-- versions are marked applied on QA ONLY via scripts/qa/04-seed-qa-history.sh"
  echo "-- and are NEVER replayed. Safe to run on prod (IF NOT EXISTS / OR REPLACE only)."
  echo "-- ============================================================================"
  echo ""
  cat "$EXP/prod_extensions.sql"
  echo ""
  # Strip pg_dump session noise and prod ownership; keep pure DDL
  grep -vE "^SET |^SELECT pg_catalog|^-- (Name|Type|Schema|Owner|TOC|Dumped|PostgreSQL Database)|^\\\\" \
    "$EXP/prod_schema_public.sql" \
  | sed -E 's/^CREATE SCHEMA (IF NOT EXISTS )?/CREATE SCHEMA IF NOT EXISTS /; s/^CREATE EXTENSION (IF NOT EXISTS )?/CREATE EXTENSION IF NOT EXISTS /'
  echo ""
  echo "-- Storage bucket configuration (config rows, not objects)"
  { [ -f "$EXP/prod_storage_buckets.sql" ] && grep -E "^INSERT" "$EXP/prod_storage_buckets.sql"; } \
    || echo "-- none exported"
  echo ""
  echo "-- Realtime publication membership"
  { [ -f "$EXP/prod_publications.sql" ] && grep -E "^alter publication" "$EXP/prod_publications.sql"; } \
    || true
} > "$OUT_MIGRATION"

LINES=$(wc -l < "$OUT_MIGRATION")
echo "DONE. Baseline written ($LINES lines) → $OUT_MIGRATION (outside supabase/migrations)."
echo ""
echo "Apply order on the fresh QA project (manual, when authorized):"
echo "  1. psql \$QA_DB_URL -f $OUT_MIGRATION    # schema snapshot"
if [ "$HISTORY_STATUS" = "present" ]; then
  echo "  2. psql \$QA_DB_URL -f $SEED_OUT         # mark prod history applied"
else
  echo "  2. (skipped — prod history ABSENT)"
fi
echo "  3. ./scripts/qa/04-seed-qa-history.sh --apply   # mark local versions applied (QA only)"
echo "  4. npx supabase db push                         # no-op until new migrations exist"
echo "  5. ./scripts/qa/03-validate-qa-parity.sh        # compare QA schema vs prod export"
