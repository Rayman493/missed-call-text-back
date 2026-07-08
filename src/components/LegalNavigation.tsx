'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

interface LegalNavigationProps {
  activePage: 'faq' | 'privacy' | 'terms' | 'compliance'
}

export default function LegalNavigation({ activePage }: LegalNavigationProps) {
  const pages = [
    { href: '/faq', label: 'FAQ' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms of Service' },
    { href: '/compliance', label: 'Compliance' },
  ]

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLAnchorElement>(null)

  // Auto-scroll active tab into view on mount and when activePage changes
  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const tab = activeTabRef.current
      
      // Scroll the active tab into view with a small offset
      const containerWidth = container.offsetWidth
      const tabLeft = tab.offsetLeft
      const tabWidth = tab.offsetWidth
      
      // Center the active tab in the container
      const scrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2)
      
      container.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      })
    }
  }, [activePage])

  return (
    <nav 
      ref={scrollContainerRef}
      className="inline-flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1 sm:flex overflow-x-auto sm:overflow-visible max-w-full sm:max-w-none"
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitScrollbar: 'none'
      } as React.CSSProperties}
      aria-label="Legal documents"
    >
      {pages.map((page) => {
        const isActive = page.href === `/${activePage}`
        return (
          <Link
            key={page.href}
            ref={isActive ? activeTabRef : undefined}
            href={page.href}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {page.label}
          </Link>
        )
      })}
    </nav>
  )
}
