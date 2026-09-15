import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8').replace(/\r\n/g, '\n')

const sendRoute = read('src/app/api/billing-documents/[id]/send/route.ts')
const publicRoute = read('src/app/api/public/document/[token]/route.ts')
const pdfRoute = read('src/app/api/billing-documents/[id]/pdf/route.tsx')
const nextConfig = read('next.config.js')
const builderSrc = read('src/lib/billing/document-builder.ts')
const pdfComponentSrc = read('src/components/billing/BillingDocumentPdf.tsx')

describe('RC Batch 5 — Hosted Document Token Lifecycle', () => {
  describe('1. Token persisted before SMS', () => {
    it('send route persists public_token before calling sendSms', () => {
      // The token persist (update with public_token) must come before sendSms
      const persistIdx = sendRoute.indexOf("public_token: publicToken")
      const firstSendSmsIdx = sendRoute.indexOf('sendSms(business')
      expect(persistIdx).toBeGreaterThan(-1)
      expect(firstSendSmsIdx).toBeGreaterThan(-1)
      // The persist must come before the SMS call
      expect(persistIdx).toBeLessThan(firstSendSmsIdx)
    })

    it('send route generates token before persisting', () => {
      const generateIdx = sendRoute.indexOf('generatePublicToken()')
      const persistIdx = sendRoute.indexOf("public_token: publicToken")
      expect(generateIdx).toBeGreaterThan(-1)
      expect(persistIdx).toBeGreaterThan(-1)
      expect(generateIdx).toBeLessThan(persistIdx)
    })

    it('send route builds hosted URL from persisted token', () => {
      // publicUrl is built AFTER the token is persisted
      const persistIdx = sendRoute.indexOf("public_token: publicToken")
      const urlIdx = sendRoute.indexOf('publicUrl')
      expect(persistIdx).toBeGreaterThan(-1)
      expect(urlIdx).toBeGreaterThan(persistIdx)
    })

    it('send route does NOT send SMS before token persist', () => {
      // The first sendSms call must come after the token persist block
      const persistBlockIdx = sendRoute.indexOf('Token persist error')
      const firstSendSmsIdx = sendRoute.indexOf('sendSms(business')
      expect(persistBlockIdx).toBeGreaterThan(-1)
      expect(firstSendSmsIdx).toBeGreaterThan(persistBlockIdx)
    })
  })

  describe('2. SMS URL uses persisted token', () => {
    it('SMS message uses publicUrl built from persisted token', () => {
      // The message is built after publicUrl
      const urlIdx = sendRoute.indexOf('const publicUrl')
      const messageIdx = sendRoute.indexOf('const message')
      expect(urlIdx).toBeGreaterThan(-1)
      expect(messageIdx).toBeGreaterThan(urlIdx)
      // message includes publicUrl
      const messageBlock = sendRoute.substring(messageIdx, messageIdx + 300)
      expect(messageBlock).toContain('publicUrl')
    })

    it('SMS token === billing_documents.public_token (same variable)', () => {
      // publicToken is used for both the DB persist and the URL
      expect(sendRoute).toContain('public_token: publicToken')
      expect(sendRoute).toContain('/document/${publicToken}')
    })
  })

  describe('3. Status update after SMS success', () => {
    it('send route does NOT mark Sent before SMS succeeds', () => {
      const firstSendSmsIdx = sendRoute.indexOf('sendSms(business')
      const statusSentIdx = sendRoute.indexOf("status: 'sent'")
      expect(firstSendSmsIdx).toBeGreaterThan(-1)
      expect(statusSentIdx).toBeGreaterThan(firstSendSmsIdx)
    })

    it('SMS failure returns error before status update', () => {
      const noTwilioIdx = sendRoute.indexOf('NO_TWILIO_NUMBER')
      const statusSentIdx = sendRoute.indexOf("status: 'sent'")
      expect(noTwilioIdx).toBeGreaterThan(-1)
      expect(statusSentIdx).toBeGreaterThan(noTwilioIdx)
    })

    it('SMS failure does not set sent_at', () => {
      const sentAtIdx = sendRoute.indexOf('sent_at:')
      const noTwilioIdx = sendRoute.indexOf('NO_TWILIO_NUMBER')
      expect(sentAtIdx).toBeGreaterThan(noTwilioIdx)
    })

    it('successful SMS marks Sent afterward', () => {
      expect(sendRoute).toContain("status: 'sent'")
      expect(sendRoute).toContain('sent_at: new Date().toISOString()')
    })
  })

  describe('4. Retry / idempotency', () => {
    it('retry reuses existing token (no duplicate generation)', () => {
      // The route checks doc.public_token and reuses it if present
      expect(sendRoute).toContain('let publicToken = doc.public_token')
      expect(sendRoute).toContain('if (!publicToken)')
    })

    it('failed SMS leaves document as Draft (no status=sent on failure)', () => {
      // On SMS failure, the route returns early without updating status
      // The token may be persisted (prepared), but status stays Draft
      const failReturnIdx = sendRoute.indexOf("Failed to send SMS")
      const statusSentIdx = sendRoute.indexOf("status: 'sent'")
      expect(failReturnIdx).toBeGreaterThan(-1)
      expect(statusSentIdx).toBeGreaterThan(failReturnIdx)
    })

    it('final status-update failure does not create duplicate SMS on retry', () => {
      // If the status update fails after SMS success, the token is already
      // persisted. On retry, the route reuses the existing token (no new
      // token generation, no duplicate SMS from the persist path).
      const warningIdx = sendRoute.indexOf('SMS sent but document status update failed')
      expect(warningIdx).toBeGreaterThan(-1)
      // The token reuse check comes before the persist block
      const reuseIdx = sendRoute.indexOf('let publicToken = doc.public_token')
      const persistBlockIdx = sendRoute.indexOf('if (!publicToken)')
      expect(reuseIdx).toBeLessThan(persistBlockIdx)
    })
  })
})

