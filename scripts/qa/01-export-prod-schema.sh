#!/usr/bin/env bash
# =============================================================================
# 01-export-prod-schema.sh — READ-ONLY production schema + migration-history export
#
# Produces the raw inputs for the QA baseline:
#   qa-baseline/exports/prod_schema_public.sql   — pg_dump --schema-only of public
#   qa-baseline/exports/prod_extensions.sql      — extension list
#   qa-baseline/exports/prod_storage_buckets.sql — storage.buckets rows (config)
#   qa-baseline/exports/prod_migration_history.sql — supabase_migrations rows,
#       or an ABSENT marker when prod has no CLI migration history
#   qa-baseline/exports/prod_history_status.txt  — 'present' | 'absent'
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

# --- Guard 3a: explicit confirmation of the production project ref ----------
# The operator must deliberately restate the target; a wrong or absent value
# aborts before any network connection is attempted.
if [ "${CONFIRM_PROD_REF:-}" != "$PROD_REF_EXPECTED" ]; then
  echo "ABORT: set CONFIRM_PROD_REF=$PROD_REF_EXPECTED to confirm you intend a" >&2
  echo "read-only export from PRODUCTION. Mismatched or unset — refusing." >&2
  exit 1
fi

# --- Guard 3b: connection string required, must reference the prod project ---
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

# --- Guard 3c: the connection must authenticate as qa_schema_reader ----------
# Extract the userinfo user from the URL (postgresql://user[:pw]@host/…).
DB_USER=$(printf '%s' "$PROD_DB_URL" | sed -E 's|^[^:]+://([^:@]+)(:[^@]*)?@.*|\1|')
case "$DB_USER" in
  qa_schema_reader|qa_schema_reader.*) ;;
  *) echo "ABORT: PROD_DB_URL user is '$DB_USER' — must be the restricted" >&2
     echo "qa_schema_reader role, never the database administrator." >&2; exit 1 ;;
esac

if [ "${1:-}" = "--check-only" ]; then
  echo "CHECK-ONLY: all pre-flight guards passed (user=$DB_USER, ref confirmed)."
  exit 0
fi

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

# --- Guard 4: verify server-side identity + privileges before dumping --------
IDENT=$(sqlp "$PROD_DB_URL" -Atc \
  "select current_user, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication \
     from pg_roles where rolname = current_user" 2>/dev/null || echo "FAILED")
[ "$IDENT" = "FAILED" ] && { echo "ABORT: could not verify connection identity." >&2; exit 1; }
ROLE_USER=$(printf '%s' "$IDENT" | cut -d'|' -f1)
PRIVS=$(printf '%s' "$IDENT" | cut -d'|' -f2-)
if [ "${ROLE_USER#qa_schema_reader}" = "$ROLE_USER" ]; then
  echo "ABORT: connected as '$ROLE_USER' — not qa_schema_reader." >&2; exit 1
fi
if printf '%s' "$PRIVS" | grep -q 't'; then
  echo "ABORT: role holds elevated privileges ($PRIVS) — refusing." >&2; exit 1
fi
READONLY=$(sqlp "$PROD_DB_URL" -Atqc "show transaction_read_only" 2>/dev/null || echo "unknown")
echo "verified: current_user=$ROLE_USER superuser=f bypassrls=f createdb=f read_only=$READONLY"

echo "==> Exporting public schema (DDL only)..."
pgd "$PROD_DB_URL" \
  --schema-only \
  --schema=public \
  --no-owner --no-privileges --no-security-labels \
  --no-publications --no-subscriptions \
> "$OUT_DIR/prod_schema_public.sql"
# NOTE: --no-publications omitted if you want supabase_realtime membership;
# see 02-build-baseline.sh which re-adds publication config explicitly.

