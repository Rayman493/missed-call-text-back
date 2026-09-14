import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { buildDocumentPresentation } from '@/lib/billing/document-builder'
import { renderToBuffer } from '@react-pdf/renderer'
import { BillingDocumentPdf } from '@/components/billing/BillingDocumentPdf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/billing-documents/[id]/pdf
 * Download a PDF of the billing document.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: (authResult as any).error || 'Access denied' }, { status: (authResult as any).statusCode || 403 })
    }
    const business = authResult.business

    const { data: doc, error } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*)
      `)
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const presentation = await buildDocumentPresentation(supabase, doc)
    const pdfBuffer = await renderToBuffer(<BillingDocumentPdf doc={presentation} />)

    const isQuote = doc.document_type === 'quote'
    const filename = isQuote
      ? `Quote-${doc.document_number}.pdf`
      : `Invoice-${doc.document_number}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[BILLING PDF] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
