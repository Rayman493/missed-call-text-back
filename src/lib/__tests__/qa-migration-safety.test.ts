/**
 * QA migration-safety contracts.
 *
 * Pins the protections that keep QA bootstrap artifacts out of production
 * migration paths and keep the prod schema export read-only:
 *   - check-migration-artifacts.mjs rejects QA-only files in supabase/migrations
 *   - 01-export-prod-schema.sh refuses without explicit prod confirmation,
 *     a non-qa_schema_reader user, or a missing/wrong project ref
 *   - 02-build-baseline.sh refuses secrets/row data and emits a QA-ONLY
 *     baseline OUTSIDE supabase/migrations plus an idempotent history seed
 */
import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const GUARD = 'scripts/check-migration-artifacts.mjs'
const PUSH_GUARD = 'scripts/guard-prod-db-push.mjs'
const EXPORT_SH = 'scripts/qa/01-export-prod-schema.sh'
const BUILD_SH = 'scripts/qa/02-build-baseline.sh'
const SEED_SH = 'scripts/qa/04-seed-qa-history.sh'

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'rfq-mig-'))
}

function runNode(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf8', env: { ...process.env, ...env },
  })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

let bashOk = true
try { execFileSync('bash', ['--version'], { stdio: 'pipe' }) } catch { bashOk = false }

function runBash(script: string, args: string[] = [], env: Record<string, string> = {}) {
  try {
    const out = execFileSync('bash', [script, ...args], {
      encoding: 'utf8', env: { ...process.env, ...env }, stdio: 'pipe',
    })
    return { code: 0, out }
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

const cleanEnv = {
  REPLYFLOW_ENV: '', PROD_DB_URL: '', CONFIRM_PROD_REF: '',
  PROD_REF_EXPECTED: '', EXPORT_DIR: '', BASELINE_OUT: '', SEED_OUT: '',
  QA_DB_URL: '', QA_REF_EXPECTED: '', MIGRATIONS_DIR: '', PROJECT_REF_FILE: '',
  ALLOW_PROD_MIGRATION_WRITE: '',
}

describe('check-migration-artifacts.mjs', () => {
  it('accepts the real migrations directory', () => {
    const r = runNode([GUARD])
    expect(r.code).toBe(0)
  })

  it('rejects a qa_baseline file inside migrations', () => {
    const d = tmpDir()
    writeFileSync(join(d, '20261001000000_normal.sql'), 'select 1;')
    writeFileSync(join(d, '20261005000000_qa_baseline_prod_schema.sql'), 'select 1;')
    const r = runNode([GUARD, d])
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/qa_baseline/)
  })

  it('rejects a file carrying the QA-ONLY marker', () => {
    const d = tmpDir()
    writeFileSync(join(d, '20261001000000_sneaky.sql'), '-- QA-ONLY artifact\nselect 1;')
    expect(runNode([GUARD, d]).code).toBe(1)
  })

  it('rejects unknown non-timestamped files but allows the legacy twelve', () => {
    const d = tmpDir()
    writeFileSync(join(d, 'random_patch.sql'), 'select 1;')
    expect(runNode([GUARD, d]).code).toBe(1)
    const d2 = tmpDir()
    writeFileSync(join(d2, 'production-fix-add-missing-columns.sql'), 'select 1;')
    writeFileSync(join(d2, '20261001000000_normal.sql'), 'select 1;')
    expect(runNode([GUARD, d2]).code).toBe(0)
  })

  it('warns on duplicate versions without failing', () => {
    const d = tmpDir()
    writeFileSync(join(d, '20260101000000_a.sql'), 'select 1;')
    writeFileSync(join(d, '20260101000000_b.sql'), 'select 1;')
    const r = runNode([GUARD, d])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/duplicate version 20260101000000/)
  })
})

