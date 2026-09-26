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
# Usage (endpoint from the prod project's Connect panel — see procedure doc):
#   export PROD_DB_URL='postgresql://qa_schema_reader:<pwd>@db.<ref>.supabase.co:5432/postgres'
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

# --- Guard 3b: connection string required ------------------------------------
if [ -z "${PROD_DB_URL:-}" ]; then
  echo "ABORT: PROD_DB_URL is not set." >&2
  echo "Use the restricted qa_schema_reader credential. Endpoint hostnames come" >&2
  echo "from the prod project's Connect panel (Dashboard → Connect):" >&2
  echo "  direct:  postgresql://qa_schema_reader:<pwd>@db.<ref>.supabase.co:5432/postgres" >&2
  echo "  session: postgresql://qa_schema_reader.<ref>:<pwd>@aws-<n>-<region>.pooler.supabase.com:5432/postgres" >&2
  exit 1
fi

# --- Guard 3c: strict URL parsing + approved endpoints -----------------------
# Accepted forms ONLY (port 5432 always — the 6543 transaction pooler is
# rejected: transaction-mode pooling doesn't preserve the session semantics
# this script's verification relies on):
#   direct:  postgresql://qa_schema_reader:<pwd>@db.<prod-ref>.supabase.co[:5432]/postgres
#   session: postgresql://qa_schema_reader.<prod-ref>:<pwd>@*.pooler.supabase.com[:5432]/postgres
# Never echo the URL or credentials — only the violation class.
URL_BODY="${PROD_DB_URL#postgresql://}"
if [ "$URL_BODY" = "$PROD_DB_URL" ]; then
  URL_BODY="${PROD_DB_URL#postgres://}"
fi
if [ "$URL_BODY" = "$PROD_DB_URL" ]; then
  echo "ABORT: malformed PROD_DB_URL — expected a postgresql:// connection string." >&2
  exit 1
fi
case "$URL_BODY" in
  *@*) ;;
  *) echo "ABORT: malformed PROD_DB_URL — missing userinfo (user@host)." >&2; exit 1 ;;
esac
URL_CRED="${URL_BODY%%@*}"
DB_USER="${URL_CRED%%:*}"
HOSTPORT="${URL_BODY#*@}"; HOSTPORT="${HOSTPORT%%/*}"; HOSTPORT="${HOSTPORT%%\?*}"
DB_HOST="${HOSTPORT%%:*}"
case "$HOSTPORT" in
  *:*) DB_PORT="${HOSTPORT##*:}" ;;
  *)   DB_PORT="5432" ;;
esac
DB_HOST=$(printf '%s' "$DB_HOST" | tr 'A-Z' 'a-z')

if [ -z "$DB_USER" ] || [ -z "$DB_HOST" ]; then
  echo "ABORT: malformed PROD_DB_URL — empty user or host component." >&2
  exit 1
fi
case "$DB_PORT" in
  ''|*[!0-9]*) echo "ABORT: malformed PROD_DB_URL — invalid port." >&2; exit 1 ;;
esac
if [ "$DB_PORT" = "6543" ]; then
  echo "ABORT: port 6543 is the transaction-mode pooler — rejected." >&2
  echo "Use direct port 5432, or the session pooler on port 5432." >&2
  exit 1
fi
if [ "$DB_PORT" != "5432" ]; then
  echo "ABORT: only port 5432 is approved (direct or session pooler)." >&2
  exit 1
fi

# Privileged / non-reader usernames are always rejected, whatever the host.
case "$DB_USER" in
  postgres|postgres.*|supabase_admin*|authenticator*|supabase_auth*|supabase_storage*|service_role*|anon*)
    echo "ABORT: username '$DB_USER' is not the restricted qa_schema_reader role." >&2
    exit 1 ;;
esac

DIRECT_HOST="db.${PROD_REF_EXPECTED}.supabase.co"
if [ "${RF_EXPORT_ALLOW_CUSTOM_ENDPOINT:-}" = "1" ]; then
  # Disposable-database testing seam ONLY — never for real prod exports.
  case "$DB_USER" in
    qa_schema_reader|qa_schema_reader.*) ;;
    *) echo "ABORT: custom-endpoint mode still requires a qa_schema_reader user." >&2; exit 1 ;;
  esac
  echo "WARNING: RF_EXPORT_ALLOW_CUSTOM_ENDPOINT=1 — approved-endpoint check skipped (test mode)." >&2
elif [ "$DB_HOST" = "$DIRECT_HOST" ]; then
  # Direct connection: bare role name only — pooler-qualified names are wrong here.
  if [ "$DB_USER" != "qa_schema_reader" ]; then
    echo "ABORT: direct connection requires the bare 'qa_schema_reader' username." >&2
    exit 1
  fi
  echo "endpoint: direct connection (db.<prod-ref>.supabase.co:5432)"
elif [ "${DB_HOST%.pooler.supabase.com}" != "$DB_HOST" ]; then
  # Session pooler: host ends in .pooler.supabase.com (the strip requires a
  # non-empty regional prefix, so bare pooler.supabase.com and lookalike
  # domains like pooler.supabase.com.evil.com are rejected); username must be
  # the ref-qualified reader for THIS prod project.
  if [ "$DB_USER" != "qa_schema_reader.${PROD_REF_EXPECTED}" ]; then
    echo "ABORT: session-pooler connection requires username" >&2
    echo "'qa_schema_reader.<prod-ref>' for the approved production project." >&2
    exit 1
  fi
  echo "endpoint: session pooler (*.pooler.supabase.com:5432)"
else
  echo "ABORT: unapproved endpoint — expected db.<prod-ref>.supabase.co or a" >&2
  echo "regional *.pooler.supabase.com session-pooler host on port 5432." >&2
  exit 1
fi

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
