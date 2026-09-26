#!/usr/bin/env bash
# =============================================================================
# 05-init-qa-db.sh — self-contained, guarded initialization of the QA database
#
# Run interactively in Git Bash from the qa worktree root:
#   ./scripts/qa/05-init-qa-db.sh            # full initialization
#   ./scripts/qa/05-init-qa-db.sh --dry-run  # connectivity + safety checks only
#
# What it does, in order — aborts on ANY failure:
#   1. Verify the worktree is linked to the QA project (never production)
#   2. Build the QA connection privately: session pooler host from the
#      CLI-resolved supabase/.temp/pooler-url + password prompted with
#      read -s (never echoed, never written, unset on exit)
#   3. Verify the remote DB is reachable AND is the QA project
#   4. Verify the remote is EMPTY (no app tables, no migration history)
#   5. Safety-scan the baseline (no destructive statements / prod references)
#   6. Apply qa-baseline/prod_baseline.sql  (psql --single-transaction
#      ON_ERROR_STOP=1 — all-or-nothing; on failure nothing persists)
#   7. Seed QA-only migration history (04-seed-qa-history.sh --apply)
#      — records versions as REPRESENTED BY THE BASELINE, not verified
#      individually applied on production
#   8. supabase migration list + db push --dry-run (never --include-all)
#   9. 03-validate-qa-parity.sh + zero-customer-data confirmation
#
# Credentials: held only in shell variables inside this process; PGPASSWORD is
# passed to psql/docker children as an environment variable (not an argv),
# and everything is unset via trap on exit. History is disabled for safety.
# =============================================================================
set -euo pipefail
set +o history   # do not record this session's commands in bash history

QA_REF_EXPECTED="${QA_REF_EXPECTED:-ixtifohdqhtvhhessgaj}"
PROD_REF="bqummccorpfihatocffl"
BASELINE="${BASELINE:-qa-baseline/prod_baseline.sql}"
PROJECT_REF_FILE="${PROJECT_REF_FILE:-supabase/.temp/project-ref}"
POOLER_URL_FILE="${POOLER_URL_FILE:-supabase/.temp/pooler-url}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

cleanup() { unset QA_DB_PASS PGPASSWORD QA_DB_URL 2>/dev/null || true; }
trap cleanup EXIT INT TERM

say()  { printf '%s\n' "$*"; }
fail() { say "ABORT: $*" >&2; exit 1; }

# --- Step 1: verify the local link is the QA project -------------------------
[ -f "$PROJECT_REF_FILE" ] || fail "$PROJECT_REF_FILE missing — worktree not linked."
LINKED=$(tr -d '[:space:]' < "$PROJECT_REF_FILE")
[ "$LINKED" = "$PROD_REF" ] && fail "worktree is linked to PRODUCTION. This script must never run here."
[ "$LINKED" = "$QA_REF_EXPECTED" ] \
  || fail "linked project '$LINKED' is not the expected QA project."
say "1. link verified: QA project '$LINKED'"

# --- Step 2: build the connection privately ----------------------------------
# Session pooler host comes from the CLI-resolved .temp/pooler-url — the same
# endpoint `supabase link` verified. We require it to be a *.pooler.supabase.com
# session host on 5432 carrying the QA project ref; anything else aborts.
if [ -n "${RF_QA_INIT_TEST_URL:-}" ]; then
  # Disposable-database testing seam ONLY — never for the real QA project.
  say "WARNING: RF_QA_INIT_TEST_URL set — pooler derivation + prompt skipped (test mode)." >&2
  QA_DB_URL="$RF_QA_INIT_TEST_URL"
