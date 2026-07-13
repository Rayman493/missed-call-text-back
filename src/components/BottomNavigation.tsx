'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Home, Users, Calendar, CreditCard, Settings, ExternalLink, LogOut, X, MessageCircle } from 'lucide-react'
import { primaryNavItems, accountMenuItems } from '@/lib/navigation-config'
import { handleBillingAction } from '@/lib/billing'
import ReplyFlowAssistant from '@/components/ReplyFlowAssistant'

interface BottomNavigationProps {
  onLogout?: () => void
}

export default function BottomNavigation({ onLogout }: BottomNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Hide bottom nav on public pages
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
                       pathname === '/privacy' || 
                       pathname === '/terms' || 
                       pathname === '/compliance' || 
                       pathname === '/demo' ||
                       pathname === '/auth' ||
                       pathname?.startsWith('/signup')

  if (isPublicPage) {
    return null
  }

  const isActive = (href: string) => {
    // When More menu is open, don't highlight any nav items (only More button should be active)
    if (isMoreMenuOpen) {
      return false
    }
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(href)
  }

  const handleLogout = async () => {
    try {
      await signOut({ manual: true })
      router.push('/')
    } catch (error) {
      console.error('[MOBILE LOGOUT ERROR] Sign out error:', error)
    }
    setIsMoreMenuOpen(false)
  }

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isMoreMenuOpen && moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect()
      const viewportPadding = 12
      const safeBottom = 16
      const desiredWidth = 224
      const dropdownWidth = Math.min(
        desiredWidth,
        window.innerWidth - viewportPadding * 2
      )

      const unclampedLeft = rect.right - dropdownWidth

      const left = Math.min(
        Math.max(unclampedLeft, viewportPadding),
        window.innerWidth - dropdownWidth - viewportPadding
      )

      // Estimate dropdown height (3 items + divider ≈ 130px)
      const estimatedDropdownHeight = 130
      // Position dropdown 8px above the More button (dropdown bottom = button top - 8px)
      const spacing = 8
      const unclampedTop = rect.top - estimatedDropdownHeight - spacing

      // Clamp top to keep dropdown fully visible, but prefer unclamped position
      // Also ensure dropdown doesn't overlap bottom navigation (add safeBottom buffer)
      const bottomNavHeight = 80 // Approximate bottom navigation height
      const maxTop = window.innerHeight - bottomNavHeight - estimatedDropdownHeight - spacing - safeBottom
      const top = Math.max(
        viewportPadding,
        Math.min(unclampedTop, maxTop)
      )

      setDropdownPosition({
        top,
        left
      })
    } else if (!isMoreMenuOpen) {
      setDropdownPosition(null)
    }
  }, [isMoreMenuOpen])

  // Update position on resize and scroll
  useEffect(() => {
    if (!isMoreMenuOpen) return

    const updatePosition = () => {
      if (moreButtonRef.current) {
        const rect = moreButtonRef.current.getBoundingClientRect()
        const viewportPadding = 12
        const safeBottom = 16
        const desiredWidth = 224
        const dropdownWidth = Math.min(
          desiredWidth,
          window.innerWidth - viewportPadding * 2
        )

        const unclampedLeft = rect.right - dropdownWidth

        const left = Math.min(
          Math.max(unclampedLeft, viewportPadding),
          window.innerWidth - dropdownWidth - viewportPadding
        )

        // Estimate dropdown height (3 items + divider ≈ 130px)
        const estimatedDropdownHeight = 130
        // Position dropdown 8px above the More button (dropdown bottom = button top - 8px)
        const spacing = 8
        const unclampedTop = rect.top - estimatedDropdownHeight - spacing

        // Clamp top to keep dropdown fully visible, but prefer unclamped position
        // Also ensure dropdown doesn't overlap bottom navigation (add safeBottom buffer)
        const bottomNavHeight = 80 // Approximate bottom navigation height
        const maxTop = window.innerHeight - bottomNavHeight - estimatedDropdownHeight - spacing - safeBottom
        const top = Math.max(
          viewportPadding,
          Math.min(unclampedTop, maxTop)
        )

        setDropdownPosition({
          top,
          left
        })
      }
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
    }
  }, [isMoreMenuOpen])

  // Close dropdown on outside click
  useEffect(() => {
    if (!isMoreMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const isClickInsideTrigger = moreButtonRef.current?.contains(event.target as Node)
      const isClickInsideDropdown = dropdownRef.current?.contains(event.target as Node)
      if (!isClickInsideTrigger && !isClickInsideDropdown) {
        setIsMoreMenuOpen(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isMoreMenuOpen])

  return (
    <>
      {/* Bottom Navigation Bar - Mobile Only - Improved touch targets */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe lg:hidden">
        <div className="mx-auto max-w-7xl px-2 pb-2 sm:px-4" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <div className="flex h-16 items-center justify-around rounded-3xl border border-white/10 bg-slate-950/88 px-1 shadow-[0_1px_0_rgba(255,255,255,0.07),0_-20px_70px_rgba(2,6,23,0.62)] backdrop-blur-2xl">
            {primaryNavItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex h-12 w-full flex-col items-center justify-center rounded-2xl transition-all duration-150 ${
                    isActive(item.href)
                      ? 'text-white bg-white/12 scale-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(37,99,235,0.16)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.07] active:scale-95'
                  }`}
                >
                                    <Icon className="w-5 h-5 sm:w-5 sm:h-5 mb-1 transition-transform duration-150" />
                  <span className={`text-[10px] sm:text-[10px] font-medium transition-colors duration-150 ${
                    isActive(item.href) ? 'font-semibold' : ''
                  }`}>{item.label}</span>
                </Link>
              )
            })}

            {/* More Button - Improved touch target */}
            <button
              ref={moreButtonRef}
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className={`relative flex h-12 w-full flex-col items-center justify-center rounded-2xl transition-all duration-150 ${
                isMoreMenuOpen
                  ? 'text-white bg-white/12 scale-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(37,99,235,0.16)]'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.07] active:scale-95'
              }`}
            >
                            <Settings className="w-5 h-5 sm:w-5 sm:h-5 mb-1 transition-transform duration-150" />
              <span className={`text-[10px] sm:text-[10px] font-medium transition-colors duration-150 ${
                isMoreMenuOpen ? 'font-semibold' : ''
              }`}>More</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Compact Dropdown Menu - Mobile Only */}
      {isMoreMenuOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[1000] w-56 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl lg:hidden"
          style={dropdownPosition ? {
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`
          } : undefined}
        >
          <div className="py-1">
            <Link
              href="/dashboard/settings"
              onClick={() => setIsMoreMenuOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors duration-150 hover:bg-slate-800 hover:text-white"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Settings
            </Link>
            <Link
              href="/"
              onClick={() => setIsMoreMenuOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors duration-150 hover:bg-slate-800 hover:text-white"
            >
              <ExternalLink className="h-4 w-4 text-slate-400" />
              View Homepage
            </Link>
            <div className="h-px bg-slate-700 my-1" />
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-red-400 transition-colors duration-150 hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>,
        document.body
      )}

      {isAssistantOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 lg:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setIsAssistantOpen(false)} />
          <div className="relative mb-20 w-full max-w-lg">
            <ReplyFlowAssistant
              context={{ currentPage: 'dashboard' }}
              onClose={() => setIsAssistantOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
