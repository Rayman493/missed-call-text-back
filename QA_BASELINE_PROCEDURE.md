# QA Baseline — Production Schema Reproduction Procedure

Status: **PREPARED — awaiting manual authorization for the read-only prod export.**
Companion to `QA_ENVIRONMENT_SETUP.md`. Scripts live in `scripts/qa/`.

## Why a baseline exists

The audit proved `supabase/migrations/` alone cannot rebuild prod: `businesses`,
`twilio_numbers`, `follow_up_jobs`, `call_events`, `trial_history`,
`trial_overrides`, `allowed_numbers`, `blocked_numbers`,
`personal_contact_numbers`, `filtering_decision_logs` and ~59 columns were
created by the untracked layer (`docs/supabase-setup.sql` + `migrations/` +
SQL-editor patches). 136/149 tracked files fail on a fresh database.

## Verified finding — production has NO CLI migration history

A read-only probe (2026-09-26) returned:

- `reader_role_exists = false`
- `migration_schema_exists = false`
- `migration_history_table_exists = false`

Production was never managed by `supabase db push`; its schema was built
manually (SQL editor / dashboard). Consequences:

1. **The original reader SQL failed** because it granted on the nonexistent
   `supabase_migrations` schema. The corrected Step-0 grants only verified
   objects.
2. **No prod history can be exported** — `01` detects this via `to_regclass`,
   writes `prod_history_status.txt = absent`, and records a marker instead of
   fabricating rows.
3. **QA history seeding is local-manifest driven** (`04-seed-qa-history.sh`):
   QA's `schema_migrations` is seeded with the repo's 136 distinct versions so
   `db push` has nothing pending on QA.
4. **Production `db push` / `migration repair` is UNSAFE until reconciled** —
   with no history, every local file would be pending. `guard-prod-db-push.mjs`
   blocks it in builds and via `npm run db:push` / `npm run migration:repair`.

## Architecture decision — snapshot + QA-local history seed (no replay)

1. **One baseline file** — `pg_dump --schema-only` of prod's `public`
   schema, sanitized, emitted as **`qa-baseline/prod_baseline.sql`** —
   deliberately OUTSIDE `supabase/migrations/` (physical separation), applied
   once via `psql` during QA bring-up. Carries a `-- QA-ONLY` marker.
   `qa-baseline/` is gitignored.
2. **A QA-only history seed** — `qa-baseline/seed_qa_history.sql`, generated
   by `04-seed-qa-history.sh` from the LOCAL migration manifest (+ prod rows
   if a future prod ever has them). Uses the exact DDL Supabase CLI 2.x
   creates (`version` PK, `statements`, `name`). Applied to QA via `psql`.
3. **Future migrations** are new timestamped files on `qa` → promoted to
   `main` normally. On QA `db push` applies only versions > max(remote).

### Why separation is physical, not just nominal

`check-migration-artifacts.mjs` runs inside `verify-qa-env.mjs` for **every**
build: any QA-only artifact inside `supabase/migrations/` fails the build.
Because the baseline lives in `qa-baseline/`, even a direct `supabase db push`
against prod cannot execute it — the file is invisible to the CLI.

### Duplicate timestamps + the `--include-all` hazard (verified with real CLI)

The 13 duplicate-version groups are only fatal when both files try to record
the same `schema_migrations.version` PK on a fresh database. Under this
strategy neither file ever executes on QA (version pre-marked applied), and on
prod neither is pending because prod has no history mechanism at all.
**Historical filenames stay untouched.**

**Verified CLI behavior (supabase@2.58.5, disposable DB):** after seeding QA,
a plain `supabase db push` applies **only** versions newer than the max seeded
version — the 13 duplicate-sibling files (same version as an already-recorded
row) are reported as "files to be inserted before the last migration" and are
**not** applied. They only apply if `--include-all` is passed.