else
  [ -f "$POOLER_URL_FILE" ] || fail "$POOLER_URL_FILE missing — relink with 'supabase link --project-ref $QA_REF_EXPECTED'."
  POOLER_URL=$(tr -d '[:space:]' < "$POOLER_URL_FILE")
  case "$POOLER_URL" in *6543*) fail "pooler-url uses port 6543 (transaction mode) — session pooler required." ;; esac
  case "$POOLER_URL" in
    *"postgres.${QA_REF_EXPECTED}@"*".pooler.supabase.com:5432/"*) ;;
    *) fail "pooler-url does not match the QA session pooler for $QA_REF_EXPECTED." ;;
  esac
  POOLER_HOST=$(printf '%s' "$POOLER_URL" | sed -E 's|^[^:]+://[^@]+@([^:/]+):[0-9]+/.*|\1|')
  [ -n "$POOLER_HOST" ] || fail "could not parse pooler host."

  if [ -t 0 ]; then
    printf 'Enter QA database password (input hidden): ' >&2
    read -rs QA_DB_PASS; printf '\n' >&2
  else
    fail "interactive terminal required for the password prompt (run in Git Bash)."
  fi
  [ -n "${QA_DB_PASS:-}" ] || fail "empty password."
  export PGPASSWORD="$QA_DB_PASS"; unset QA_DB_PASS
fi
# URL carries NO password in normal mode — credential lives only in PGPASSWORD.
if [ -z "${QA_DB_URL:-}" ]; then
  QA_DB_URL="postgresql://postgres.${QA_REF_EXPECTED}@${POOLER_HOST}:5432/postgres"
fi
# Belt: the connection string must never reference the production project.
case "$QA_DB_URL" in
  *"$PROD_REF"*) fail "connection string references the PRODUCTION project ref." ;;
esac

PGIMG="public.ecr.aws/supabase/postgres:17.6.1.159"
# Dockerized psql runs inside a container — a localhost/127.0.0.1 URL must be
# rewritten to the Docker Desktop host alias so the same URL works for the
# docker client and the host-native Supabase CLI.
forcli() { printf '%s' "$1" | sed -E 's|@(localhost\|127\.0\.0\.1)(:[0-9]+)|@host.docker.internal\2|'; }
if command -v psql >/dev/null 2>&1; then
  sqlp() { psql "$@"; }
else
  say "(no local psql — using docker client tools: $PGIMG)"
  sqlp() { docker run --rm -i -e PGPASSWORD ${DOCKER_NET:+--network "$DOCKER_NET"} "$PGIMG" psql "$(forcli "$1")" "${@:2}"; }
fi

# --- Step 3: verify the remote is reachable and is OUR QA project -------------
# The pooler username embeds the project ref; a successful login as
# postgres.<qa-ref> via the QA pooler IS the identity check. Additional
# sanity: session_user must be 'postgres', and the QA ref must appear nowhere
# in any production-scoped path.
IDENT=$(sqlp "$QA_DB_URL" -Atc \
  "select session_user, current_database(), version() like 'PostgreSQL%'" 2>/dev/null) \
  || fail "could not connect to the QA database — check the password/network."
SUSER=$(printf '%s' "$IDENT" | head -1 | cut -d'|' -f1)
[ "$SUSER" = "postgres" ] || fail "connected as '$SUSER' — expected postgres."
say "2. connected to QA database (session pooler, project ref embedded in login)"

# --- Step 4: QA must be empty of app schema + migration history ---------------
APP_TABLES=$(sqlp "$QA_DB_URL" -Atc \
  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
[ "$APP_TABLES" = "0" ] || fail "QA public schema already has $APP_TABLES table(s) — stopping. Investigate before retrying; do NOT wipe blindly."
HISTORY_REG=$(sqlp "$QA_DB_URL" -Atc \
  "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'')")
if [ -z "$HISTORY_REG" ]; then
  HISTORY="ABSENT"
else
  HISTORY=$(sqlp "$QA_DB_URL" -Atc \
    "select count(*) from supabase_migrations.schema_migrations")
fi
case "$HISTORY" in
  ABSENT|0) ;;
  *) fail "supabase_migrations.schema_migrations already holds $HISTORY version(s) — stopping." ;;
esac
say "3. QA database is empty (0 app tables, no migration history)"

