/**
 * Settings Layout & Customer Attachments Card Regression Tests
 *
 * Covers:
 * - Settings section ordering (Business Info → Address → Logo → Appearance)
 * - Customer Photos & Attachments card behavior
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const settingsConfigSrc = readSrc('src/lib/settings-config.ts')
const settingsContentSrc = readSrc('src/components/SettingsContent.tsx')
const attachmentsCardSrc = readSrc('src/components/CustomerAttachmentsCard.tsx')
const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

// ============================================================================
// SETTINGS SECTION ORDER
// ============================================================================
describe('SETTINGS SECTION ORDER', () => {
  it('config has Business Information as first section (renamed from General)', () => {
    expect(settingsConfigSrc).toContain("label: 'Business Information'")
  })

  it('config no longer uses "General" label', () => {
    expect(settingsConfigSrc).not.toContain("label: 'General'")
  })

  it('config order: general, business-address, business-logo, appearance', () => {
    const generalIdx = settingsConfigSrc.indexOf("id: 'general'")
    const addressIdx = settingsConfigSrc.indexOf("id: 'business-address'")
    const logoIdx = settingsConfigSrc.indexOf("id: 'business-logo'")
    const appearanceIdx = settingsConfigSrc.indexOf("id: 'appearance'")
    expect(generalIdx).toBeGreaterThan(-1)
    expect(addressIdx).toBeGreaterThan(-1)
    expect(logoIdx).toBeGreaterThan(-1)
    expect(appearanceIdx).toBeGreaterThan(-1)
    expect(generalIdx).toBeLessThan(addressIdx)
    expect(addressIdx).toBeLessThan(logoIdx)
    expect(logoIdx).toBeLessThan(appearanceIdx)
  })

  it('JSX order: general-divider before business-address-divider', () => {
    const generalIdx = settingsContentSrc.indexOf('id="general-divider"')
    const addressIdx = settingsContentSrc.indexOf('id="business-address-divider"')
    expect(generalIdx).toBeGreaterThan(-1)
    expect(addressIdx).toBeGreaterThan(-1)
    expect(generalIdx).toBeLessThan(addressIdx)
  })

  it('JSX order: business-address-divider before business-logo-divider', () => {
    const addressIdx = settingsContentSrc.indexOf('id="business-address-divider"')
    const logoIdx = settingsContentSrc.indexOf('id="business-logo-divider"')
    expect(addressIdx).toBeLessThan(logoIdx)
  })

  it('JSX order: business-logo-divider before appearance-divider', () => {
    const logoIdx = settingsContentSrc.indexOf('id="business-logo-divider"')
    const appearanceIdx = settingsContentSrc.indexOf('id="appearance-divider"')
    expect(logoIdx).toBeLessThan(appearanceIdx)
  })
})

// ============================================================================
// SETTINGS COMPONENTS STILL WIRED
// ============================================================================
describe('SETTINGS COMPONENTS STILL WIRED', () => {
  it('BusinessLogoSettings is still rendered', () => {
    expect(settingsContentSrc).toContain('<BusinessLogoSettings')
  })

  it('ThemeSelector is still rendered', () => {
    expect(settingsContentSrc).toContain('<ThemeSelector')
  })

  it('BusinessLogoSettings uses formBusiness.logo_url with business fallback', () => {
    expect(settingsContentSrc).toContain('formBusiness?.logo_url || business.logo_url')
  })

  it('BusinessLogoSettings uses business.id', () => {
    expect(settingsContentSrc).toContain('businessId={business.id}')
  })

  it('BusinessLogoSettings onLogoChange calls updateBusiness', () => {
    expect(settingsContentSrc).toContain("updateBusiness({ logo_url: url })")
  })

  it('Business Logo divider uses config label (not hardcoded)', () => {
    expect(settingsContentSrc).toContain("settingsSections.find(s => s.id === 'business-logo')?.label")
  })

  it('Business Address divider uses config label', () => {
    expect(settingsContentSrc).toContain("settingsSections.find(s => s.id === 'business-address')?.label")
  })

  it('Appearance divider uses config label', () => {
    expect(settingsContentSrc).toContain("settingsSections.find(s => s.id === 'appearance')?.label")
  })
})

// ============================================================================
// CUSTOMER ATTACHMENTS CARD — COMPONENT
// ============================================================================
describe('ATTACHMENTS CARD COMPONENT', () => {
  it('component exists and exports default', () => {
    expect(attachmentsCardSrc).toContain('export default function CustomerAttachmentsCard')
  })

  it('uses shared Modal for View All', () => {
    expect(attachmentsCardSrc).toContain("from '@/components/ui/Modal'")
  })

  it('uses MessageMedia type', () => {
    expect(attachmentsCardSrc).toContain("from '@/lib/types'")
    expect(attachmentsCardSrc).toContain('MessageMedia')
  })

  it('hides card when no attachments (returns null)', () => {
    expect(attachmentsCardSrc).toContain('if (allAttachments.length === 0) return null')
  })

  it('shows attachment count', () => {
    expect(attachmentsCardSrc).toContain('attachments')
  })

  it('uses object-cover for thumbnails (no distortion)', () => {
    expect(attachmentsCardSrc).toContain('object-cover')
  })

  it('uses PREVIEW_LIMIT for threshold', () => {
    expect(attachmentsCardSrc).toContain('PREVIEW_LIMIT')
  })

  it('shows View All when above threshold', () => {
    expect(attachmentsCardSrc).toContain('View All')
  })

  it('View All opens shared Modal', () => {
    expect(attachmentsCardSrc).toContain('showAllModal')
    expect(attachmentsCardSrc).toContain('<Modal')
  })

  it('Modal renders centered on mobile (no bottom sheet)', () => {
    // Physical QA: attachments grid must open as a centered modal, not a
    // bottom sheet pinned to the screen edge.
    expect(attachmentsCardSrc).not.toContain('bottomSheetOnMobile')
  })

  it('Modal has contentMaxHeight for internal scroll', () => {
    expect(attachmentsCardSrc).toContain('contentMaxHeight')
  })

  it('image click opens expanded lightbox', () => {
    expect(attachmentsCardSrc).toContain('expandedImage')
    expect(attachmentsCardSrc).toContain('setExpandedImage')
  })

  it('non-image attachments show file icon and type label', () => {
    expect(attachmentsCardSrc).toContain('getFileIcon')
    expect(attachmentsCardSrc).toContain('getFileTypeLabel')
  })

  it('deduplicates by media.id or media_url+message_id', () => {
    expect(attachmentsCardSrc).toContain('dedupeMedia')
    expect(attachmentsCardSrc).toContain('item.media.id')
    expect(attachmentsCardSrc).toContain('item.media.media_url')
  })

  it('sorts newest message first', () => {
    expect(attachmentsCardSrc).toContain('tb - ta')
  })

  it('uses secure media URL proxy for Twilio URLs', () => {
    expect(attachmentsCardSrc).toContain('getSecureUrl')
    expect(attachmentsCardSrc).toContain('/api/twilio/media')
  })

  it('fetches authenticated blob URLs for secure media', () => {
    expect(attachmentsCardSrc).toContain('Authorization')
    expect(attachmentsCardSrc).toContain('Bearer')
    expect(attachmentsCardSrc).toContain('createObjectURL')
  })

  it('cleans up blob URLs on unmount', () => {
    expect(attachmentsCardSrc).toContain('revokeObjectURL')
  })

  it('does NOT include upload/drag-drop/delete controls', () => {
    expect(attachmentsCardSrc).not.toContain('Upload')
    expect(attachmentsCardSrc).not.toContain('drag')
    expect(attachmentsCardSrc).not.toContain('drop')
    expect(attachmentsCardSrc).not.toContain('Delete')
  })
})

// ============================================================================
// ATTACHMENTS CARD — PAGE INTEGRATION
// ============================================================================
describe('ATTACHMENTS CARD PAGE INTEGRATION', () => {
  it('page-client imports CustomerAttachmentsCard', () => {
    expect(pageClientSrc).toContain("import CustomerAttachmentsCard from '@/components/CustomerAttachmentsCard'")
  })

  it('desktop sidebar renders CustomerAttachmentsCard after CustomerDetails', () => {
    const detailsIdx = pageClientSrc.indexOf('<CustomerDetails')
    const attachmentsIdx = pageClientSrc.indexOf('<CustomerAttachmentsCard')
    expect(detailsIdx).toBeGreaterThan(-1)
    expect(attachmentsIdx).toBeGreaterThan(-1)
    expect(detailsIdx).toBeLessThan(attachmentsIdx)
  })

  it('desktop sidebar renders CustomerAttachmentsCard before AI Summary', () => {
    const attachmentsIdx = pageClientSrc.indexOf('<CustomerAttachmentsCard')
    const aiSummaryIdx = pageClientSrc.indexOf('AI Summary')
    expect(attachmentsIdx).toBeLessThan(aiSummaryIdx)
  })

  it('passes leadData.messages to the card', () => {
    expect(pageClientSrc).toContain('messages={leadData.messages}')
  })

  it('card is conditionally rendered only when messages exist', () => {
    expect(pageClientSrc).toContain('leadData?.messages &&')
  })
})

// ============================================================================
// ATTACHMENTS CARD — DATA SOURCE (no new tables/endpoints)
// ============================================================================
describe('ATTACHMENTS CARD DATA SOURCE', () => {
  it('uses existing message.media array (no new fetch)', () => {
    expect(attachmentsCardSrc).toContain('msg.media')
    expect(attachmentsCardSrc).toContain('Array.isArray(msg.media)')
  })

  it('does not create new API endpoint or table', () => {
    expect(attachmentsCardSrc).not.toContain('fetch(\'/api/attachments')
    expect(attachmentsCardSrc).not.toContain('fetch(\'/api/customer-attachments')
    expect(attachmentsCardSrc).not.toContain('fetch(\'/api/photos')
  })

  it('does not import any new migration or schema', () => {
    // The card is purely a UI component that reads existing data
    expect(attachmentsCardSrc).not.toContain('supabase/migrations')
    expect(attachmentsCardSrc).not.toContain('CREATE TABLE')
  })
})

// ============================================================================
// RECURRING JOBS AUDIT (report only, no implementation)
// ============================================================================
describe('RECURRING JOBS AUDIT', () => {
  it('no rrule library in package.json', () => {
    const pkg = readSrc('package.json')
    expect(pkg).not.toContain('"rrule"')
    expect(pkg).not.toContain('"node-cron"')
    expect(pkg).not.toContain('"node-schedule"')
  })

  it('jobs table has no recurrence columns', () => {
    const jobsMigration = readFileSync(
      join(repoRoot, 'supabase/migrations/20260731000000_create_jobs_table.sql'),
      'utf8'
    ).replace(/\r\n/g, '\n')
    expect(jobsMigration).not.toContain('recurrence')
    expect(jobsMigration).not.toContain('rrule')
    expect(jobsMigration).not.toContain('recurring')
  })
})
