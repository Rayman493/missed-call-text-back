'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'
import { LogOut, Home, LayoutDashboard, Settings, ExternalLink } from 'lucide-react'

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement>
}

export default function MobileDrawer({ isOpen, onClose, triggerRef }: MobileDrawerProps) {
  const { user, signOut } = useAuth()
  const { business } = useBusinessSafe()
  const pathname = usePathname()
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })

  const isLoggedIn = !!user

  // Check if we're on a public/marketing page
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
                       pathname === '/pricing' || 
                       pathname === '/privacy' || 
                       pathname === '/terms' || 
                       pathname === '/compliance' || 
                       pathname === '/demo'

  // Check if we're specifically on the homepage
  const isHomepage = pathname === '/'

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const viewportPadding = 12
      const desiredWidth = 224
      const dropdownWidth = Math.min(
        desiredWidth,
        window.innerWidth - viewportPadding * 2
      )

      const unclampedLeft = rect.left

      const left = Math.min(
        Math.max(unclampedLeft, viewportPadding),
        window.innerWidth - dropdownWidth - viewportPadding
      )

      setDropdownPosition({
        top: rect.bottom + 8,
        left
      })
    }
  }, [isOpen, triggerRef])

  // Update position on resize and scroll
  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      if (triggerRef?.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const viewportPadding = 12
        const desiredWidth = 224
        const dropdownWidth = Math.min(
          desiredWidth,
          window.innerWidth - viewportPadding * 2
        )

        const unclampedLeft = rect.left

        const left = Math.min(
          Math.max(unclampedLeft, viewportPadding),
          window.innerWidth - dropdownWidth - viewportPadding
        )

        setDropdownPosition({
          top: rect.bottom + 8,
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
  }, [isOpen, triggerRef])

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef?.current && !triggerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose, triggerRef])

  const handleHomeClick = (e: React.MouseEvent) => {
    if (isHomepage) {
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      onClose()
    }
  }

  const handleSignOut = async () => {
    await signOut({ manual: true })
    onClose()
  }

  const handleNavClick = () => {
    onClose()
  }

  if (!isOpen) return null

  return typeof document !== 'undefined' && createPortal(
    <div
      className="fixed z-[1000] w-56 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl sm:hidden"
      style={{
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`
      }}
    >
      <div className="py-1">
        {isLoggedIn ? (
          // Authenticated navigation
          <>
            <Link
              href="/dashboard"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <LayoutDashboard className="h-4 w-4 text-slate-400" />
              Dashboard
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Settings
            </Link>
            <Link
              href="/"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ExternalLink className="h-4 w-4 text-slate-400" />
              View Homepage
            </Link>
            <div className="h-px bg-slate-700 my-1" />
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-red-400 transition-colors hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </>
        ) : (
          // Logged out navigation
          <>
            <Link
              href="/"
              onClick={handleHomeClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Home className="h-4 w-4 text-slate-400" />
              Home
            </Link>
            <Link
              href="/#interactive-demo"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              See How It Works
            </Link>
            <Link
              href="/pricing"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Pricing
            </Link>
            <Link
              href="/faq"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              FAQ
            </Link>
            <div className="h-px bg-slate-700 my-1" />
            <Link
              href="/auth?mode=signin"
              onClick={handleNavClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Sign In
            </Link>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
