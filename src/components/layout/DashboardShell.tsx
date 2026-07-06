'use client'

import React from 'react'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'

interface DashboardShellProps {
  children: React.ReactNode
  title?: string
  showNavigation?: boolean
  showBottomNavigation?: boolean
  withGuards?: boolean
  withErrorBoundary?: boolean
  debugInfo?: any
  className?: string
  contentClassName?: string
  innerClassName?: string
  maxWidthClassName?: string
}

function DashboardShellFrame({
  children,
  title,
  showNavigation = true,
  showBottomNavigation = true,
  className = '',
  contentClassName = 'flex-1 pt-3 sm:pt-4 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-24 md:pb-8 relative z-10',
  innerClassName = 'space-y-4 lg:space-y-6',
  maxWidthClassName = 'max-w-[1400px] mx-auto',
}: Omit<DashboardShellProps, 'withGuards' | 'withErrorBoundary' | 'debugInfo'>) {
  return (
    <div className={`min-h-screen bg-background dark:bg-background flex flex-col relative overflow-x-hidden ${className}`}>
      <AppHeader title={title} showNavigation={showNavigation} />
      <main className={contentClassName}>
        <div className={`${maxWidthClassName} ${innerClassName}`}>
          {children}
        </div>
      </main>
      {showBottomNavigation && <BottomNavigation />}
    </div>
  )
}

export default function DashboardShell({
  children,
  withGuards = true,
  withErrorBoundary = true,
  debugInfo,
  ...frameProps
}: DashboardShellProps) {
  const frame = <DashboardShellFrame {...frameProps}>{children}</DashboardShellFrame>
  const guarded = withGuards ? (
    <AuthGuard>
      <BusinessGuard>{frame}</BusinessGuard>
    </AuthGuard>
  ) : frame

  if (!withErrorBoundary) {
    return guarded
  }

  return <DashboardErrorBoundary debugInfo={debugInfo}>{guarded}</DashboardErrorBoundary>
}
