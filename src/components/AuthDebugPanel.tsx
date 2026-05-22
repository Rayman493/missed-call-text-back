'use client'

import { useState, useEffect } from 'react'

interface DebugEvent {
  id: string
  timestamp: string
  type: string
  data: any
}

export function AuthDebugPanel() {
  const [events, setEvents] = useState<DebugEvent[]>([])
  const [isVisible, setIsVisible] = useState(false)

  // Check if debug mode is enabled
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const debugMode = urlParams.get('debugAuth') === 'true'
      setIsVisible(debugMode)
      
      if (debugMode) {
        // Load existing events from sessionStorage
        loadEvents()
        
        // Add test log when debug panel becomes active
        setTimeout(() => {
          addEvent('AUTH_DEBUG_PANEL_ACTIVE', {
            pathname: window.location.pathname,
            search: window.location.search,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
          })
        }, 100)
      }
    }
  }, [])

  const loadEvents = () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('replyflow_auth_debug_logs')
        if (stored) {
          const parsedEvents = JSON.parse(stored)
          setEvents(parsedEvents)
        }
      } catch (error) {
        console.error('Failed to load debug events:', error)
      }
    }
  }

  const addEvent = (type: string, data: any) => {
    const newEvent: DebugEvent = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type,
      data
    }

    setEvents(prev => {
      const updated = [newEvent, ...prev].slice(0, 50) // Keep last 50 events
      // Save to sessionStorage
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('replyflow_auth_debug_logs', JSON.stringify(updated))
        } catch (error) {
          console.error('Failed to save debug events:', error)
        }
      }
      return updated
    })
  }

  const clearEvents = () => {
    setEvents([])
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('replyflow_auth_debug_logs')
    }
  }

  const copyLogs = () => {
    const logsText = events.map(event => {
      return `[${event.timestamp}] ${event.type}\n${JSON.stringify(event.data, null, 2)}`
    }).join('\n\n---\n\n')

    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(logsText).then(() => {
        alert('Debug logs copied to clipboard!')
      }).catch(() => {
        alert('Failed to copy logs')
      })
    }
  }

  // Expose addEvent function globally for logging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).addAuthDebugEvent = addEvent
    }
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed bottom-4 right-4 w-80 max-h-64 bg-black text-green-400 font-mono text-xs border border-green-600 rounded-lg shadow-2xl z-50 overflow-hidden">
      <div className="bg-green-900 text-green-100 p-2 border-b border-green-600">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold">Auth Debug</h3>
          <div className="flex gap-2">
            <button
              onClick={copyLogs}
              className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs"
            >
              Copy Logs
            </button>
            <button
              onClick={clearEvents}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-xs"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>
      
      <div className="overflow-y-auto max-h-80 p-2">
        {events.length === 0 ? (
          <div className="text-green-600">No events logged yet</div>
        ) : (
          events.map(event => (
            <div key={event.id} className="mb-3 pb-3 border-b border-green-800 last:border-b-0">
              <div className="text-green-300 font-bold mb-1">
                {event.type}
              </div>
              <div className="text-green-600 text-xs mb-1">
                {event.timestamp}
              </div>
              <div className="text-green-400 text-xs whitespace-pre-wrap">
                {JSON.stringify(event.data, null, 2)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Global debug logging function
export function logAuthEvent(type: string, data: any) {
  if (typeof window !== 'undefined' && (window as any).addAuthDebugEvent) {
    (window as any).addAuthDebugEvent(type, data)
  }
}
