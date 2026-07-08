'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'
import { X } from 'lucide-react'

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const { user, signOut } = useAuth()
  const { business } = useBusinessSafe()
  const pathname = usePathname()
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

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

  // Prevent body scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Store previous focus
      previousFocusRef.current = document.activeElement as HTMLElement
    } else {
      document.body.style.overflow = ''
      // Restore focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Focus trap
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      const focusableElements = drawerRef.current.querySelectorAll(
        'a, button, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      firstElement?.focus()

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault()
              lastElement?.focus()
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault()
              firstElement?.focus()
            }
          }
        }
      }

      document.addEventListener('keydown', handleTab)
      return () => document.removeEventListener('keydown', handleTab)
    }
  }, [isOpen])

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

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-[#0b1220] border-r border-slate-800 z-50 sm:hidden transform transition-transform duration-300 ease-in-out"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <span className="text-lg font-semibold text-white">Menu</span>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/50"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {isLoggedIn ? (
            // Authenticated navigation
            <>
              <Link
                href="/dashboard"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/settings"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Settings
              </Link>
              
              <div className="border-t border-slate-800 my-4" />
              
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors text-left"
              >
                Sign Out
              </button>
            </>
          ) : (
            // Logged out navigation
            <>
              <Link
                href="/"
                onClick={handleHomeClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Home
              </Link>
              <Link
                href="/#features"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Features
              </Link>
              <Link
                href="/#interactive-demo"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                See How It Works
              </Link>
              <Link
                href="/pricing"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/faq"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                FAQ
              </Link>
              
              <div className="border-t border-slate-800 my-4" />
              
              <Link
                href="/auth?mode=signin"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-gray-200 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Sign In
              </Link>
              
              <div className="border-t border-slate-800 my-4" />
              
              <Link
                href="/privacy"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="/compliance"
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Compliance
              </Link>
            </>
          )}
        </nav>
      </div>
    </>
  )
}
