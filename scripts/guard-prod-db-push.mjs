#!/usr/bin/env node
/**
 * guard-prod-db-push.mjs — prevent accidental `supabase db push` or
 * `migration repair` against PRODUCTION while prod's migration history is
 * unreconciled.
 *
 * Verified finding: production has NO supabase_migrations.schema_migrations.
 * A naive `db push` linked to prod would therefore treat ALL ~149 historical
 * local files as pending — replaying duplicate-timestamp groups and the
 * known MySQL-syntax file against the live database.
 *
 * Activation:
 *   - supabase/.temp/project-ref exists AND equals the prod project ref.
 *   - Vercel/CI checkouts have no .temp file -> this is a no-op there.
 *   - A linked QA or other project -> passes.
 *
 * Override (post-reconciliation only, explicit change control):
 *   ALLOW_PROD_MIGRATION_WRITE=I-RECONCILED-PROD-HISTORY
 *
 * Env seams for testing:
 *   PROJECT_REF_FILE — alternate project-ref file location
 */

import { existsSync, readFileSync } from 'node:fs'

const PROD_REF = 'bqummccorpfihatocffl'
const OVERRIDE = 'I-RECONCILED-PROD-HISTORY'
const refFile = process.env.PROJECT_REF_FILE || 'supabase/.temp/project-ref'

if (!existsSync(refFile)) {
  process.exit(0) // CI / unlinked worktree — nothing to guard
}

const linked = readFileSync(refFile, 'utf8').trim()
if (linked !== PROD_REF) {
  process.exit(0) // linked to QA or another non-prod project — allowed
}

if (process.env.ALLOW_PROD_MIGRATION_WRITE === OVERRIDE) {
  console.warn('[PROD PUSH GUARD] override set — proceeding under explicit change control.')
  process.exit(0)
}

console.error('[PROD PUSH GUARD] REFUSING — this worktree is linked to PRODUCTION.')
console.error('[PROD PUSH GUARD] Prod has no supabase_migrations history; `db push`/`repair`')
console.error('[PROD PUSH GUARD] would replay ~149 historical files (incl. duplicate versions')
console.error('[PROD PUSH GUARD] and the MySQL-syntax migration) against the live database.')
console.error('[PROD PUSH GUARD] QA bootstrap artifacts live in qa-baseline/ — never push them.')
console.error('[PROD PUSH GUARD] To proceed after reconciling prod history, set:')
console.error(`[PROD PUSH GUARD]   ALLOW_PROD_MIGRATION_WRITE=${OVERRIDE}`)
process.exit(1)
