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

## Architecture decision — snapshot + history seed (no replay)

Instead of repairing 149 imperfect files, QA gets:

1. **One baseline file** — `pg_dump --schema-only` of prod's `public`
   schema, sanitized, emitted as **`qa-baseline/prod_baseline.sql`** —
   deliberately OUTSIDE `supabase/migrations/` (physical separation), applied
   once via `psql` during QA bring-up. It carries a `-- QA-ONLY` marker.
2. **A history seed** — `qa-baseline/exports/seed_migration_history.sql`:
   `INSERT ... ON CONFLICT DO NOTHING` marking every version recorded in prod's
   `supabase_migrations.schema_migrations` as applied on QA. `db push` then has
   nothing pending; historical files never execute on QA.
3. **Future migrations** are new timestamped files written on `qa` and promoted
   to `main` normally — `db push` to prod applies only versions prod lacks.

### Why separation is physical, not just nominal

`check-migration-artifacts.mjs` runs inside `verify-qa-env.mjs` for **every**
build (including production Vercel builds): any QA-only artifact found in
`supabase/migrations/` fails the build. Because the baseline lives in
`qa-baseline/`, even a direct `supabase db push` against prod from this branch
cannot execute it — the file is invisible to the CLI.

### Why no renames are needed

The 12 duplicate-timestamp groups are only fatal when both files try to record
the same `schema_migrations.version` PK on a fresh database. Under this
strategy neither file ever executes on QA (version pre-marked applied), and on
prod both share one version that is already present → neither is pending.
**Historical filenames stay untouched**, satisfying the promotion constraint.

### Promotion caveat — verify at go-time

`db push` to prod treats as pending every *local file version* missing from
prod's history. If prod's `schema_migrations` lacks a version for an old
manual-era file, a future prod push would try to apply it. The exported
`prod_migration_history.sql` shows exactly which versions prod recorded;
any gap gets resolved by `supabase migration repair --status applied <v>`
on prod — a metadata-only insert, done under explicit change control.

## The extraction procedure (read-only)

### Step 0 — one-time prod prep (manual, Supabase SQL Editor, ~1 min)

Create a least-privilege read-only role. **Verified constraint:** `pg_dump
--schema-only` `LOCK TABLE`s every dumped table (ACCESS SHARE), and LOCK
requires `SELECT` — a catalog-only role cannot run it. The true minimum is
`SELECT` on the dumped schema's tables; the export still contains zero rows,
the role can never write, and `auth` stays ungranted:

```sql
create role qa_schema_reader login password '<generated>' connection limit 1;
alter role qa_schema_reader set default_transaction_read_only = on;
grant usage on schema public, storage, supabase_migrations to qa_schema_reader;
grant select on all tables in schema public to qa_schema_reader;  -- pg_dump lock requirement
grant select on supabase_migrations.schema_migrations to qa_schema_reader;
grant select on storage.buckets to qa_schema_reader;
-- auth schema: ungranted (auth.users emails unreachable)
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
- exports dir gitignored
- `CONFIRM_PROD_REF` explicitly equals the prod allowlist ref
- URL references the prod project **and** authenticates as `qa_schema_reader`
- post-connect: `current_user` verified + `rolsuper/rolbypassrls/rolcreatedb`
  all false + `transaction_read_only=on`
- post-dump: schema file scanned for `COPY`/`INSERT INTO public|auth` → abort

### Step 2 — build the baseline (scripted)

```bash
./scripts/qa/02-build-baseline.sh
```

Leak-scans exports (credentials, JWTs, row-data `COPY/INSERT` into public),
builds the baseline migration + `seed_migration_history.sql`.

### Step 3 — apply to QA (manual trigger, when authorized)

```bash
psql "$QA_DB_URL" -f qa-baseline/prod_baseline.sql                 # schema
psql "$QA_DB_URL" -f qa-baseline/exports/seed_migration_history.sql # history
npx supabase db push        # no-op — everything already recorded applied
./scripts/qa/03-validate-qa-parity.sh
```

### Step 4 — parity check

`03-validate-qa-parity.sh` re-dumps QA schema-only, normalizes both dumps
(strip comments/ordering), diffs object inventories, and prints per-object
catalog counts. **No row data ever participates** — comparison is DDL-only.

## What the snapshot does / does not cover

| Covered by pg_dump -s | Requires dashboard/manual |
|---|---|
| tables, cols, types, defaults | Auth: providers, site URL, email templates |
| PKs, FKs, check constraints | Edge functions (none in repo) |
| indexes, views, sequences | Secrets / env vars (never exported) |
| functions, triggers | Realtime enablement toggle (publication rows exported) |
| RLS enabled + policies | Storage objects (customer data — excluded) |
| extension list | `storage.buckets` config rows (exported) |

## Remaining risks

- **Drift between export and QA apply** — prod keeps changing; re-export if
  prod ships migrations between export and QA bring-up.
- **`pg_dump -s` vs prod's true runtime state** — things created by dashboard
  toggles (Realtime publication, storage RLS on `storage.objects`) are partly
  outside `public` schema; `prod_publications.sql` + `storage.buckets` cover
  the observed needs (`business-logos` bucket). Verify against Step-4 diff.
- **`auth.users` references** — public functions/triggers referencing
  `auth.users` are kept verbatim (QA project has its own auth schema — same
  shape). No auth data is exported.
- **RLS in dump** — pg_dump emits `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`;
  a fresh project's default grants (`anon`/`authenticated`/`service_role`)
  exist out-of-the-box, so policies apply identically.
