/**
 * Pure helper for merging realtime ai_call_records updates into the local
 * leads array used by the Customers/Leads preview list.
 *
 * Keeps the merge logic testable and stable-ID based so the preview card
 * updates in place without duplication or flicker.
 */
export function mergeAICallRecordIntoLeads(leads: any[], aiCallRecord: any): any[] {
  if (!aiCallRecord?.lead_id) return leads

  return leads.map(lead => {
    if (lead.id !== aiCallRecord.lead_id) return lead

    const existingRecords = lead.ai_call_records || lead.aiCallRecords || []
    const recordIndex = existingRecords.findIndex((r: any) => r.id === aiCallRecord.id)

    const mergedRecords = recordIndex >= 0
      ? existingRecords.map((r: any) => r.id === aiCallRecord.id ? { ...r, ...aiCallRecord } : r)
      : [...existingRecords, aiCallRecord]

    const sortedRecords = mergedRecords.sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )

    return { ...lead, ai_call_records: sortedRecords, aiCallRecords: sortedRecords }
  })
}
