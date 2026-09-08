/**
 * Payment request reconciliation utilities.
 *
 * Payment request cards flicker when a fresh refetch returns a list that does
 * not yet include the optimistically inserted request. Merging by stable ID
 * preserves known-successful records while still allowing authoritative server
 * updates to overwrite their matching IDs.
 */

export interface PaymentRequestLike {
  id: string
  created_at?: string | null
  [key: string]: any
}

export function mergePaymentRequests(
  existing: PaymentRequestLike[] | undefined | null,
  incoming: PaymentRequestLike[] | undefined | null
): PaymentRequestLike[] {
  const existingMap = new Map<string, PaymentRequestLike>((existing || []).map(pr => [pr.id, pr]))

  for (const pr of incoming || []) {
    if (pr?.id) {
      existingMap.set(pr.id, pr)
    }
  }

  return Array.from(existingMap.values()).sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return aTime - bTime
  })
}

export function reconcileLeadData(prev: any, next: any): any {
  if (!next) return prev
  if (!prev) return next

  return {
    ...next,
    paymentRequests: mergePaymentRequests(prev.paymentRequests, next.paymentRequests)
  }
}