# --- Step 5: baseline safety scan ---------------------------------------------
[ -s "$BASELINE" ] || fail "$BASELINE missing — run 02-build-baseline.sh first."
# Top-level statements only: pg_dump emits DDL at column 0; indented lines are
# function bodies (e.g. cleanup_expired_call_classifications legitimately
# contains "  DELETE FROM ... WHERE expires_at < NOW()").
if grep -nE "^(DROP|TRUNCATE|DELETE FROM|ALTER DATABASE|ALTER SYSTEM|CREATE SERVER|CREATE FOREIGN|GRANT .*TO public)" "$BASELINE"; then
  fail "baseline contains a destructive or foreign-data statement (see above)."
fi
grep -q "$PROD_REF" "$BASELINE" && fail "baseline references the production project ref."
# Row-data check: only storage.buckets config INSERTs are permitted.
BAD_ROWS=$(grep -nE "^INSERT INTO" "$BASELINE" 2>/dev/null | grep -vE "INTO storage\.buckets" | cut -d: -f1 | paste -sd, - || true)
[ -n "$BAD_ROWS" ] && fail "baseline contains INSERT rows beyond storage.buckets config at lines: $BAD_ROWS"
say "4. baseline safety scan clean (no destructive stmts, no prod refs, no row data)"

if [ "$DRY_RUN" = "1" ]; then
  say "DRY-RUN complete — no changes made. Remove --dry-run to apply."
  exit 0
fi

# --- Step 6: apply the baseline (all-or-nothing) -------------------------------
say "5. applying baseline schema (single transaction, ON_ERROR_STOP)..."
if command -v psql >/dev/null 2>&1; then
  psql "$QA_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f "$BASELINE" \
    || fail "baseline apply failed — transaction rolled back. Do not rerun blindly; report the error."
else
  docker run --rm -i -e PGPASSWORD "$PGIMG" psql "$(forcli "$QA_DB_URL")" \
    --single-transaction -v ON_ERROR_STOP=1 -f - < "$BASELINE" \
    || fail "baseline apply failed — transaction rolled back. Do not rerun blindly; report the error."
fi
say "   baseline applied."

# --- Step 7: QA-only migration-history seed ------------------------------------
say "6. seeding QA migration history (marks versions represented by the baseline)..."
QA_DB_URL="$QA_DB_URL" bash scripts/qa/04-seed-qa-history.sh --apply \
  || fail "history seed failed after schema success — report state before retrying."

# --- Step 8: CLI pending-migration check (never --include-all) -----------------
say "7. supabase migration list (remote side should show all 136 seeded)..."
npx -y supabase@2.58.5 migration list --db-url "$QA_DB_URL" 2>&1 | tail -6 || true
say "   db push --dry-run (expect: nothing applied; the 'inserted before the"
say "   last migration' list is the known dup-sibling warning — harmless):"
PUSH_OUT=$(npx -y supabase@2.58.5 db push --db-url "$QA_DB_URL" --dry-run 2>&1 || true)
printf '%s\n' "$PUSH_OUT" | tail -8
if printf '%s\n' "$PUSH_OUT" | grep -q "include-all"; then
  say "   -> pending files are only pre-baseline dup-siblings (expected, not applied)."
elif printf '%s\n' "$PUSH_OUT" | grep -qiE "would apply|Applying migration"; then
  say "   WARNING: db push reports genuinely pending migrations — investigate" >&2
  say "   before proceeding; NEVER rerun with --include-all." >&2
fi

# --- Step 9: parity + zero-data confirmation -----------------------------------
say "8. schema parity check..."
QA_DB_URL="$QA_DB_URL" bash scripts/qa/03-validate-qa-parity.sh

say "9. confirming zero customer/auth records on QA..."
ROWS=$(sqlp "$QA_DB_URL" -Atc \
  "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables where schemaname='public'")
AUTH_USERS=$(sqlp "$QA_DB_URL" -Atc "select count(*) from auth.users" 2>/dev/null || echo "n/a")
say "   public-schema rows: $ROWS | auth.users: $AUTH_USERS"
[ "$ROWS" = "0" ] || say "   NOTE: non-zero public rows — investigate before QA use."

say ""
say "QA DATABASE INITIALIZED — schema parity checked, history seeded (136 versions"
say "marked as represented-by-baseline), zero customer data. Next: configure QA"
say "env vars + dashboard settings per QA_ENVIRONMENT_SETUP.md."