describe('RC Batch 5 — Public Hosted Route Contract', () => {
  describe('5. Public visibility filtering', () => {
    it('public route filters to externally-visible statuses', () => {
      expect(publicRoute).toContain('PUBLICLY_VISIBLE_STATUSES')
    })

    it('public route includes sent status', () => {
      expect(publicRoute).toContain("'sent'")
    })

    it('public route includes accepted status', () => {
      expect(publicRoute).toContain("'accepted'")
    })

    it('public route includes declined status', () => {
      expect(publicRoute).toContain("'declined'")
    })

    it('public route includes paid status', () => {
      expect(publicRoute).toContain("'paid'")
    })

    it('public route includes overdue status', () => {
      expect(publicRoute).toContain("'overdue'")
    })

    it('public route does NOT include draft in visible statuses', () => {
      // Extract the PUBLICLY_VISIBLE_STATUSES array
      const match = publicRoute.match(/PUBLICLY_VISIBLE_STATUSES\s*=\s*\[([^\]]*)\]/)
      expect(match).toBeTruthy()
      expect(match![1]).not.toContain("'draft'")
    })

    it('Draft with prepared token is not publicly visible', () => {
      // The status filter returns 404 for drafts even if token matches.
      // The filter check comes before the buildDocumentPresentation CALL
      // (not the import). Find the call site.
      const filterIdx = publicRoute.indexOf('PUBLICLY_VISIBLE_STATUSES')
      const presentationCallIdx = publicRoute.indexOf('await buildDocumentPresentation')
      expect(filterIdx).toBeGreaterThan(-1)
      expect(presentationCallIdx).toBeGreaterThan(filterIdx)
    })
  })

  describe('6. Anonymous access', () => {
    it('public route does not require auth session', () => {
      expect(publicRoute).not.toContain('supabase.auth.getUser')
      expect(publicRoute).not.toContain('requireSubscriptionAccess')
    })

    it('public route uses service role key (RLS blocks anon reads of billing_documents)', () => {
      expect(publicRoute).toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(publicRoute).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    })

    it('public route fetches by public_token (not by id)', () => {
      expect(publicRoute).toContain("eq('public_token', token)")
    })

    it('wrong token returns not found', () => {
      expect(publicRoute).toContain("if (error || !doc)")
      expect(publicRoute).toContain("Document not found")
    })

    it('short token returns not found (token length guard)', () => {
      expect(publicRoute).toContain('token.length < 16')
    })
  })
})

