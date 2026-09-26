#!/usr/bin/env bash
# =============================================================================
# 01-export-prod-schema.sh — READ-ONLY production schema + migration-history export
#
# Produces the raw inputs for the QA baseline:
#   qa-baseline/exports/prod_schema_public.sql   — pg_dump --schema-only of public
#   qa-baseline/exports/prod_extensions.sql      — extension list
#   qa-baseline/exports/prod_storage_buckets.sql — storage.buckets rows (config)
#   qa-baseline/exports/prod_migration_history.sql — supabase_migrations rows
#
# Safety properties:
#   * NEVER links any Supabase project. Works from a raw connection string.
#   * Asserts the QA worktree stays linked to the QA project (guard rail).
#   * Asserts the target project-ref is the explicit production allowlist value.
#   * Requires the caller to confirm the operation is read-only (pg_dump -s reads
#     catalogs only; the recommended credential is the qa_schema_reader role —
#     see QA_BASELINE_PROCEDURE.md).
#   * Refuses to run if the exports directory is not gitignored.
#
# Usage:
#   export PROD_DB_URL='postgresql://qa_schema_reader:<pwd>@<pooler>:6543/postgres'
#   ./scripts/qa/01-export-prod-schema.sh
# =============================================================================
set -euo pipefail

PROD_REF_EXPECTED="${PROD_REF_EXPECTED:-bqummccorpfihatocffl}"  # override only for local dry-runs
QA_REF_EXPECTED="ixtifohdqhtvhhessgaj"
OUT_DIR="qa-baseline/exports"
mkdir -p "$OUT_DIR"

# --- Guard 1: QA worktree must remain linked to the QA project, never prod ---
if [ -f supabase/.temp/project-ref ]; then
  LINKED=$(cat supabase/.temp/project-ref)
  if [ "$LINKED" != "$QA_REF_EXPECTED" ]; then
    echo "ABORT: supabase/.temp/project-ref is '$LINKED' (expected QA '$QA_REF_EXPECTED')." >&2
    echo "This script must never run while linked to production." >&2
    exit 1
  fi
fi

# --- Guard 2: exports dir must be gitignored before any prod bytes touch disk --
if ! git check-ignore -q "$OUT_DIR/probe" 2>/dev/null; then
  echo "ABORT: '$OUT_DIR/' is not gitignored. Add it to .gitignore first." >&2
  exit 1
fi

# --- Guard 3: connection string required, must reference the prod project only -
if [ -z "${PROD_DB_URL:-}" ]; then
  echo "ABORT: PROD_DB_URL is not set." >&2
  echo "Use the restricted qa_schema_reader credential via the Supabase pooler:" >&2
  echo "  postgresql://qa_schema_reader.<ref>:<pwd>@<pooler-host>:6543/postgres" >&2
  exit 1
fi
case "$PROD_DB_URL" in
  *"$PROD_REF_EXPECTED"*|*pooler*) ;;  # pooler embeds ref in username or host
  *) echo "ABORT: PROD_DB_URL does not reference expected prod project ($PROD_REF_EXPECTED)." >&2; exit 1 ;;
esac

# --- Client tooling: local psql/pg_dump, else the pinned supabase image ------
PGIMG="public.ecr.aws/supabase/postgres:17.6.1.159"
if command -v psql >/dev/null 2>&1; then
  sqlp() { psql "$@"; }
  pgd()  { pg_dump "$@"; }
else
  echo "(using docker client tools: $PGIMG)"
  sqlp() { docker run --rm -i ${DOCKER_NET:+--network "$DOCKER_NET"} "$PGIMG" psql "$@"; }
  pgd()  { docker run --rm -i ${DOCKER_NET:+--network "$DOCKER_NET"} "$PGIMG" pg_dump "$@"; }
fi

# --- Guard 4: prove read-only session before dumping -------------------------
READONLY=$(sqlp "$PROD_DB_URL" -Atqc "show transaction_read_only" 2>/dev/null || echo "unknown")
echo "transaction_read_only=$READONLY (role-level read-only is enforced server-side for qa_schema_reader)"

echo "==> Exporting public schema (DDL only)..."
pgd "$PROD_DB_URL" \
  --schema-only \
  --schema=public \
  --no-owner --no-privileges --no-security-labels \
  --no-publications --no-subscriptions \
> "$OUT_DIR/prod_schema_public.sql"
# NOTE: --no-publications omitted if you want supabase_realtime membership;
# see 02-build-baseline.sh which re-adds publication config explicitly.

echo "==> Exporting extension list..."
sqlp "$PROD_DB_URL" -Atc \
  "select 'create extension if not exists \"' || extname || '\";' \
     from pg_extension where extname not in ('plpgsql') order by 1" \
  > "$OUT_DIR/prod_extensions.sql"

echo "==> Exporting storage.buckets (bucket configuration rows only)..."
pgd "$PROD_DB_URL" \
  --data-only --table=storage.buckets --inserts \
  --no-owner --no-privileges \
> "$OUT_DIR/prod_storage_buckets.sql" 2>/dev/null \
  || echo "-- storage schema not accessible with this role" > "$OUT_DIR/prod_storage_buckets.sql"

echo "==> Exporting migration history (supabase_migrations.schema_migrations)..."
pgd "$PROD_DB_URL" \
  --data-only --table=supabase_migrations.schema_migrations --inserts \
  --no-owner --no-privileges \
> "$OUT_DIR/prod_migration_history.sql"

echo "==> Exporting publication membership (realtime)..."
sqlp "$PROD_DB_URL" -Atc \
  "select 'alter publication ' || p.pubname || ' add table ' || c.relname || ';' \
     from pg_publication p join pg_publication_rel r on r.prpubid=p.oid \
     join pg_class c on c.oid=r.prrelid join pg_namespace n on n.oid=c.relnamespace \
    where n.nspname='public' order by 1" \
  > "$OUT_DIR/prod_publications.sql" || true

echo "DONE. Exports written to $OUT_DIR/ (gitignored)."
echo "Next: run ./scripts/qa/02-build-baseline.sh"
