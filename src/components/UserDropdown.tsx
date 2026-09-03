'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { handleBillingAction } from '@/lib/billing'
import { useTheme } from 'next-themes'
import { createBrowserClient } from '@/lib/supabase/browser'
import { ChevronDown, CreditCard, LayoutDashboard, LogOut, MessageCircle, ReceiptText, Settings, User, Home, X, Monitor, Sun, Moon, Mail, HelpCircle } from 'lucide-react'
import { accountMenuItems } from '@/lib/navigation-config'
import { isAdmin } from '@/lib/admin'
import ReplyFlowAssistant from '@/components/ReplyFlowAssistant'
import AssistantMobileShell from '@/components/AssistantMobileShell'
import ContactSupportModal from '@/components/ContactSupportModal'
import { isCapacitorNative } from '@/capacitor/init'

// Compact theme switcher for dropdown
function QuickThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex gap-1">
        <div className="w-7 h-7 rounded bg-muted animate-pulse"></div>
        <div className="w-7 h-7 rounded bg-muted animate-pulse"></div>
        <div className="w-7 h-7 rounded bg-muted animate-pulse"></div>
      </div>
    )
  }

  const themes = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]

  return (
    <div className="flex gap-1">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={(e) => {
            e.stopPropagation()
            setTheme(value)
          }}
          className={`flex items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            theme === value
              ? 'bg-secondary text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title={`Switch to ${label} theme`}
          aria-label={`${label} theme${theme === value ? ', currently selected' : ''}`}
          aria-pressed={theme === value}
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

interface UserDropdownProps {
  forceDark?: boolean
  isPublicPage?: boolean
}

export default function UserDropdown({ forceDark = false, isPublicPage = false }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [isContactSupportOpen, setIsContactSupportOpen] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([])
  const [isNative, setIsNative] = useState(false)
  const { user, signOut } = useAuth()
  const { business } = useBusiness()
  const pathname = usePathname()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const dropdownContentRef = useRef<HTMLDivElement>(null)
  const desktopDropdownContentRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'false'
  const currentPlan = business?.subscription_price_id ? 'Paid plan' : business?.subscription_status || 'No plan'
  const trialStatus = business?.trial_ends_at ? `Trial ends ${new Date(business.trial_ends_at).toLocaleDateString()}` : business?.subscription_status || 'No trial active'
  const isHomepage = pathname === '/'

  // Check if running in native app
  useEffect(() => {
    setIsNative(isCapacitorNative())
  }, [])

  const desktopAccountMenuItems = accountMenuItems
    .filter(item => !item.adminOnly || isAdmin(user?.id))
    .filter(item => !(isNative && (item.label === 'View Homepage' || item.label === 'Go to Dashboard')))
    .map(item => (
      isHomepage && item.label === 'View Homepage'
        ? { ...item, label: 'Go to Dashboard', href: '/dashboard', external: false, icon: LayoutDashboard }
        : item
    ))

  // Simple toast function
  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }

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
      const isClickInsideTrigger = triggerRef.current?.contains(event.target as Node)
      const isClickInsideMobileDropdown = dropdownContentRef.current?.contains(event.target as Node)
      const isClickInsideDesktopDropdown = desktopDropdownContentRef.current?.contains(event.target as Node)
      if (!isClickInsideTrigger && !isClickInsideMobileDropdown && !isClickInsideDesktopDropdown) {
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

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const isMobile = window.innerWidth < 640
      const viewportPadding = 12
      const bottomNavHeight = 80 // Account for bottom navigation (64px + safe-area padding)

      const desiredWidth = isMobile ? 320 : 288
      const dropdownWidth = Math.min(
        desiredWidth,
        window.innerWidth - viewportPadding * 2
      )

      const unclampedLeft = rect.right - dropdownWidth

      const left = Math.min(
        Math.max(unclampedLeft, viewportPadding),
        window.innerWidth - dropdownWidth - viewportPadding
      )

      // Calculate top position with bottom collision detection
      const availableHeightBelow = window.innerHeight - rect.bottom - bottomNavHeight
      const dropdownHeightEstimate = 400 // Estimated max height
      const shouldPositionAbove = availableHeightBelow < dropdownHeightEstimate && rect.top > dropdownHeightEstimate

      const top = shouldPositionAbove 
        ? rect.top - dropdownHeightEstimate - 8 
        : rect.bottom + 8

      setDropdownPosition({
        top,
        left,
        width: dropdownWidth
      })
    } else if (!isOpen) {
      setDropdownPosition(null)
    }
  }, [isOpen])

  // Update position on resize and scroll
  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const isMobile = window.innerWidth < 640
        const viewportPadding = 12
        const bottomNavHeight = 80 // Account for bottom navigation (64px + safe-area padding)

        const desiredWidth = isMobile ? 320 : 288
        const dropdownWidth = Math.min(
          desiredWidth,
          window.innerWidth - viewportPadding * 2
        )

        const unclampedLeft = rect.right - dropdownWidth

        const left = Math.min(
          Math.max(unclampedLeft, viewportPadding),
          window.innerWidth - dropdownWidth - viewportPadding
        )

        // Calculate top position with bottom collision detection
        const availableHeightBelow = window.innerHeight - rect.bottom - bottomNavHeight
        const dropdownHeightEstimate = 400 // Estimated max height
        const shouldPositionAbove = availableHeightBelow < dropdownHeightEstimate && rect.top > dropdownHeightEstimate

        const top = shouldPositionAbove 
          ? rect.top - dropdownHeightEstimate - 8 
          : rect.bottom + 8

        setDropdownPosition({
          top,
          left,
          width: dropdownWidth
        })
      }
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
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
      } else if (result.error) {
        showToast(result.error, 'error')
      }
      setIsOpen(false)
    } catch (error) {
      console.error('Billing action error:', error)
      showToast('Unable to open billing right now. Please try again.', 'error')
    }
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {isValidSession && user ? (
          <>
            {/* UPDATED HEADER COMPONENT - Account button */}
            <button
              ref={triggerRef}
              onClick={() => setIsOpen(!isOpen)}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-controls="mobile-account-menu"
              className={`group flex h-10 w-10 items-center justify-center gap-2 rounded-lg text-sm font-medium motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none motion-reduce:transform-none text-center relative sm:w-auto sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] ${
                isOpen
                  ? forceDark ? 'text-white bg-slate-800' : 'text-foreground bg-muted'
                  : forceDark ? 'text-gray-300 hover:text-white hover:bg-slate-800' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {/* User Icon - always visible */}
              <User className="w-5 h-5 text-inherit group-hover:text-inherit transition-colors duration-200" />
              
              {/* Business name - desktop only */}
              <span className="hidden md:inline motion-safe:transition-colors motion-safe:duration-200 motion-reduce:transition-none max-w-32 truncate">
                {business?.name || 'Account'}
              </span>
              
              {/* Chevron icon - desktop only */}
              <ChevronDown className={`hidden md:inline w-4 h-4 text-inherit transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
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

      {/* Portal-rendered dropdowns */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Mobile dropdown - portal rendered */}
          <div
            id="mobile-account-menu"
            ref={dropdownContentRef}
            role="menu"
            tabIndex={-1}
            className={`fixed z-[1000] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 sm:hidden animate-in fade-in slide-in-from-top-2 duration-200 ${forceDark ? 'dark' : ''}`}
            style={dropdownPosition ? {
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`
            } : undefined}
          >
            {/* Identity section */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {business?.name || 'Business'}
                </p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {user?.email || 'No email'}
                </p>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Menu items */}
            <div className="px-1.5 py-1">
              <Link
                href="/dashboard/settings"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false)
                  setIsAssistantOpen(true)
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ReplyFlow Assistant
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false)
                  setIsContactSupportOpen(true)
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                Contact Support
              </button>
              <Link
                href="/faq"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                FAQ
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleManageBilling}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ReceiptText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                Billing
              </button>
            </div>

            <div className="h-px bg-border/50" />

            {/* Appearance section - reduced visual footprint */}
            {!isPublicPage && (
              <div className="px-3 py-2">
                <QuickThemeSwitcher />
              </div>
            )}

            <div className="h-px bg-border/50" />

            {/* Secondary menu items */}
            {!isNative && (
              <div className="px-1.5 py-1">
                <Link
                  href={isHomepage ? '/dashboard' : '/'}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  {isHomepage ? 'Go to Dashboard' : 'View Homepage'}
                </Link>
              </div>
            )}

            {!isNative && <div className="h-px bg-border/50" />}

            {/* Danger section */}
            <div className="px-1.5 py-1">
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Desktop dropdown - portal rendered */}
          <div ref={desktopDropdownContentRef} className={`hidden sm:block fixed z-[1000] bg-card rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30 border border-border/50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-200 ${forceDark ? 'dark' : ''}`} style={dropdownPosition ? {
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`
          } : undefined}>
            {/* Business Info Section */}
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-sm font-semibold text-foreground truncate">
                {business?.name || 'Business'}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {user?.email || 'No email'}
              </p>
            </div>

            {/* Quick theme switcher */}
            {!isPublicPage && (
              <div className="px-3 py-2">
                <QuickThemeSwitcher />
              </div>
            )}

            {/* Navigation Items */}
            <div className="py-1 px-1">
              {desktopAccountMenuItems.map((item) => {
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
                    className="w-full px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2.5 rounded-md"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    onClick={handleClick}
                    className={`w-full px-2.5 py-2 text-left text-sm transition-colors flex items-center gap-2.5 rounded-md ${
                      isDanger
                        ? 'text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isDanger ? '' : 'text-muted-foreground'}`} />
                    {item.label}
                  </button>
                )

                if (!isBilling) {
                  if (isDanger) {
                    return (
                      <div key={item.label} className="mt-1 border-t border-border pt-1">
                        {menuItem}
                      </div>
                    )
                  }
                  return menuItem
                }

                return (
                  <div key="desktop-billing-and-assistant">
                    {menuItem}
                    <button
                      onClick={() => {
                        setIsOpen(false)
                        setIsAssistantOpen(true)
                      }}
                      className="w-full px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2.5 rounded-md"
                    >
                      <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ReplyFlow Assistant
                    </button>
                    <button
                      onClick={() => {
                        setIsOpen(false)
                        setIsContactSupportOpen(true)
                      }}
                      className="w-full px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2.5 rounded-md"
                    >
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      Contact Support
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {isAssistantOpen && typeof document !== 'undefined' && (
        <>
          {/* Mobile: shared bottom-sheet shell */}
          <AssistantMobileShell
            isOpen={isAssistantOpen}
            context={{ currentPage: 'dashboard' }}
            onClose={() => setIsAssistantOpen(false)}
          />

          {/* Desktop: centered modal */}
          {createPortal(
            <div className="fixed inset-0 z-[9999] hidden md:flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setIsAssistantOpen(false)}
                style={{ touchAction: 'none' }}
              />
              <div className="relative w-full md:w-[660px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex flex-col">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-0">
                  <ReplyFlowAssistant context={{ currentPage: 'dashboard' }} onClose={() => setIsAssistantOpen(false)} />
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      {/* Contact Support Modal */}
      <ContactSupportModal
        isOpen={isContactSupportOpen}
        onClose={() => setIsContactSupportOpen(false)}
        onOpenAssistant={() => setIsAssistantOpen(true)}
      />

      {/* Toast notifications */}
      {toasts.length > 0 && createPortal(
        <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
                toast.type === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
