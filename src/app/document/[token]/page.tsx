import HostedDocumentPage from '@/components/billing/HostedDocumentPage'

export const dynamic = 'force-dynamic'

export default function DocumentPage({ params }: { params: Promise<{ token: string }> }) {
  return <HostedDocumentPageWrapper params={params} />
}

async function HostedDocumentPageWrapper({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <HostedDocumentPage token={token} />
}
