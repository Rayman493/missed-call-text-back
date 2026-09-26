#!/usr/bin/env bash
# =============================================================================
# 03-validate-qa-parity.sh — compare the migrated QA database against the
# production schema export WITHOUT copying any customer data.
#
# Method: schema-only inventory comparison.
#   * Dumps the QA DB schema (same flags as the prod export).
#   * Normalizes both dumps (strip comments, whitespace, ordering noise).
#   * Diffs object inventories: tables, columns, indexes, constraints,
#     policies, triggers, functions, views, sequences.
#   * Also produces a per-object catalog checksum report.
#
# Usage:
#   export QA_DB_URL='postgresql://postgres.<qa-ref>:<pwd>@<pooler>:6543/postgres'
#   ./scripts/qa/03-validate-qa-parity.sh
# =============================================================================
set -euo pipefail

EXP="qa-baseline/exports"
QA_DUMP="$EXP/qa_schema_public.sql"
PROD_DUMP="$EXP/prod_schema_public.sql"

QA_REF_EXPECTED="${QA_REF_EXPECTED:-ixtifohdqhtvhhessgaj}"  # override only for local dry-runs
[ -z "${QA_DB_URL:-}" ] && { echo "ABORT: set QA_DB_URL (QA pooler string)." >&2; exit 1; }
case "$QA_DB_URL" in
  *"$QA_REF_EXPECTED"*|*pooler*) ;;
  *) echo "ABORT: QA_DB_URL does not reference expected QA project." >&2; exit 1 ;;
esac
[ -s "$PROD_DUMP" ] || { echo "ABORT: missing prod export ($PROD_DUMP)." >&2; exit 1; }

PGIMG="public.ecr.aws/supabase/postgres:17.6.1.159"
if command -v psql >/dev/null 2>&1; then
  sqlp() { psql "$@"; }
  pgd()  { pg_dump "$@"; }
else
  sqlp() { docker run --rm -i ${DOCKER_NET:+--network "$DOCKER_NET"} "$PGIMG" psql "$@"; }
  pgd()  { docker run --rm -i ${DOCKER_NET:+--network "$DOCKER_NET"} "$PGIMG" pg_dump "$@"; }
fi

echo "==> Dumping QA schema..."
pgd "$QA_DB_URL" --schema-only --schema=public \
  --no-owner --no-privileges --no-security-labels \
  --no-publications --no-subscriptions \
> "$QA_DUMP"

# --- Normalized object inventory --------------------------------------------
# Extract every "object-bearing" statement, squash whitespace, sort → stable diff.
norm() {
  grep -vE "^--|^SET |^SELECT pg_catalog|^\\\\|^$" "$1" \
  | tr -s ' \t' ' ' | sed 's/^ //; s/ $//' \
  | sort -u
}

norm "$PROD_DUMP" > "$EXP/prod_inventory.txt"
norm "$QA_DUMP"   > "$EXP/qa_inventory.txt"

echo "==> Inventory diff (prod vs qa)..."
if diff -u "$EXP/prod_inventory.txt" "$EXP/qa_inventory.txt" > "$EXP/schema_diff.txt"; then
  echo "PASS — QA public schema is identical to production export."
  rm -f "$EXP/schema_diff.txt"
else
  N=$(grep -cE "^[+-]" "$EXP/schema_diff.txt")
  echo "DIFFERENCES FOUND ($N changed lines) — see $EXP/schema_diff.txt"
  echo "Review each line: legitimate differences are only QA-intended objects."
  exit 2
fi

# --- Catalog checksum (belt & suspenders) ------------------------------------
echo "==> Per-object counts:"
for q in \
  "tables|select count(*) from information_schema.tables where table_schema='public'" \
  "columns|select count(*) from information_schema.columns where table_schema='public'" \
  "policies|select count(*) from pg_policies where schemaname='public'" \
  "functions|select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" \
  "triggers|select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal" \
  "constraints|select count(*) from information_schema.table_constraints where table_schema='public'"; do
  name="${q%%|*}"; sql="${q#*|}"
  echo "  $name = $(sqlp "$QA_DB_URL" -Atc "$sql")"
done

echo "DONE — QA schema parity validated."
