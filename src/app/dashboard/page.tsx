import DashboardContent from './DashboardContent'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  )
}