describe('verify-qa-env.mjs — universal artifact check', () => {
  it('runs the migration guard even in production mode', () => {
    // Current tree must pass (exit 0) with no REPLYFLOW_ENV set.
    const r = runNode(['scripts/verify-qa-env.mjs'], { REPLYFLOW_ENV: '' })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/MIGRATION GUARD.*OK/)
  })
})

describe.skipIf(!bashOk)('01-export-prod-schema.sh guards (--check-only)', () => {
  it('aborts without explicit CONFIRM_PROD_REF', () => {
    const r = runBash(EXPORT_SH, ['--check-only'], {
      ...cleanEnv,
      PROD_DB_URL: 'postgresql://qa_schema_reader.x@h:6543/postgres',
    })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/CONFIRM_PROD_REF/)
  })

  it('aborts on a mismatched CONFIRM_PROD_REF', () => {
    const r = runBash(EXPORT_SH, ['--check-only'], {
      ...cleanEnv, CONFIRM_PROD_REF: 'wrongref',
      PROD_DB_URL: 'postgresql://qa_schema_reader.x@h:6543/postgres',
    })
    expect(r.code).toBe(1)
  })

  it('aborts when the DB user is not qa_schema_reader', () => {
    const r = runBash(EXPORT_SH, ['--check-only'], {
      ...cleanEnv,
      CONFIRM_PROD_REF: 'bqummccorpfihatocffl',
      PROD_DB_URL: 'postgresql://postgres.bqummccorpfihatocffl:x@pooler:6543/postgres',
    })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/qa_schema_reader/)
  })

  it('aborts when URL lacks the prod ref entirely', () => {
    const r = runBash(EXPORT_SH, ['--check-only'], {
      ...cleanEnv,
      CONFIRM_PROD_REF: 'bqummccorpfihatocffl',
      PROD_DB_URL: 'postgresql://qa_schema_reader:x@some-other-host:5432/postgres',
    })
    expect(r.code).toBe(1)
  })

  it('passes all guards with correct ref + qa_schema_reader pooler URL', () => {
    const r = runBash(EXPORT_SH, ['--check-only'], {
      ...cleanEnv,
      CONFIRM_PROD_REF: 'bqummccorpfihatocffl',
      PROD_DB_URL: 'postgresql://qa_schema_reader.bqummccorpfihatocffl:x@aws-0.pooler.supabase.com:6543/postgres',
    })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/CHECK-ONLY/)
  })
})

describe('guard-prod-db-push.mjs', () => {
  function refFile(content: string | null) {
    const d = tmpDir()
    const f = join(d, 'project-ref')
    if (content !== null) writeFileSync(f, content)
    return f
  }

  it('is a no-op when no project-ref file exists (CI/prod build)', () => {
    const r = runNode([PUSH_GUARD], { PROJECT_REF_FILE: refFile(null) })
    expect(r.code).toBe(0)
  })

  it('passes when linked to the QA project', () => {
    const r = runNode([PUSH_GUARD], { PROJECT_REF_FILE: refFile('ixtifohdqhtvhhessgaj') })
    expect(r.code).toBe(0)
  })

  it('blocks when linked to production (history unreconciled)', () => {
    const r = runNode([PUSH_GUARD], { PROJECT_REF_FILE: refFile('bqummccorpfihatocffl') })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/PROD PUSH GUARD.*REFUSING/)
  })

  it('blocks an unknown project link too? — only prod is blocked; unknown passes', () => {
    // Guard is prod-specific: non-prod links are not this guard's concern.
    const r = runNode([PUSH_GUARD], { PROJECT_REF_FILE: refFile('someotherref') })
    expect(r.code).toBe(0)
  })

  it('honours the explicit reconciliation override', () => {
    const r = runNode([PUSH_GUARD], {
      PROJECT_REF_FILE: refFile('bqummccorpfihatocffl'),
      ALLOW_PROD_MIGRATION_WRITE: 'I-RECONCILED-PROD-HISTORY',
    })
    expect(r.code).toBe(0)
  })
})