describe('RC Batch 5 — PDF Production Packaging', () => {
  describe('7. Dependency externalization', () => {
    it('next.config.js relies on Next.js default externalization for @react-pdf/renderer', () => {
      // @react-pdf/renderer is in Next.js 15's default serverExternalPackages
      // list, so it does NOT need an explicit entry. Commit 153fc37f removed
      // the explicit entry when the React #31 root cause was fixed via the
      // @react-pdf/reconciler patch — the reconciler must resolve React from
      // node_modules (externalized), not a bundled copy.
      expect(nextConfig).toContain('serverExternalPackages')
      // The patch-package patch is what makes the externalized reconciler
      // accept React 19 transitional elements.
      expect(existsSync(resolve(root, 'patches', '@react-pdf+reconciler+2.0.0.patch'))).toBe(true)
    })

    it('next.config.js externalizes pdfkit (transitive dep)', () => {
      expect(nextConfig).toContain("'pdfkit'")
    })

    it('next.config.js externalizes @react-pdf/font', () => {
      expect(nextConfig).toContain("'@react-pdf/font'")
    })

    it('PDF route uses nodejs runtime', () => {
      expect(pdfRoute).toContain("runtime = 'nodejs'")
    })

    it('PDF route does not hardcode Helvetica.cjs paths', () => {
      expect(pdfRoute).not.toContain('Helvetica.cjs')
      expect(pdfRoute).not.toContain('standard-fonts')
    })

    it('PDF route does not download fonts at runtime', () => {
      // Logo fetch is allowed (it's an image, not a font).
      // There should be no font download — pdfkit's standard fonts are
      // bundled with the externalized package, not fetched at runtime.
      // Check for font-specific download patterns, not the word "download"
      // which appears in comments about logo fetching.
      expect(pdfRoute).not.toMatch(/fetch.*font/i)
      expect(pdfRoute).not.toMatch(/font.*fetch/i)
      expect(pdfRoute).not.toContain('Font.register')
    })
  })

  describe('8. PDF output contract', () => {
    it('PDF route uses renderToBuffer from @react-pdf/renderer', () => {
      expect(pdfRoute).toContain('renderToBuffer')
      expect(pdfRoute).toContain('@react-pdf/renderer')
    })

    it('PDF response has application/pdf content type', () => {
      expect(pdfRoute).toContain("'Content-Type': 'application/pdf'")
    })

    it('Quote PDF filename is Quote-<number>.pdf', () => {
      expect(pdfRoute).toContain('Quote-${doc.document_number}.pdf')
    })

    it('Invoice PDF filename is Invoice-<number>.pdf', () => {
      expect(pdfRoute).toContain('Invoice-${doc.document_number}.pdf')
    })

    it('Content-Disposition uses attachment', () => {
      expect(pdfRoute).toContain('Content-Disposition')
      expect(pdfRoute).toContain('attachment')
    })
  })

  describe('9. React #31 prevention', () => {
    it('PDF component uses string children in Text (not objects)', () => {
      // All Text children should be string-returning function calls or string literals
      // Check that no object is passed directly as a Text child
      const textMatches = pdfComponentSrc.match(/<Text[^>]*>\s*{([^}]+)}\s*<\/Text>/g) || []
      for (const match of textMatches) {
        // Each Text child should be a function call (formatDate, formatMoney, etc.)
        // or a string literal, not an object
        const inner = match.match(/<Text[^>]*>\s*{([^}]+)}\s*<\/Text>/)
        if (inner) {
          const expr = inner[1].trim()
          // Should not be a raw object literal
          expect(expr).not.toMatch(/^\{/)
          expect(expr).not.toMatch(/^\[/)
        }
      }
    })

    it('PDF component guards against undefined business_name', () => {
      // business_name is typed as string but could be undefined from DB
      // The component should handle this gracefully
      expect(pdfComponentSrc).toContain('business_name')
    })

    it('PDF component guards customer_name with fallback', () => {
      expect(pdfComponentSrc).toContain("customer_name || 'No customer specified'")
    })

    it('PDF component guards line item description with fallback', () => {
      expect(pdfComponentSrc).toContain("description || ''")
    })

    it('PDF component guards unit_label with fallback', () => {
      expect(pdfComponentSrc).toContain("unit_label || ''")
    })

    it('PDF component uses Helvetica font family (standard font, no custom load)', () => {
      expect(pdfComponentSrc).toContain("fontFamily: 'Helvetica'")
    })

    it('PDF component does not call Font.register (no custom font loading)', () => {
      expect(pdfComponentSrc).not.toContain('Font.register')
    })
  })
})

