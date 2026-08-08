'use client'

import { Component, ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'

interface Props {
  children: ReactNode
  debugInfo?: {
    pathname?: string
    hasSession?: boolean
    businessFetchComplete?: boolean
    hasBusiness?: boolean
    subscription_status?: string | null
    renderBranch?: string
    lastRenderedSection?: string
  }
}

interface State {
  hasError: boolean
  error?: Error
}

const isDebugMode = () => {
  if (typeof window === 'undefined') return false
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('debug') === 'true' || process.env.NODE_ENV !== 'production'
}

// Global error listeners
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[GLOBAL ERROR]', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[GLOBAL UNHANDLED REJECTION]', {
      reason: event.reason,
      promise: event.promise
    })
  })
}

export default class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const debug = isDebugMode()
    const { pathname, hasSession, businessFetchComplete, hasBusiness, subscription_status, renderBranch, lastRenderedSection } = this.props.debugInfo || {}

    console.error('[DashboardErrorBoundary] Dashboard crashed:', error)
    console.error('[DashboardErrorBoundary] Error info:', errorInfo)
    
    // Log to Sentry in production
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
          debugInfo: {
            pathname,
            hasSession,
            businessFetchComplete,
            hasBusiness,
            subscription_status,
            renderBranch,
            lastRenderedSection
          }
        }
      })
    }
    
    if (debug) {
      console.error('[DEBUG] Error details:', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        pathname,
        userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
        hasSession,
        businessFetchComplete,
        hasBusiness,
        subscription_status,
        renderBranch,
        lastRenderedSection
      })
    }
  }

  render() {
    if (this.state.hasError) {
      const debug = isDebugMode()
      const { pathname, hasSession, businessFetchComplete, hasBusiness, subscription_status, renderBranch, lastRenderedSection } = this.props.debugInfo || {}

      const stackLines = this.state.error?.stack?.split('\n').slice(0, 5) || []

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-card rounded-lg shadow-lg p-8">
            <div className="w-16 h-16 bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17h.01" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2 text-center">
              Something went wrong
            </h2>
            <p className="text-muted-foreground mb-6 text-center">
              We had trouble loading your dashboard. Please try refreshing the page.
            </p>

            {debug && (
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 mb-6 text-xs font-mono overflow-x-auto">
                <div className="mb-4">
                  <div className="text-red-400 font-bold mb-2">Error Message:</div>
                  <div className="text-white">{this.state.error?.message}</div>
                </div>

                {stackLines.length > 0 && (
                  <div className="mb-4">
                    <div className="text-red-400 font-bold mb-2">Stack Trace (first 5 lines):</div>
                    <pre className="text-gray-300 whitespace-pre-wrap">{stackLines.join('\n')}</pre>
                  </div>
                )}

                <div className="mb-4">
                  <div className="text-red-400 font-bold mb-2">Debug Info:</div>
                  <div className="text-gray-300 space-y-1">
                    <div>Pathname: {pathname || 'unknown'}</div>
                    <div>User Agent: {typeof window !== 'undefined' ? navigator.userAgent : 'server'}</div>
                    <div>Has Session: {hasSession ? 'true' : 'false'}</div>
                    <div>Business Fetch Complete: {businessFetchComplete ? 'true' : 'false'}</div>
                    <div>Has Business: {hasBusiness ? 'true' : 'false'}</div>
                    <div>Subscription Status: {subscription_status || 'null'}</div>
                    <div>Render Branch: {renderBranch || 'unknown'}</div>
                    <div>Last Rendered Section: {lastRenderedSection || 'unknown'}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
              >
                Return to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              If this continues, please contact support.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
