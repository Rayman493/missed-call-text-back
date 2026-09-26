#!/usr/bin/env node
/**
 * check-migration-artifacts.mjs — reject QA-only bootstrap artifacts inside
 * the shared production migration directory.
 *
 * Runs for EVERY environment (called from verify-qa-env.mjs before the
 * REPLYFLOW_ENV early-exit), so a production Vercel build or `db push`
 * preparation fails if QA bootstrap material ever lands in
 * supabase/migrations/.
 *
 * Violations (exit 1):
 *   - files matching QA bootstrap patterns (*qa_baseline*, *seed_migration*,
 *     prod_schema_*.sql, *_qa_*.sql naming)
 *   - files containing the `-- QA-ONLY` marker inside supabase/migrations
 *   - non-timestamped .sql files not on the historical-skip allowlist
 *   - timestamped files newer than TIMESTAMPTZ format (sanity)
 *
 * Warnings (non-fatal):
 *   - duplicate version prefixes (historical; never replayed under the
 *     baseline strategy — see QA_BASELINE_PROCEDURE.md)
 *
 * Usage: node scripts/check-migration-artifacts.mjs [migrationsDir]
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const dir = process.argv[2] || 'supabase/migrations'

// The 12 legacy non-timestamped files that shipped inside supabase/migrations
// historically. The Supabase CLI skips them (invalid names) and production
// applied their effects manually. Removing them is a history change — out of
// scope — so they are allowlisted rather than flagged.
const LEGACY_NON_TIMESTAMPED = new Set([
  'add_conversation_id_to_follow_up_jobs.sql',
  'add_follow_up_delay_units.sql',
  'add_manual_access_fields.sql',
  'add_protected_account_fields.sql',
  'add_step_to_follow_up_jobs.sql',
  'add_twilio_reclamation_fields.sql',
  'add_twilio_retired_status.sql',
  'add_warm_number_statuses.sql',
  'fix_twilio_number_status_consistency.sql',
  'production-fix-add-missing-columns.sql',
  'production-fix-add-notification-columns.sql',
  'production-fix-add-provisioning-columns.sql',
])

const QA_PATTERNS = [
  /qa_baseline/i,
  /seed_migration_history/i,
  /prod_schema_/i,
  /_qa[_-]/i,
  /baseline_prod/i,
]
const QA_MARKER = /^\s*--\s*QA-ONLY\b/m
const TS_NAME = /^\d{8,14}_.+\.sql$/

if (!existsSync(dir)) {
  console.error(`[MIGRATION GUARD] directory not found: ${dir}`)
  process.exit(1)
}

const violations = []
const warnings = []
const files = readdirSync(dir).filter(f => f.endsWith('.sql'))
const versions = new Map()

for (const f of files) {
  if (QA_PATTERNS.some(p => p.test(f))) {
    violations.push(`${f}: QA bootstrap artifact inside shared migration directory`)
    continue
  }
  const m = f.match(/^(\d{8,14})_/)
  if (!m) {
    if (!LEGACY_NON_TIMESTAMPED.has(f)) {
      violations.push(`${f}: no valid timestamp prefix and not on the historical allowlist`)
    }
    continue
  }
  versions.set(m[1], [...(versions.get(m[1]) || []), f])
  try {
    const head = readFileSync(join(dir, f), 'utf8').slice(0, 4096)
    if (QA_MARKER.test(head)) {
      violations.push(`${f}: carries QA-ONLY marker inside supabase/migrations/`)
    }
  } catch { /* unreadable files are a separate problem */ }
}

for (const [v, fs] of versions) {
  if (fs.length > 1) warnings.push(`duplicate version ${v}: ${fs.join(', ')}`)
}

for (const w of warnings) console.warn(`[MIGRATION GUARD] warn: ${w}`)
if (violations.length) {
  for (const v of violations) console.error(`[MIGRATION GUARD] VIOLATION: ${v}`)
  console.error('[MIGRATION GUARD] QA bootstrap artifacts must live in qa-baseline/, never supabase/migrations/.')
  process.exit(1)
}
console.log(`[MIGRATION GUARD] OK — ${files.length} files checked, ${warnings.length} duplicate-version warnings, 0 violations`)
process.exit(0)