> **NEVER run `supabase db push --include-all` on QA or production** — it would
> replay the 13 duplicate-sibling historical files.

## The extraction procedure (read-only)

### Step 0 — one-time prod prep (manual, Supabase SQL Editor, ~1 min)

Pre-check (optional, confirms what exists):

```sql
select to_regclass('supabase_migrations.schema_migrations') as history_table,
       to_regclass('storage.buckets') as buckets_table,
       to_regnamespace('auth') as auth_schema;
-- expected: history_table NULL (absent), buckets_table present, auth present
```

Create the least-privilege read-only role. **Verified constraint:** `pg_dump
--schema-only` `LOCK TABLE`s every dumped table (ACCESS SHARE), and LOCK
requires `SELECT` — a catalog-only role cannot run it. The true minimum is
`SELECT` on the dumped schema's tables; the export still contains zero rows,
the role can never write, and `auth` stays ungranted. Grants are ONLY for
objects verified to exist — no `supabase_migrations` grant:

```sql
create role qa_schema_reader login password '<generated>' connection limit 1;
alter role qa_schema_reader set default_transaction_read_only = on;
grant usage on schema public, storage to qa_schema_reader;
grant select on all tables in schema public to qa_schema_reader;  -- pg_dump lock requirement
grant select on storage.buckets to qa_schema_reader;             -- optional; skip if missing
-- auth schema: ungranted (auth.users emails unreachable)
-- supabase_migrations: does NOT exist on prod — do not grant it
-- NOTE: this role CAN technically read public rows if someone queries them —
-- time-box it and drop it after export. It can never write (read-only txn).
```

Teardown after export: `drop role qa_schema_reader;`