describe.skipIf(!bashOk)('02-build-baseline.sh', () => {
  function fixture(dir: string, history: 'present' | 'absent' = 'present') {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'prod_schema_public.sql'),
      '-- dump\nSET x=1;\nCREATE TABLE public.t(id int);\n\\restrict tok\n')
    writeFileSync(join(dir, 'prod_extensions.sql'), 'create extension if not exists "pgcrypto";\n')
    writeFileSync(join(dir, 'prod_storage_buckets.sql'), '-- none\n')
    writeFileSync(join(dir, 'prod_publications.sql'), '-- none\n')
    writeFileSync(join(dir, 'prod_history_status.txt'), history + '\n')
    if (history === 'present') {
      writeFileSync(join(dir, 'prod_migration_history.sql'),
        "INSERT INTO supabase_migrations.schema_migrations (version,name) VALUES ('20240513','a');\n")
    }
  }

  it('aborts when a required export is missing', () => {
    const d = tmpDir()
    const r = runBash(BUILD_SH, [], { ...cleanEnv, EXPORT_DIR: join(d, 'exports') })
    expect(r.code).toBe(1)
  })

  it('aborts on a schema dump with zero CREATE TABLE (partial export)', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp)
    writeFileSync(join(exp, 'prod_schema_public.sql'), '-- empty dump\nSET x=1;\n')
    const r = runBash(BUILD_SH, [], { ...cleanEnv, EXPORT_DIR: exp })
    expect(r.code).toBe(1)
  })

  it('aborts when status=present but history has no INSERT rows', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp)
    writeFileSync(join(exp, 'prod_migration_history.sql'), '-- dump produced no rows\n')
    const r = runBash(BUILD_SH, [], { ...cleanEnv, EXPORT_DIR: exp })
    expect(r.code).toBe(1)
  })

  it('aborts on an unrecognised history status', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp)
    writeFileSync(join(exp, 'prod_history_status.txt'), 'garbage\n')
    const r = runBash(BUILD_SH, [], { ...cleanEnv, EXPORT_DIR: exp })
    expect(r.code).toBe(1)
  })

  it('aborts if the schema dump contains public row data', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp)
    writeFileSync(join(exp, 'prod_schema_public.sql'),
      "CREATE TABLE public.t(id int);\nINSERT INTO public.t VALUES (1);\n")
    const r = runBash(BUILD_SH, [], { ...cleanEnv, EXPORT_DIR: exp })
    expect(r.code).toBe(1)
  })

  it('aborts if exports contain credential material', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp)
    writeFileSync(join(exp, 'prod_schema_public.sql'),
      "CREATE TABLE public.t(id int); -- sk_live_abcdef\n")
    const r = runBash(BUILD_SH, [], { ...cleanEnv, EXPORT_DIR: exp })
    expect(r.code).toBe(1)
  })

  it('present: emits QA-ONLY baseline + idempotent prod-history seed', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp)
    const base = join(d, 'prod_baseline.sql')
    const seed = join(exp, 'seed.sql')
    const r = runBash(BUILD_SH, [], {
      ...cleanEnv, EXPORT_DIR: exp, BASELINE_OUT: base, SEED_OUT: seed,
    })
    expect(r.code).toBe(0)
    expect(existsSync(base)).toBe(true)
    const baseline = require('node:fs').readFileSync(base, 'utf8')
    expect(baseline).toMatch(/QA-ONLY/)
    expect(baseline).not.toMatch(/^\\\\restrict/m)
    const seedSql = require('node:fs').readFileSync(seed, 'utf8')
    expect(seedSql).toMatch(/ON CONFLICT \(version\) DO NOTHING/i)
    expect(seedSql).toMatch(/version text not null primary key/i)
    expect(seedSql).toMatch(/add column if not exists statements/i)
    expect(base).not.toContain('supabase/migrations')
  })

  it('absent: emits baseline but fabricates NO prod-history seed', () => {
    const d = tmpDir()
    const exp = join(d, 'exports'); fixture(exp, 'absent')
    const base = join(d, 'prod_baseline.sql')
    const seed = join(exp, 'seed.sql')
    const r = runBash(BUILD_SH, [], {
      ...cleanEnv, EXPORT_DIR: exp, BASELINE_OUT: base, SEED_OUT: seed,
    })
    expect(r.code).toBe(0)
    expect(existsSync(base)).toBe(true)
    expect(existsSync(seed)).toBe(false)
    expect(r.out).toMatch(/04-seed-qa-history/)
  })
})

