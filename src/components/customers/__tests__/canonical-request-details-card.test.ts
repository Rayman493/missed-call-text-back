/**
 * Single canonical Request model — current Customer Context surfaces must not
 * render a standalone Details card/row. AI Intake keeps ALL caller-provided
 * request context in the canonical Request (serviceRequested/reasonForCalling);
 * a separate Details row only exists for legacy historical viewers
 * (RequestDetailsModal) and manual customer editing surfaces.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Canonical Request — no standalone Details card in current Customer Context', () => {
  it('CustomerDetails.tsx renders no Details card', () => {
    const src = readFileSync(join(__dirname, '../../CustomerDetails.tsx'), 'utf8')
    expect(src).not.toContain("renderField('Details'")
    expect(src).not.toContain("{renderField('Details'")
    // Reason for Calling card still renders — canonical Request surface
    expect(src).toContain("renderField('Reason for Calling'")
  })

  it('CustomerContextDisclosure.tsx renders no Details row', () => {
    const src = readFileSync(join(__dirname, '../CustomerContextDisclosure.tsx'), 'utf8')
    expect(src).not.toContain("label: 'Details'")
    // Reason for calling row still renders
    expect(src).toContain("label: 'Reason for calling'")
  })

  it('AICallDetails renders the canonical Request — no compact-title card, no standalone Details card', () => {
    const src = readFileSync(join(__dirname, '../../AICallDetails.tsx'), 'utf8')
    // No standalone Details label in the unified intake fields.
    expect(src).not.toContain('>Details</span>')
    // Request card present and sourced from the canonical request — the
    // compact display title must never render as the authoritative Request
    // inside the intake details view. Label matches desktop Customer Context.
    expect(src).toContain('>Reason for Calling</span>')
    expect(src).not.toContain('getLeadRequestTitle')
    // Completeness indicator must not require a legacy details field.
    expect(src).not.toContain('hasDetails')
    // Canonical request still resolves through the canonical intake helper.
    expect(src).toContain('intake.serviceRequested')
    // Manual corrections and legacy details still readable for compatibility.
    expect(src).toContain('correctedFields?.serviceRequested')
    expect(src).toContain('extractedInfo?.importantDetails')
  })

  it('RequestDetailsModal keeps legacy historical Details read path', () => {
    const src = readFileSync(join(__dirname, '../../RequestDetailsModal.tsx'), 'utf8')
    // Historical records may carry a separate Details value — the legacy
    // viewer must keep reading it.
    expect(src).toContain('additionalDetails')
  })
})

describe('AI Intake Details — desktop Customer Context parity', () => {
  const aiSrc = readFileSync(join(__dirname, '../../AICallDetails.tsx'), 'utf8')
  const desktopSrc = readFileSync(join(__dirname, '../../CustomerDetails.tsx'), 'utf8')

  it('mobile AI Intake field labels match desktop Customer Context terminology', () => {
    expect(aiSrc).toContain('>Customer Name</span>')
    expect(aiSrc).toContain('>Reason for Calling</span>')
    expect(aiSrc).toContain('>Location</span>')
    expect(aiSrc).toContain('>Desired Completion Time</span>')
    expect(aiSrc).toContain('>Preferred Callback Time</span>')
    // Desktop Customer Context keeps the same labels.
    expect(desktopSrc).toContain("renderField('Customer Name'")
    expect(desktopSrc).toContain("renderField('Reason for Calling'")
    expect(desktopSrc).toContain("renderField('Location'")
    expect(desktopSrc).toContain("renderField('Desired Completion Time'")
    expect(desktopSrc).toContain("renderField('Preferred Callback Time'")
  })

  it('mobile field cards reuse the desktop card surface conventions', () => {
    const aiCard = aiSrc.match(/\{\/\* Canonical Request[\s\S]*?\{\/\* Address - only show/)?.[0]
    expect(aiCard).toBeTruthy()
    // Same surface tokens as desktop renderField:
    // rounded-lg border-border/25 bg-background/25 px-4 py-2, mb-1.5 label row,
    // pl-6 break-words value, shared empty-state copy.
    expect(desktopSrc).toContain('rounded-lg border border-border/25 bg-background/25 px-4 py-2')
    expect(aiCard).toContain('rounded-lg border border-border/25 bg-background/25 px-4 py-2')
    expect(aiCard).toContain('mb-1.5')
    expect(aiCard).toContain('pl-6')
    expect(aiCard).toContain('break-words')
    expect(aiCard).toContain('No information yet')
    // Field stack spacing matches desktop space-y-3.
    expect(aiSrc).toContain('className="space-y-3"')
    expect(desktopSrc).toContain('className="space-y-3"')
  })

  it('canonical Request stays full-text with wrap and expand/collapse intact', () => {
    const aiCard = aiSrc.match(/\{\/\* Canonical Request[\s\S]*?\{\/\* Address - only show/)?.[0]
    expect(aiCard).toBeTruthy()
    // Full canonical request — never the compact title — with long-text safety.
    expect(aiCard).toContain('serviceRequested')
    expect(aiCard).toContain('whitespace-pre-line break-words')
    expect(aiCard).toContain('setDetailsExpanded')
    expect(aiCard).toContain('> 200')
    expect(aiCard).toContain('substring(0, 200)')
  })
})