# A dump that silently produced zero DDL would masquerade as success.
if ! grep -qE "^CREATE TABLE " "$OUT_DIR/prod_schema_public.sql"; then
  echo "ABORT: schema export contains no CREATE TABLE — looks empty or partial." >&2
  echo "Refusing to record a falsely-successful export. Removing artifacts." >&2
  rm -f "$OUT_DIR"/*.sql "$OUT_DIR"/*.txt
  exit 1
fi

echo "==> Exporting extension list..."
sqlp "$PROD_DB_URL" -Atc \
  "select 'create extension if not exists \"' || extname || '\";' \
     from pg_extension where extname not in ('plpgsql') order by 1" \
  > "$OUT_DIR/prod_extensions.sql"

echo "==> Exporting storage.buckets (bucket configuration rows only)..."
pgd "$PROD_DB_URL" \
  --data-only --table=storage.buckets --column-inserts \
  --no-owner --no-privileges \
> "$OUT_DIR/prod_storage_buckets.sql" 2>/dev/null \
  || echo "-- storage schema not accessible with this role" > "$OUT_DIR/prod_storage_buckets.sql"

echo "==> Checking whether prod has supabase_migrations.schema_migrations..."
# Verified finding: production may have NO CLI migration history at all
# (schema built manually via SQL editor). Detect first — never assume.
HISTORY_REGCLASS=$(sqlp "$PROD_DB_URL" -Atc \
  "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'')" \
  2>/dev/null || echo "QUERY_FAILED")
if [ "$HISTORY_REGCLASS" = "QUERY_FAILED" ]; then
  echo "ABORT: could not determine migration-history presence — connection" >&2
  echo "or role problem. Not continuing on ambiguous state." >&2
  exit 1
fi

if [ -z "$HISTORY_REGCLASS" ]; then
  echo "    -> ABSENT: prod has no supabase_migrations schema/table."
  echo "       Recording status; QA history seeding falls back to the local manifest (04)."
  printf -- "-- ABSENT — production has no supabase_migrations.schema_migrations.\n-- Verified %s as %s via to_regclass(). Do NOT fabricate prod history.\n" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ROLE_USER" > "$OUT_DIR/prod_migration_history.sql"
  echo "absent" > "$OUT_DIR/prod_history_status.txt"
else
  echo "    -> present ($HISTORY_REGCLASS); exporting rows..."
  pgd "$PROD_DB_URL" \
    --data-only --table=supabase_migrations.schema_migrations --column-inserts \
    --no-owner --no-privileges \
  > "$OUT_DIR/prod_migration_history.sql"
  ROWS=$(grep -cE "^INSERT INTO" "$OUT_DIR/prod_migration_history.sql" || true)
  if [ "$ROWS" -eq 0 ]; then
    echo "ABORT: schema_migrations exists but exported 0 rows — a present-but-" >&2
    echo "empty history would falsely reconcile. Refusing partial export." >&2
    rm -f "$OUT_DIR/prod_migration_history.sql" "$OUT_DIR/prod_history_status.txt"
    exit 1
  fi
  echo "present" > "$OUT_DIR/prod_history_status.txt"
  echo "    -> $ROWS migration versions recorded on prod."
fi

echo "==> Exporting publication membership (realtime)..."
sqlp "$PROD_DB_URL" -Atc \
  "select 'alter publication ' || p.pubname || ' add table ' || c.relname || ';' \
     from pg_publication p join pg_publication_rel r on r.prpubid=p.oid \
     join pg_class c on c.oid=r.prrelid join pg_namespace n on n.oid=c.relnamespace \
    where n.nspname='public' order by 1" \
  > "$OUT_DIR/prod_publications.sql" || true

# --- Post-dump verification: schema export must contain zero row data --------
if grep -nE "^COPY |^INSERT INTO (public|auth)\." "$OUT_DIR/prod_schema_public.sql"; then
  echo "ABORT: schema export contains row data — refusing to keep artifacts." >&2
  rm -f "$OUT_DIR"/*.sql
  exit 1
fi
echo "DONE. Exports written to $OUT_DIR/ (gitignored)."
echo "Next: run ./scripts/qa/02-build-baseline.sh"