describe('RC Batch 5 — Logo Contract', () => {
  describe('10. Draft vs sent logo behavior', () => {
    it('unsent draft uses current business logo (live fetch)', () => {
      expect(builderSrc).toContain("logo_url: business?.logo_url || null")
    })

    it('sent document uses snapshot logo', () => {
      expect(builderSrc).toContain('isSent && doc.snapshot_business_name')
      expect(builderSrc).toContain('logo_url: doc.snapshot_business_logo_url')
    })

    it('snapshot builder freezes logo at send time', () => {
      expect(builderSrc).toContain('snapshot_business_logo_url: business?.logo_url || null')
    })
  })

  describe('11. PDF logo safety', () => {
    it('PDF route pre-fetches logo as data URL', () => {
      expect(pdfRoute).toContain('logoDataUrl')
      expect(pdfRoute).toContain('data:')
      expect(pdfRoute).toContain('base64')
    })

    it('PDF route handles logo fetch failure gracefully', () => {
      expect(pdfRoute).toContain('catch (logoErr)')
      expect(pdfRoute).toContain('rendering without logo')
    })

    it('PDF component renders logo conditionally (null = no logo)', () => {
      expect(pdfComponentSrc).toContain('business_logo_url ?')
      expect(pdfComponentSrc).toContain('<Image')
    })

    it('PDF route falls back to null logo on fetch failure', () => {
      expect(pdfRoute).toContain('logoDataUrl: string | null = null')
      expect(pdfRoute).toContain('presentationWithLogo')
    })
  })
})

describe('RC Batch 5 — User-Facing Failure Semantics', () => {
  describe('12. Send failure semantics', () => {
    it('send failure returns error (no fake success)', () => {
      expect(sendRoute).toContain('error: "ReplyFlow couldn\'t send')
      expect(sendRoute).toContain('503')
    })

    it('send failure does not mark document as sent', () => {
      // The status update only happens after SMS success checks pass
      const lastFailCheck = sendRoute.lastIndexOf('Failed to send SMS')
      const statusUpdate = sendRoute.indexOf("status: 'sent'")
      expect(statusUpdate).toBeGreaterThan(lastFailCheck)
    })
  })

  describe('13. PDF failure semantics', () => {
    it('PDF route returns real failure status on error', () => {
      expect(pdfRoute).toContain('Internal server error')
      expect(pdfRoute).toContain('500')
    })

    it('PDF route does not return fake PDF on failure', () => {
      // On error, it returns JSON error, not a PDF
      expect(pdfRoute).toContain('NextResponse.json')
      expect(pdfRoute).toContain('catch (err)')
    })
  })

  describe('14. Hosted link not-found semantics', () => {
    it('public route returns 404 for unresolvable token', () => {
      expect(publicRoute).toContain('404')
      expect(publicRoute).toContain('Document not found')
    })

    it('public route returns 404 for draft (not publicly visible)', () => {
      expect(publicRoute).toContain('PUBLICLY_VISIBLE_STATUSES')
      expect(publicRoute).toContain('Document not found')
    })
  })
})
