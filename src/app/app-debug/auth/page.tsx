'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface DebugEvent {
  id: string
  timestamp: string
  type: string
  route?: string
  data: any
}

export default function AuthDebugPage() {
  const [events, setEvents] = useState<DebugEvent[]>([])
  const router = useRouter()

  // Load events from localStorage on mount
  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('replyflow_auth_debug_logs')
        if (stored) {
          const parsedEvents = JSON.parse(stored)
          setEvents(parsedEvents)
        }
      } catch (error) {
        console.error('Failed to load debug events:', error)
      }
    }
  }

  const clearEvents = () => {
    setEvents([])
    if (typeof window !== 'undefined') {
      localStorage.removeItem('replyflow_auth_debug_logs')
    }
  }

  const copyLogs = () => {
    const logsText = events.map(event => {
      const routeInfo = event.route ? ` [Route: ${event.route}]` : ''
      return `[${event.timestamp}]${routeInfo} ${event.type}\n${JSON.stringify(event.data, null, 2)}`
    }).join('\n\n---\n\n')

    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(logsText).then(() => {
        alert('Debug logs copied to clipboard!')
      }).catch(() => {
        alert('Failed to copy logs')
      })
    }
  }

  const addTestEvent = () => {
    if (typeof window !== 'undefined') {
      const newEvent: DebugEvent = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'MANUAL_TEST_EVENT',
        route: window.location.pathname,
        data: {
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }
      }

      setEvents(prev => {
        const updated = [newEvent, ...prev].slice(0, 100) // Keep last 100 events
        localStorage.setItem('replyflow_auth_debug_logs', JSON.stringify(updated))
        return updated
      })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Auth Debug Logs
            </h1>
            <div className="flex gap-2">
              <button
                onClick={addTestEvent}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Add Test Event
              </button>
              <button
                onClick={copyLogs}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Copy Logs
              </button>
              <button
                onClick={clearEvents}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Clear Logs
              </button>
              <Link
                href="/dashboard"
                className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm inline-flex items-center"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Instructions
            </h2>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
              <li>Start Stripe checkout from dashboard</li>
              <li>Complete checkout and return from Stripe</li>
              <li>If auth issues occur, navigate here to view logs</li>
              <li>Copy logs and share for analysis</li>
            </ol>
          </div>
        </div>

        {/* Events List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Debug Events ({events.length})
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Stored in localStorage
              </div>
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <div className="mb-4">
                  <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p>No debug events logged yet</p>
                <p className="text-sm mt-2">Auth events will appear here as you use the app</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {events.map((event, index) => (
                  <div key={event.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          #{events.length - index}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {event.type}
                        </span>
                        {event.route && (
                          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
                            {event.route}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto text-xs">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Debug logs are stored locally in your browser</p>
          <p>Logs persist across page reloads and Stripe redirects</p>
        </div>
      </div>
    </div>
  )
}
