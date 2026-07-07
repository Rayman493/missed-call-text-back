'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { handleBillingAction } from '@/lib/billing'
// import ThemeSelector from '@/components/ThemeSelector' // Temporarily disabled for mobile crash fix
import { createBrowserClient } from '@/lib/supabase/browser'
import { ChevronDown, User } from 'lucide-react'
import { accountMenuItems } from '@/lib/navigation-config'

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const { user, signOut } = useAuth()
  const { business } = useBusiness()
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

  // Click outside detection with mobile safety
  useEffect(() => {
    // Skip if window/document not available (SSR or mobile issues)
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

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
      try {
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscapeKey)
      } catch (error) {
        console.warn('[UserDropdown] Failed to add event listeners:', error)
      }
    }

    return () => {
      try {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscapeKey)
      } catch (error) {
        console.warn('[UserDropdown] Failed to remove event listeners:', error)
      }
    }
  }, [isOpen])

  const handleSignOut = async () => {
    try {
      await signOut({ manual: true })
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
        // Defensive guard for window access
        if (typeof window !== 'undefined' && window.location) {
          window.location.href = result.url
        }
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
            className={`group flex h-10 w-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 text-center relative sm:w-auto sm:px-3 ${
              isOpen 
                ? 'text-white bg-slate-800/70' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            {/* User Icon - always visible */}
            <User className="w-5 h-5 text-inherit group-hover:text-inherit transition-colors duration-200" />
            
            {/* Business name - desktop only */}
            <span className="hidden md:inline transition-colors duration-200 max-w-32 truncate">
              {business?.name || 'Account'}
            </span>
            
            {/* Chevron icon - desktop only */}
            <ChevronDown className={`hidden md:inline w-4 h-4 text-inherit transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute right-0 z-20 mt-2 w-72 min-w-72 bg-card rounded-xl shadow-xl border border-border py-2">
                {/* Business Info Section */}
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {business?.name || 'Business'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {user?.email || 'No email'}
                  </p>
                </div>

                {/* Navigation Items */}
                <div className="py-1">
                  {accountMenuItems.map((item) => {
                    const Icon = item.icon
                    const isDanger = item.variant === 'danger'
                    const isBilling = item.action === 'billing'
                    
                    const handleClick = async () => {
                      setIsOpen(false)
                      if (isBilling) {
                        await handleManageBilling()
                      } else if (item.action === 'signout') {
                        await handleSignOut()
                      }
                    }
                    
                    if (item.href && !isBilling) {
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
                        >
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          {item.label}
                        </Link>
                      )
                    }
                    
                    return (
                      <button
                        key={item.label}
                        onClick={handleClick}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 ${
                          isDanger
                            ? 'text-red-400/90 hover:text-red-400 hover:bg-muted'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isDanger ? '' : 'text-muted-foreground'}`} />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
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
