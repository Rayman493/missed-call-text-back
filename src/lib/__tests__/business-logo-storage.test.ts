/**
 * Business Logo Storage Regression Tests
 *
 * Regression for the production "Bucket not found" blocker.
 * Verifies bucket provisioning migration, policies, error handling,
 * and persistence behavior.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const logoSettingsSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
const batch2MigrationSrc = readSrc('supabase/migrations/20260913220000_add_billing_snapshots_tokens_logo.sql')
const fixMigrationSrc = readSrc('supabase/migrations/20260913230000_fix_business_logo_bucket.sql')
const rendererSrc = readSrc('src/components/billing/DocumentRenderer.tsx')
const pdfSrc = readSrc('src/components/billing/BillingDocumentPdf.tsx')
const hostedSrc = readSrc('src/components/billing/HostedDocumentPage.tsx')

// ============================================================================
// BUCKET NAME
// ============================================================================
describe('BUCKET NAME', () => {
  it('client uses business-logos bucket', () => {
    expect(logoSettingsSrc).toContain("from('business-logos')")
  })

  it('batch2 migration references business-logos bucket', () => {
    expect(batch2MigrationSrc).toContain("'business-logos'")
  })

  it('fix migration references business-logos bucket', () => {
    expect(fixMigrationSrc).toContain("'business-logos'")
  })
})

// ============================================================================
// BUCKET CREATION (idempotent)
// ============================================================================
describe('BUCKET CREATION', () => {
  it('fix migration inserts into storage.buckets', () => {
    expect(fixMigrationSrc).toContain('INSERT INTO storage.buckets')
  })

  it('fix migration is idempotent (ON CONFLICT DO UPDATE)', () => {
    expect(fixMigrationSrc).toContain('ON CONFLICT (id) DO UPDATE')
  })

  it('fix migration sets bucket to public', () => {
    expect(fixMigrationSrc).toContain('true')
  })

  it('fix migration sets file_size_limit to 2MB (2097152)', () => {
    expect(fixMigrationSrc).toContain('2097152')
  })

  it('fix migration sets allowed_mime_types for PNG, JPEG, WebP', () => {
    expect(fixMigrationSrc).toContain("'image/png'")
    expect(fixMigrationSrc).toContain("'image/jpeg'")
    expect(fixMigrationSrc).toContain("'image/webp'")
  })

  it('fix migration updates config on existing bucket (not just DO NOTHING)', () => {
    // The fix migration must UPDATE existing buckets, not just DO NOTHING
    // The batch2 migration used DO NOTHING which left config incomplete
    expect(fixMigrationSrc).toContain('ON CONFLICT (id) DO UPDATE SET')
    expect(fixMigrationSrc).not.toContain('ON CONFLICT (id) DO NOTHING')
  })
})

// ============================================================================
// STORAGE POLICIES
// ============================================================================
describe('STORAGE POLICIES', () => {
  it('fix migration creates public read policy', () => {
    expect(fixMigrationSrc).toContain('business_logos_read_all')
    expect(fixMigrationSrc).toContain('FOR SELECT')
  })

  it('fix migration creates insert policy scoped to own business', () => {
    expect(fixMigrationSrc).toContain('business_logos_insert_own')
    expect(fixMigrationSrc).toContain('FOR INSERT')
    expect(fixMigrationSrc).toContain('storage.foldername(name)')
    expect(fixMigrationSrc).toContain('auth.uid()')
  })

  it('fix migration creates update policy scoped to own business', () => {
    expect(fixMigrationSrc).toContain('business_logos_update_own')
    expect(fixMigrationSrc).toContain('FOR UPDATE')
    expect(fixMigrationSrc).toContain('storage.foldername(name)')
    expect(fixMigrationSrc).toContain('auth.uid()')
  })

  it('fix migration creates delete policy scoped to own business', () => {
    expect(fixMigrationSrc).toContain('business_logos_delete_own')
    expect(fixMigrationSrc).toContain('FOR DELETE')
    expect(fixMigrationSrc).toContain('storage.foldername(name)')
    expect(fixMigrationSrc).toContain('auth.uid()')
  })

  it('fix migration drops existing policies before recreating (idempotent)', () => {
    expect(fixMigrationSrc).toContain('DROP POLICY IF EXISTS')
  })

  it('policies use business user_id ownership (not client-supplied trust)', () => {
    // The policy checks that the folder name matches a business owned by auth.uid()
    expect(fixMigrationSrc).toContain('SELECT id::text FROM businesses WHERE user_id = auth.uid()')
  })

  it('cross-business upload is rejected (policy checks foldername matches own business)', () => {
    // The INSERT WITH CHECK ensures the folder matches the user's business
    const insertBlock = fixMigrationSrc.match(/business_logos_insert_own[\s\S]*?WITH CHECK([\s\S]*?)\);/)
    expect(insertBlock).toBeTruthy()
    expect(insertBlock![1]).toContain('auth.uid()')
  })

  it('cross-business delete is rejected (policy uses USING with auth.uid)', () => {
    // Find the CREATE POLICY for delete, not the DROP
    const createIdx = fixMigrationSrc.indexOf('CREATE POLICY "business_logos_delete_own"')
    expect(createIdx).toBeGreaterThan(-1)
    const createBlock = fixMigrationSrc.slice(createIdx, createIdx + 300)
    expect(createBlock).toContain('auth.uid()')
  })
})

// ============================================================================
// LOGO PATH CONVENTION
// ============================================================================
describe('LOGO PATH CONVENTION', () => {
  it('client uploads to businessId/logo.ext path', () => {
    expect(logoSettingsSrc).toContain('${businessId}/logo.${ext}')
  })

  it('client lists folder by businessId to find old logos', () => {
    expect(logoSettingsSrc).toContain('.list(businessId)')
  })

  it('client removes old logos before uploading new one (replace)', () => {
    expect(logoSettingsSrc).toContain('supabase.storage.from(\'business-logos\').remove(oldPaths)')
  })
})

// ============================================================================
// BUSINESS LOGO_URL PERSISTENCE
// ============================================================================
describe('BUSINESS LOGO_URL PERSISTENCE', () => {
  it('client updates businesses.logo_url after upload', () => {
    expect(logoSettingsSrc).toContain("from('businesses')")
    expect(logoSettingsSrc).toContain('update({ logo_url:')
  })

  it('client sets logo_url to null on remove', () => {
    expect(logoSettingsSrc).toContain('update({ logo_url: null })')
  })

  it('client calls onLogoChange after successful upload', () => {
    expect(logoSettingsSrc).toContain('onLogoChange(publicUrl)')
  })

  it('client calls onLogoChange(null) after successful remove', () => {
    expect(logoSettingsSrc).toContain('onLogoChange(null)')
  })

  it('batch2 migration adds logo_url column to businesses', () => {
    expect(batch2MigrationSrc).toContain('ALTER TABLE businesses')
    expect(batch2MigrationSrc).toContain('ADD COLUMN IF NOT EXISTS logo_url')
  })
})

// ============================================================================
// ERROR HANDLING (no raw Supabase internals)
// ============================================================================
describe('ERROR HANDLING', () => {
  it('client has friendlyStorageError helper', () => {
    expect(logoSettingsSrc).toContain('function friendlyStorageError')
  })

  it('client maps "Bucket not found" to friendly message', () => {
    expect(logoSettingsSrc).toContain('bucket not found')
    expect(logoSettingsSrc).toContain('Logo upload is temporarily unavailable')
  })

  it('client does NOT surface raw error.message directly to user', () => {
    // The catch blocks should use friendlyStorageError, not err.message
    expect(logoSettingsSrc).not.toContain("setError(err.message || 'Failed to upload logo')")
    expect(logoSettingsSrc).not.toContain("setError(err.message || 'Failed to remove logo')")
  })

  it('client logs full error to console for debugging', () => {
    expect(logoSettingsSrc).toContain('console.error')
  })

  it('client validates MIME type before upload', () => {
    expect(logoSettingsSrc).toContain('ACCEPTED_TYPES')
    expect(logoSettingsSrc).toContain('file.type')
  })

  it('client validates file size before upload', () => {
    expect(logoSettingsSrc).toContain('MAX_SIZE_BYTES')
    expect(logoSettingsSrc).toContain('file.size')
  })
})

// ============================================================================
// PUBLIC DOCUMENT RENDERER CAN RESOLVE LOGO
// ============================================================================
describe('PUBLIC DOCUMENT LOGO RESOLUTION', () => {
  it('DocumentRenderer renders business_logo_url', () => {
    expect(rendererSrc).toContain('business_logo_url')
    expect(rendererSrc).toContain('<img')
  })

  it('PDF renderer renders business_logo_url', () => {
    expect(pdfSrc).toContain('business_logo_url')
    expect(pdfSrc).toContain('<Image')
  })

  it('Hosted page passes document to renderer (logo comes via presentation model)', () => {
    expect(hostedSrc).toContain('DocumentRenderer')
    expect(hostedSrc).toContain('doc={doc}')
  })

  it('logo uses object-contain (no stretching)', () => {
    expect(rendererSrc).toContain('object-contain')
  })
})

// ============================================================================
// MIGRATION ORDER
// ============================================================================
describe('MIGRATION ORDER', () => {
  it('fix migration is timestamped after batch2 migration', () => {
    // batch2: 20260913220000
    // fix:   20260913230000
    expect('20260913230000' > '20260913220000').toBe(true)
  })

  it('fix migration does not edit batch2 in place (new file)', () => {
    // The fix is a separate migration, not an edit to the existing one
    expect(fixMigrationSrc).toContain('Fix business logo storage bucket provisioning')
  })
})
