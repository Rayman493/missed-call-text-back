#!/usr/bin/env bash
# =============================================================================
# 04-seed-qa-history.sh — QA-ONLY migration-history seed
#
# Marks every LOCAL repo migration version (plus prod-recorded versions when a
# prod history export exists) as applied on the QA database, so `supabase db
# push` has nothing pending and the 149 historical files NEVER replay.
#
# This is the replacement for prod-derived seeding when production has no
# supabase_migrations.schema_migrations (verified: absent). It fabricates
# rows ONLY for the QA database — it must NEVER run against production:
# the rows describe local files, not anything prod recorded.
#
# Safety:
#   * Refuses to run (generate or apply) while the worktree is linked to prod.
#   * Rejects migration manifests containing QA-only artifacts.
#   * Emits DDL matching the installed Supabase CLI exactly
#     (supabase_migrations.schema_migrations: version PK, statements, name).
#   * --apply additionally requires QA_DB_URL referencing the QA project.
#
# Usage:
#   ./scripts/qa/04-seed-qa-history.sh            # generate qa-baseline/seed_qa_history.sql
#   QA_DB_URL=... ./scripts/qa/04-seed-qa-history.sh --apply   # generate + apply to QA
# =============================================================================
set -euo pipefail

QA_REF_EXPECTED="${QA_REF_EXPECTED:-ixtifohdqhtvhhessgaj}"
PROD_REF_EXPECTED="${PROD_REF_EXPECTED:-bqummccorpfihatocffl}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"
EXP="${EXPORT_DIR:-qa-baseline/exports}"
SEED_OUT="${SEED_OUT:-qa-baseline/seed_qa_history.sql}"
PROJECT_REF_FILE="${PROJECT_REF_FILE:-supabase/.temp/project-ref}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

# --- Guard A: never operate while linked to production ------------------------
if [ -f "$PROJECT_REF_FILE" ]; then
  LINKED=$(tr -d '[:space:]' < "$PROJECT_REF_FILE")
  if [ "$LINKED" = "$PROD_REF_EXPECTED" ]; then
    echo "ABORT: worktree is linked to PRODUCTION ($PROD_REF_EXPECTED)." >&2
    echo "This seed fabricates QA history rows — it must never touch prod." >&2
    exit 1
  fi
  if [ "$LINKED" != "$QA_REF_EXPECTED" ]; then
    echo "ABORT: linked project '$LINKED' is neither the QA project" >&2
    echo "($QA_REF_EXPECTED) nor recognised. Refusing." >&2
    exit 1
  fi
else
  echo "NOTE: no $PROJECT_REF_FILE — proceeding (generation is offline-safe);"
  echo "      --apply will still require the QA-linked ref."
fi

# --- Guard B: manifest must pass the shared artifact check -------------------
node scripts/check-migration-artifacts.mjs "$MIGRATIONS_DIR" >/dev/null \
  || { echo "ABORT: $MIGRATIONS_DIR contains QA-only/invalid artifacts." >&2; exit 1; }

# --- Manifest enumeration + duplicate-version report -------------------------
declare -A V2FILE=()
DUPLICATES=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  base=$(basename "$f")
  if [[ "$base" =~ ^([0-9]{8,14})_ ]]; then
    v="${BASH_REMATCH[1]}"
    if [ -n "${V2FILE[$v]:-}" ]; then
      echo "  warn: duplicate version $v — ${V2FILE[$v]} and $base share it"
      DUPLICATES=$((DUPLICATES+1))
    fi
    V2FILE[$v]="$base"
  fi
done
TOTAL=${#V2FILE[@]}
[ "$TOTAL" -eq 0 ] && { echo "ABORT: no timestamped migrations in $MIGRATIONS_DIR." >&2; exit 1; }
echo "==> Local manifest: $TOTAL distinct versions ($DUPLICATES duplicate-version groups)."

# --- Optional: union with prod-recorded versions (present-history exports) ---
PROD_VERSIONS=0
if [ -f "$EXP/prod_history_status.txt" ] \
   && [ "$(tr -d '[:space:]' < "$EXP/prod_history_status.txt")" = "present" ]; then
  while IFS= read -r v; do
    if [ -z "${V2FILE[$v]:-}" ]; then V2FILE[$v]="prod-recorded"; PROD_VERSIONS=$((PROD_VERSIONS+1)); fi
  done < <(grep -oE "VALUES \('[0-9]{8,14}'" "$EXP/prod_migration_history.sql" \
           | grep -oE "[0-9]{8,14}")
  echo "==> Prod export present: +$PROD_VERSIONS prod-recorded versions merged."
fi

# --- Emit the seed ------------------------------------------------------------
mkdir -p "$(dirname "$SEED_OUT")"
{
  echo "-- QA-ONLY — seeds the QA database's schema_migrations so every version"
  echo "-- represented by the prod-schema baseline is recorded as applied."
  echo "-- NEVER run on production: these rows describe local repo files, not"
  echo "-- anything production recorded. Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)."
  echo "-- DDL matches Supabase CLI (v2.x) exactly: version PK, statements, name."
  echo "create schema if not exists supabase_migrations;"
  echo "create table if not exists supabase_migrations.schema_migrations("
  echo "  version text not null primary key);"
  echo "alter table supabase_migrations.schema_migrations"
  echo "  add column if not exists statements text[];"
  echo "alter table supabase_migrations.schema_migrations"
  echo "  add column if not exists name text;"
  for v in $(printf '%s\n' "${!V2FILE[@]}" | sort); do
    name="${V2FILE[$v]%.sql}"
    name="${name//\'/\'\'}"   # SQL-escape single quotes
    echo "insert into supabase_migrations.schema_migrations(version, name, statements)"
    echo "  values ('$v', '$name', NULL) ON CONFLICT (version) DO NOTHING;"
  done
} > "$SEED_OUT"
echo "DONE — seed written to $SEED_OUT ($(grep -c '^insert into' "$SEED_OUT") versions)."

# --- Optional apply (QA only) -------------------------------------------------
if [ "$APPLY" -eq 1 ]; then
  [ -f "$PROJECT_REF_FILE" ] \
    && [ "$(tr -d '[:space:]' < "$PROJECT_REF_FILE")" = "$QA_REF_EXPECTED" ] \
    || { echo "ABORT: --apply requires the worktree linked to QA ($QA_REF_EXPECTED)." >&2; exit 1; }
  [ -z "${QA_DB_URL:-}" ] && { echo "ABORT: set QA_DB_URL for --apply." >&2; exit 1; }
  case "$QA_DB_URL" in
    *"$QA_REF_EXPECTED"*|*pooler*) ;;
    *) echo "ABORT: QA_DB_URL does not reference the QA project." >&2; exit 1 ;;
  esac
  echo "==> Applying seed to QA database..."
  psql "$QA_DB_URL" -v ON_ERROR_STOP=1 -f "$SEED_OUT"
  echo "Applied. 'supabase db push' / 'migration list' now sees all local versions as applied."
fi
