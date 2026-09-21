import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const cardContent = readFileSync('src/components/CallTranscriptCard.tsx', 'utf8')
const aiCallDetailsContent = readFileSync('src/components/AICallDetails.tsx', 'utf8')
const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

describe('CallTranscriptCard shared component', () => {
  it('renders nothing when transcript is empty', () => {
    expect(cardContent).toContain('return null')
    expect(cardContent).toContain('!Array.isArray(transcript)')
  })

  it('exposes expand/collapse with aria-expanded', () => {
    expect(cardContent).toContain('aria-expanded={transcriptExpanded}')
    expect(cardContent).toContain('setTranscriptExpanded(!transcriptExpanded)')
  })

  it('uses the same canonical transcript rendering as mobile AI Intake', () => {
    expect(aiCallDetailsContent).toContain('import { CallTranscriptCard }')
    expect(aiCallDetailsContent).toContain('<CallTranscriptCard transcript={normalizedTranscript} />')
  })

  it('is mounted in the desktop customer-context sidebar', () => {
    expect(pageClientContent).toContain('import { CallTranscriptCard }')
    expect(pageClientContent).toContain('normalizeAITranscript')
    expect(pageClientContent).toContain('<CallTranscriptCard transcript={transcript} />')
  })

  it('preserves the legacy caller-only warning', () => {
    expect(cardContent).toContain('Full turn-by-turn transcript unavailable for this call')
  })
})
