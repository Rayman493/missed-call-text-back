'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useAuth()

  const handleSignOut = async () => {
    try {
      // Import the supabase client and sign out
      const { createBrowserClient } = await import('@/lib/supabase/browser')
      const supabase = createBrowserClient()
      await supabase.auth.signOut()
      // Redirect to home
      window.location.href = '/'
    } catch (error) {
      console.error('Sign out error:', error)
    }
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="text-sm font-medium">Account</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {user?.email || 'Account'}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Account Settings
            </button>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
