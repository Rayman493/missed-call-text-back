'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { handleBillingAction } from '@/lib/billing'
import ThemeSelector from '@/components/ThemeSelector'
import { createBrowserClient } from '@/lib/supabase/browser'
import { HelpCircle, ExternalLink, LogOut, Settings, CreditCard, ChevronDown, User } from 'lucide-react'

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
          {/* UPDATED HEADER COMPONENT - Account button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`group flex items-center justify-center gap-2 h-9 px-3 text-sm font-medium rounded-lg transition-all duration-200 text-center relative ${
              isOpen 
                ? 'text-white bg-slate-800/70' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            {/* User Icon - always visible */}
            <User className="w-4 h-4 text-inherit group-hover:text-inherit transition-colors duration-200" />
            
            {/* Account text - desktop only */}
            <span className="hidden md:inline transition-colors duration-200">Account</span>
          </button>

          {isOpen && (
            <div className="absolute right-0 z-20 mt-2 w-64 min-w-64 bg-card rounded-lg shadow-lg border border-border py-2">
                <div className="px-4 py-2 border-b border-border">
                  <p className="text-sm text-muted-foreground truncate">
                    {user?.email || 'No email'}
                  </p>
                </div>
                
                {/* View Homepage */}
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  View Homepage
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
