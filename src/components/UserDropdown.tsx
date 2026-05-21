'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { handleBillingAction } from '@/lib/billing'
import ThemeSelector from '@/components/ThemeSelector'
import { createBrowserClient } from '@/lib/supabase/browser'
import { HelpCircle, ExternalLink, LogOut, Settings, CreditCard, ChevronDown } from 'lucide-react'

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const { user, signOut } = useAuth()
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()

  // Validate Supabase session on mount and when user changes
  useEffect(() => {
    const validateSession = async () => {
      if (!user) {
        setIsValidSession(false)
        return
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error || !session) {
          console.log('[UserDropdown] Invalid or missing session, treating as logged out')
          setIsValidSession(false)
        } else {
          setIsValidSession(true)
        }
      } catch (error) {
        console.error('[UserDropdown] Session validation error:', error)
        setIsValidSession(false)
      }
    }

    validateSession()
  }, [user, supabase])

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
      {isValidSession && user ? (
        <>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="group flex items-center gap-2 sm:gap-3 px-3 py-3 text-sm font-medium text-gray-300 hover:text-white rounded-md hover:bg-white/10 transition-all duration-200 ease-in-out"
          >
            <svg className="w-6.5 h-6.5 sm:w-6.5 sm:h-6.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-base font-bold hidden sm:inline transition-colors duration-200">Account</span>
            <span className="text-base font-bold sm:hidden transition-colors duration-200">Account</span>
            <ChevronDown size={18} strokeWidth={2.5} className="shrink-0 text-white/80 transition-all duration-200 group-hover:text-white group-hover:rotate-180" />
          </button>

          {isOpen && (
            <div className="absolute right-0 z-20 mt-2 w-64 min-w-64 bg-card rounded-lg shadow-lg border border-border py-2">
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
                
                {/* Account Settings */}
                <button
                  onClick={() => navigateToSettings('account')}
                  className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Account Settings
                </button>
                
                {/* Manage Subscription */}
                <button
                  onClick={handleManageBilling}
                  className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
                >
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  Manage Subscription
                </button>
                
                {/* FAQ / Help */}
                <Link
                  href="/faq"
                  onClick={() => setIsOpen(false)}
                  className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
                >
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  FAQ / Help
                </Link>
                
                {/* View Homepage */}
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    View Homepage
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
                
                {/* Divider before Logout */}
                <div className="border-t border-border my-1"></div>
                
                {/* Logout */}
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-400/90 hover:text-red-400 hover:bg-muted transition-colors flex items-center gap-3"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
            </div>
          )}
        </>
      ) : (
        // Skeleton placeholder during loading or when user is not logged in
        <div className="flex items-center gap-2 px-3 py-1.5 opacity-0">
          <div className="w-5 h-5 bg-muted rounded animate-pulse"></div>
          <div className="w-16 h-4 bg-muted rounded animate-pulse"></div>
          <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
        </div>
      )}
    </div>
  )
}
