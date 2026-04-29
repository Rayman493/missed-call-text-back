'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const { user, loading } = useAuth()

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + '/')
  }

  // Don't show menu while auth is loading
  if (loading) {
    return null
  }

  // Menu items for logged-out users (public navigation)
  const publicMenuItems = [
    { href: '/', label: 'Home' },
    { href: '/home', label: 'Features' },
    { href: '/auth?mode=signin', label: 'Sign In' },
    { href: '/auth?mode=signup', label: 'Get Started' },
  ]

  // Menu items for logged-in users (dashboard navigation)
  const privateMenuItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/leads', label: 'Leads' },
    { href: '/dashboard/settings', label: 'Settings' },
    { href: '/home', label: 'View Homepage' },
  ]

  const menuItems = user ? privateMenuItems : publicMenuItems

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-16 z-20 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 transform transition-all duration-200 ease-in-out">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
