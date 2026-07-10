import AnalyticsContent from './AnalyticsContent'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AnalyticsPage() {
  console.log('[Analytics Page] Rendering with latest code')
  return <AnalyticsContent />
}
