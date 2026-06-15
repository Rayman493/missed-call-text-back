export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="animate-pulse">
        <div className="h-16 bg-slate-200 dark:bg-slate-800" />
        <div className="p-4 space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
