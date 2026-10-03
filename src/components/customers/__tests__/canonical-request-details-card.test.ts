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
    // inside the intake details view.
    expect(src).toContain('>Request</span>')
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
