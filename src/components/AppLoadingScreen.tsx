'use client'

export default function AppLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 flex flex-col items-center justify-center">
      {/* Logo */}
      <div className="mb-8">
        <svg className="w-16 h-16 text-blue-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Spinner */}
      <div className="relative mb-6">
        <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
      </div>

      {/* Loading text */}
      <p className="text-slate-400 dark:text-slate-400 text-lg font-medium animate-pulse">
        Loading ReplyFlow…
      </p>
    </div>
  )
}
