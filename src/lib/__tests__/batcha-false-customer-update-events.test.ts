import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const smsProcessingSrc = readFileSync('src/lib/sms-processing.ts', 'utf8').replace(/\r\n/g, '\n')
const leadsRouteSrc = readFileSync('src/app/api/leads/[id]/route.ts', 'utf8').replace(/\r\n/g, '\n')
const pageClientSrc = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Batch A — no false "Customer information updated" events', () => {
  describe('Manual customer edits stamp correction metadata only on real change', () => {
    it('same-value save does not write customer_corrected_info', () => {
      // The simple-update branch only enters the correction spread when
      // changedCount > 0, so same-value PATCHes leave the flag untouched.
      expect(leadsRouteSrc).toMatch(/changedCount\s*>\s*0\s*\?\s*\{[\s\S]*?customer_corrected_info:\s*true/)
    })

    it('raw_metadata patch only stamps customer_corrected_info when changedCount > 0', () => {
      // The raw_metadata branch uses a conditional spread for correction flags.
      expect(leadsRouteSrc).toMatch(/\(changedCount\s*>\s*0\s*\?\s*\{[\s\S]*?customer_corrected_info:\s*true[\s\S]*?\}\s*:\s*\{\}\)/)
    })

    it('response reports whether a meaningful change occurred', () => {
      expect(leadsRouteSrc).toContain('return NextResponse.json({ lead: updatedLead, changed: changedCount > 0 })')
    })
  })

  describe('SMS processing never mints a customer-information-updated event', () => {
    it('SMS merge path only assigns updatedMetadata to enrichedMetadata', () => {
      // The merge path now stores only updatedMetadata (extracted_info etc.)
      // and explicitly avoids promoting SMS corrections into corrected_fields.
      const mergeBlock = smsProcessingSrc.match(/const enrichedMetadata = updatedMetadata[\s\S]*?const mergedLeadUpdatePayload: any = \{ raw_metadata: enrichedMetadata \}/)?.[0] || ''
      expect(mergeBlock).not.toMatch(/customer_corrected_info\s*:/)
      expect(mergeBlock).not.toMatch(/corrected_fields\s*:/)
      expect(mergeBlock).not.toMatch(/corrections_count\s*:/)
      expect(mergeBlock).toContain('const enrichedMetadata = updatedMetadata')
    })

    it('AI SMS correction object only contains currentMetadata + extracted_info', () => {
      // The correctedMetadata object for AI corrections is intentionally limited
      // to currentMetadata + extracted_info.
      const aiCorrectionBlock = smsProcessingSrc.match(/const correctedMetadata = \{\s*\.\.\.currentMetadata,\s*extracted_info:\s*correctedExtractedInfo\s*\}/)?.[0] || ''
      expect(aiCorrectionBlock).not.toMatch(/customer_corrected_info\s*:/)
      expect(aiCorrectionBlock).not.toMatch(/corrected_fields\s*:/)
      expect(aiCorrectionBlock).not.toMatch(/corrections_count\s*:/)
      expect(aiCorrectionBlock).toContain('...currentMetadata')
      expect(aiCorrectionBlock).toContain('extracted_info: correctedExtractedInfo')
    })
  })

  describe('Timeline divider is only gated on correction metadata', () => {
    it('still renders a single correction divider when metadata is truthy', () => {
      expect(pageClientSrc).toContain('id: `correction-${leadData.id}`')
      expect(pageClientSrc).toContain('Customer information updated')
    })
  })
})
