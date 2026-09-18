import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClient = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')
const aiCallDetails = readFileSync('src/components/AICallDetails.tsx', 'utf8').replace(/\r\n/g, '\n')
const voicemailSummary = readFileSync('src/components/VoicemailSummary.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Customer edit button placement', () => {
  it('has a global Edit Customer action in the page header', () => {
    expect(pageClient).toContain("aria-label=\"Edit customer\"")
    expect(pageClient).toContain('setShowEditCustomer(true)')
  })

  it('does not have a redundant lower edit control in the AI Intake Customer Details card', () => {
    expect(aiCallDetails).not.toContain('aria-label="Edit customer details"')
  })

  it('does not have a redundant lower edit control in the Voicemail Summary Customer Details card', () => {
    expect(voicemailSummary).not.toContain('aria-label="Edit customer details"')
  })
})
