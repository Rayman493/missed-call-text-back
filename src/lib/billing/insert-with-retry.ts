/**
 * Defensive retry for billing document inserts that hit the unique
 * constraint on (business_id, document_type, document_number).
 *
 * If the allocator is hardened (self-healing against MAX), this should
 * never fire. It exists as a safety net for edge cases like a document
 * created via service-role SQL while the counter was locked.
 *
 * Only retries once, only for the exact document_number constraint.
 */

const UNIQUE_CONSTRAINT_FRAGMENT = 'billing_documents_business_id_document_type_document_number'

export async function insertBillingDocumentWithRetry(
  supabase: any,
  payload: Record<string, any>,
  businessId: string,
  documentType: 'quote' | 'invoice',
): Promise<{ doc: any; error: any }> {
  let { data: doc, error } = await supabase
    .from('billing_documents')
    .insert(payload)
    .select()
    .single()

  if (
    error?.code === '23505' &&
    error?.message?.includes(UNIQUE_CONSTRAINT_FRAGMENT)
  ) {
    // Re-allocate a fresh canonical number and retry once
    const { data: freshNumber } = await supabase.rpc(
      'assign_billing_document_number',
      { p_business_id: businessId, p_document_type: documentType }
    )
    if (freshNumber) {
      const retry = await supabase
        .from('billing_documents')
        .insert({ ...payload, document_number: freshNumber })
        .select()
        .single()
      doc = retry.data
      error = retry.error
    }
  }

  return { doc, error }
}
