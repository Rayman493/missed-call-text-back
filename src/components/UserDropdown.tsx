'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { handleBillingAction } from '@/lib/billing'
// import ThemeSelector from '@/components/ThemeSelector' // Temporarily disabled for mobile crash fix
import { createBrowserClient } from '@/lib/supabase/browser'
import { ChevronDown, CreditCard, LogOut, MessageCircle, ReceiptText, Settings, User } from 'lucide-react'
import { accountMenuItems } from '@/lib/navigation-config'
import ReplyFlowAssistant from '@/components/ReplyFlowAssistant'

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const { user, signOut } = useAuth()
  const { business } = useBusiness()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const dropdownContentRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'false'
  const currentPlan = business?.subscription_price_id ? 'Paid plan' : business?.subscription_status || 'No plan'
  const trialStatus = business?.trial_ends_at ? `Trial ends ${new Date(business.trial_ends_at).toLocaleDateString()}` : business?.subscription_status || 'No trial active'

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
      const isClickInsideDropdown = dropdownRef.current?.contains(event.target as Node) || dropdownContentRef.current?.contains(event.target as Node)
      if (!isClickInsideDropdown) {
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

  useEffect(() => {
    if (isOpen) {
      mobileMenuRef.current?.focus()
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
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls="mobile-account-menu"
            className={`group flex h-10 w-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 text-center relative sm:w-auto sm:px-3 ${
              isOpen
                ? 'text-white bg-slate-800'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
            <>
              <div
                id="mobile-account-menu"
                ref={dropdownContentRef}
                role="menu"
                tabIndex={-1}
                className="absolute right-0 top-full z-[100] mt-2 block w-[calc(100vw-1rem)] max-w-80 origin-top-right overflow-hidden rounded-2xl border border-slate-200/80 !bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-slate-950/5 outline-none animate-in fade-in zoom-in-95 duration-150 dark:border-slate-700 !dark:bg-slate-950 dark:shadow-black/40 sm:hidden"
                style={{ maxHeight: 'calc(100dvh - 5rem - env(safe-area-inset-top))' }}
              >
                <div className="max-h-[inherit] overflow-y-auto py-2">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                        {business?.name || 'Business'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {user?.email || 'No email'}
                      </p>
                    </div>
                  </div>

                  <div className="my-1 h-px bg-slate-200/80 dark:bg-slate-800" />

                  <div className="px-2 py-1">
                    <Link
                      href="/dashboard/settings"
                      role="menuitem"
                      onClick={() => setIsOpen(false)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white dark:focus:bg-slate-900"
                    >
                      <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      Account Settings
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleManageBilling}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white dark:focus:bg-slate-900"
                    >
                      <ReceiptText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      Billing
                    </button>
                    {paymentsEnabled && (
                      <Link
                        href="/dashboard/payments"
                        role="menuitem"
                        onClick={() => setIsOpen(false)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white dark:focus:bg-slate-900"
                      >
                        <CreditCard className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        Payments
                      </Link>
                    )}
                  </div>

                  <div className="my-1 h-px bg-slate-200/80 dark:bg-slate-800" />

                  <div className="px-4 py-3">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Trial</span>
                      <span className="truncate text-right font-medium text-slate-800 dark:text-slate-200">{trialStatus}</span>
                      <span className="text-slate-500 dark:text-slate-400">Plan</span>
                      <span className="truncate text-right font-medium capitalize text-slate-800 dark:text-slate-200">{currentPlan.replace(/_/g, ' ')}</span>
                    </div>
                  </div>

                  <div className="my-1 h-px bg-slate-200/80 dark:bg-slate-800" />

                  <div className="px-2 py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-400 dark:hover:bg-red-950/30 dark:focus:bg-red-950/30"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>

              {/* Desktop dropdown - unchanged */}
              <div ref={dropdownContentRef} className="hidden sm:block absolute right-0 z-50 mt-2 w-72 min-w-72 bg-slate-950 rounded-xl shadow-xl border border-slate-700 py-2">
                {/* Business Info Section */}
                <div className="px-4 py-3 border-b border-slate-700 bg-slate-900">
                  <p className="text-sm font-semibold text-white truncate">
                    {business?.name || 'Business'}
                  </p>
                  <p className="text-xs text-slate-300 truncate mt-0.5">
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

                    const menuItem = item.href && !isBilling ? (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-3"
                      >
                        <Icon className="w-4 h-4 text-slate-400" />
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        onClick={handleClick}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 ${
                          isDanger
                            ? 'text-red-400 hover:text-red-300 hover:bg-slate-800'
                            : 'text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isDanger ? '' : 'text-slate-400'}`} />
                        {item.label}
                      </button>
                    )

                    if (!isBilling) return menuItem

                    return (
                      <div key="desktop-billing-and-assistant">
                        {menuItem}
                        <button
                          onClick={() => {
                            setIsOpen(false)
                            setIsAssistantOpen(true)
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-3"
                        >
                          <MessageCircle className="w-4 h-4 text-slate-400" />
                          ReplyFlow Assistant
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {isAssistantOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setIsAssistantOpen(false)} />
              <div className="relative w-full max-w-lg">
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  className="absolute -top-10 right-0 text-white hover:text-slate-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <ReplyFlowAssistant
                  context={{ currentPage: 'dashboard' }}
                  onClose={() => setIsAssistantOpen(false)}
                />
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