describe.skipIf(!bashOk)('04-seed-qa-history.sh', () => {
  function migDir(withArtifact = false) {
    const d = tmpDir()
    writeFileSync(join(d, '20260101000000_a.sql'), 'select 1;')
    writeFileSync(join(d, '20260101000000_b.sql'), 'select 2;')
    writeFileSync(join(d, '20260202000000_c.sql'), 'select 3;')
    if (withArtifact) {
      writeFileSync(join(d, '20261005000000_qa_baseline_prod_schema.sql'), 'select 4;')
    }
    return d
  }

  it('aborts while the worktree is linked to production', () => {
    const d = tmpDir()
    writeFileSync(join(d, 'project-ref'), 'bqummccorpfihatocffl')
    const r = runBash(SEED_SH, [], {
      ...cleanEnv, MIGRATIONS_DIR: migDir(),
      SEED_OUT: join(d, 'seed.sql'), PROJECT_REF_FILE: join(d, 'project-ref'),
    })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/PROD/i)
  })

  it('aborts on a migration manifest containing QA-only artifacts', () => {
    const d = tmpDir()
    writeFileSync(join(d, 'project-ref'), 'ixtifohdqhtvhhessgaj')
    const r = runBash(SEED_SH, [], {
      ...cleanEnv, MIGRATIONS_DIR: migDir(true),
      SEED_OUT: join(d, 'seed.sql'), PROJECT_REF_FILE: join(d, 'project-ref'),
    })
    expect(r.code).toBe(1)
  })

  it('generates CLI-shaped seed covering every local version, warns on dups', () => {
    const d = tmpDir()
    writeFileSync(join(d, 'project-ref'), 'ixtifohdqhtvhhessgaj')
    const seed = join(d, 'seed.sql')
    const r = runBash(SEED_SH, [], {
      ...cleanEnv, MIGRATIONS_DIR: migDir(),
      SEED_OUT: seed, PROJECT_REF_FILE: join(d, 'project-ref'),
    })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/duplicate version 20260101000000/)
    const sql = require('node:fs').readFileSync(seed, 'utf8')
    expect(sql).toMatch(/QA-ONLY/)
    expect(sql).toMatch(/create schema if not exists supabase_migrations/i)
    expect(sql).toMatch(/version text not null primary key/i)
    expect(sql).toMatch(/add column if not exists statements text\[\]/i)
    expect(sql).toMatch(/add column if not exists name/i)
    for (const v of ['20260101000000', '20260202000000']) {
      expect(sql).toContain(`'${v}'`)
    }
    expect((sql.match(/ON CONFLICT \(version\) DO NOTHING/g) || []).length).toBe(2)
  })

  it('--apply refuses without QA_DB_URL', () => {
    const d = tmpDir()
    writeFileSync(join(d, 'project-ref'), 'ixtifohdqhtvhhessgaj')
    const r = runBash(SEED_SH, ['--apply'], {
      ...cleanEnv, MIGRATIONS_DIR: migDir(), QA_DB_URL: '',
      SEED_OUT: join(d, 'seed.sql'), PROJECT_REF_FILE: join(d, 'project-ref'),
    })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/QA_DB_URL/)
  })
})
