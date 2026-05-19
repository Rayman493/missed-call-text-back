export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-200 text-lg">Loading ReplyFlow...</p>
      </div>
    </div>
  )
}