**Fallback** if grants are insufficient: a throwaway directory
(`C:\...\rf-prod-inspect\`, NOT a git worktree) + `supabase init` +
`supabase link --project-ref bqummccorpfihatocffl` + `supabase db dump`
— read-only by nature, isolated from the QA worktree's `.temp/project-ref`.

### Step 1 — export (scripted, guarded)

```bash
export PROD_DB_URL='postgresql://qa_schema_reader.<ref>:<pwd>@aws-...pooler.supabase.com:6543/postgres'
export CONFIRM_PROD_REF=bqummccorpfihatocffl   # explicit prod confirmation
./scripts/qa/01-export-prod-schema.sh          # add --check-only to dry-run guards
```

Guards (all must pass before any bytes move):
- QA worktree still linked to `ixtifohdqhtvhhessgaj`
- `qa-baseline/` gitignored
- `CONFIRM_PROD_REF` explicitly equals the prod allowlist ref
- URL references the prod project **and** authenticates as `qa_schema_reader`
- post-connect: `current_user` verified + `rolsuper/rolbypassrls/rolcreatedb`
  all false + `transaction_read_only=on`
- post-dump: schema file must contain ≥1 `CREATE TABLE` and zero
  `COPY`/`INSERT INTO public|auth` rows → else abort
- migration history: `to_regclass` detection → `present` exports rows and
  aborts if 0 rows (present-but-empty would falsely reconcile); `absent`
  writes a marker + status file — never fabricates prod history

### Step 2 — build the baseline (scripted)

```bash
./scripts/qa/02-build-baseline.sh
```

Leak-scans exports (credentials, JWTs, row-data `COPY/INSERT` into public),
emits `qa-baseline/prod_baseline.sql`. Emits a prod-history seed ONLY when
`prod_history_status.txt = present`; when `absent` it fabricates nothing and
defers to step 3.

### Step 3 — QA-only history seed (scripted, local manifest)

```bash
./scripts/qa/04-seed-qa-history.sh              # generates qa-baseline/seed_qa_history.sql
```

- Enumerates `supabase/migrations/*.sql` → 136 distinct versions; reports all
  13 duplicate-version groups explicitly.
- Runs `check-migration-artifacts.mjs` on the manifest first — QA-only files
  inside `supabase/migrations/` abort the seed.
- Refuses to run while the worktree is linked to production (these rows
  describe local files — they are not prod history).
- DDL matches Supabase CLI 2.x exactly (`version` PK + `statements` + `name`),
  verified by grepping the CLI binary and by `migration list`/`db push`
  against a disposable database.
- Merges prod-recorded versions when a real prod history export exists.

### Step 4 — apply to QA (manual trigger, when authorized)

```bash
psql "$QA_DB_URL" -f qa-baseline/prod_baseline.sql     # schema snapshot
# (prod-history seed — only if status was 'present')
psql "$QA_DB_URL" -f qa-baseline/exports/seed_migration_history.sql
QA_DB_URL=... ./scripts/qa/04-seed-qa-history.sh --apply  # local-manifest seed
npx supabase db push        # no-op: applies only versions > max seeded
./scripts/qa/03-validate-qa-parity.sh
```

`--apply` requires the worktree linked to QA and `QA_DB_URL` referencing the
QA project. Plain `db push` must remain a no-op — if it lists dup-sibling
files, that is the expected warning; do NOT add `--include-all`.

### Step 5 — parity check

`03-validate-qa-parity.sh` re-dumps QA schema-only, normalizes both dumps,
diffs object inventories, compares publication membership vs the prod export,
and reports per-object catalog counts. When prod history was present it also
verifies QA's `schema_migrations` covers every prod-recorded version; when
absent it reports that and continues with schema parity. **No row data ever
participates.**

## Production write-safety

`guard-prod-db-push.mjs` runs inside `verify-qa-env.mjs` for every build and
wraps `npm run db:push` / `npm run migration:repair`. While this worktree's
`supabase/.temp/project-ref` equals the production ref, any migration-write
command is refused — prod has no history, so a naive push would replay ~149
files (incl. duplicates and the known MySQL-syntax file). Override only after
an explicit reconciliation decision:

```
ALLOW_PROD_MIGRATION_WRITE=I-RECONCILED-PROD-HISTORY
```

Reconciliation options when prod migrations become necessary (pick one under
change control): (a) one-time seed of prod's `schema_migrations` recording all
local versions as applied, mirroring `04`'s output — makes `db push` apply
only new versions; or (b) continue manual SQL-editor application and never
enable CLI push on prod.

## What the snapshot does / does not cover

| Covered by pg_dump -s | Requires dashboard/manual |
|---|---|
| tables, cols, types, defaults | Auth: providers, site URL, email templates |
| PKs, FKs, check constraints | Edge functions (none in repo) |
| indexes, views, sequences | Secrets / env vars (never exported) |
| functions, triggers | Realtime enablement toggle (publication rows exported) |
| RLS enabled + policies | Storage objects (customer data — excluded) |
| extension list | `storage.buckets` config rows (exported if granted) |

## Remaining risks

- **Drift between export and QA apply** — prod keeps changing; re-export if
  prod ships schema changes between export and QA bring-up.
- **`pg_dump -s` vs prod's true runtime state** — things created by dashboard
  toggles (Realtime publication, storage RLS on `storage.objects`) are partly
  outside `public`; `prod_publications.sql` + `storage.buckets` cover the
  observed needs (`business-logos` bucket). Verify against Step-5 diff.
- **`auth.users` references** — public functions/triggers referencing
  `auth.users` are kept verbatim (QA project has its own auth schema — same
  shape). No auth data is exported.
- **RLS in dump** — pg_dump emits `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`;
  a fresh project's default grants (`anon`/`authenticated`/`service_role`)
  exist out-of-the-box, so policies apply identically.
- **`--include-all` footgun** — verified: it would replay the 13
  duplicate-sibling files on QA. Documented + never used by scripts.
- **`storage.buckets` grant** may fail on prod if `postgres` isn't the owner —
  `01` degrades gracefully to a comment-only file; recreate bucket config from
  `20260913230000` if needed.
