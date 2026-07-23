import LeadDetailPage from './page-client'

export default async function LeadDetailPageWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LeadDetailPage params={{ id }} />
}
