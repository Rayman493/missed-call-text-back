'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { handleBillingAction } from '@/lib/billing'
import ThemeSelector from '@/components/ThemeSelector'

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, signOut } = useAuth()
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
    setIsOpen(false)
  }

  const navigateToSettings = (hash: string) => {
    setIsOpen(false)
    router.push(`/dashboard/settings#${hash}`)
  }

  const handleManageBilling = async () => {
    try {
      const result = await handleBillingAction()
      if (result.success && result.url) {
        window.location.href = result.url
      }
      setIsOpen(false)
    } catch (error) {
      console.error('Billing action error:', error)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white rounded-md hover:bg-white/10 transition-colors"
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
        <div className="absolute right-0 z-20 mt-2 w-64 min-w-64 bg-card rounded-lg shadow-lg border border-border py-1">
            <div className="px-4 py-2 border-b border-border">
              <p className="text-sm text-muted-foreground truncate">
                {user?.email || 'No email'}
              </p>
            </div>
            
            {/* Theme Selector */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Theme</p>
              <ThemeSelector />
            </div>
            
            <button
              onClick={() => navigateToSettings('account')}
              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
            >
              Account Settings
            </button>
            <button
              onClick={handleManageBilling}
              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
            >
              Manage Subscription
            </button>
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors block flex items-center justify-between"
            >
              <span>View Website</span>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
            <div className="border-t border-border my-1"></div>
            <Link
              href="/faq"
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors block"
            >
              FAQ / Help
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-muted transition-colors"
            >
              Logout
            </button>
          </div>
      )}
    </div>
  )
}
