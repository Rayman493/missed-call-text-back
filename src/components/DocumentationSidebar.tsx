'use client'

import React, { useEffect, useRef, useState } from 'react'

interface DocumentationSidebarProps {
  sections: Array<{
    id: string
    label: string
  }>
}

export default function DocumentationSidebar({ sections }: DocumentationSidebarProps) {
  const [activeId, setActiveId] = useState<string>('')
  const [isSticky, setIsSticky] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>()

  useEffect(() => {
    // IntersectionObserver for active section tracking
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -70% 0px', // Trigger when section is in middle of viewport
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      // Find the intersecting section closest to the activation line
      const intersectingEntries = entries.filter(entry => entry.isIntersecting)
      if (intersectingEntries.length > 0) {
        // Sort by distance from top of viewport (closest to activation line wins)
        intersectingEntries.sort((a, b) => {
          const aRect = a.boundingClientRect
          const bRect = b.boundingClientRect
          return Math.abs(aRect.top) - Math.abs(bRect.top)
        })
        setActiveId(intersectingEntries[0].target.id)
      }
    }, observerOptions)

    // Observe all sections
    sections.forEach((section) => {
      const element = document.getElementById(section.id)
      if (element) {
        observer.observe(element)
      }
    })

    // Sticky state detection
    const stickyObserver = new IntersectionObserver(
      ([entry]) => {
        setIsSticky(!entry.isIntersecting)
      },
      { threshold: [0, 1] }
    )

    if (sidebarRef.current) {
      // Create a sentinel element to detect sticky state
      const sentinel = document.createElement('div')
      sentinel.style.position = 'absolute'
      sentinel.style.top = '-1px'
      sentinel.style.height = '1px'
      sidebarRef.current.parentElement?.insertBefore(sentinel, sidebarRef.current)
      stickyObserver.observe(sentinel)
    }

    // Bottom-of-page fallback for final section
    const handleScroll = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      rafRef.current = requestAnimationFrame(() => {
        const tolerance = 32 // 32px tolerance for browser rounding and footer height
        const isAtBottom = 
          window.innerHeight + window.scrollY >= 
          document.documentElement.scrollHeight - tolerance
        
        if (isAtBottom && sections.length > 0) {
          // Set final section as active when at bottom of page
          setActiveId(sections[sections.length - 1].id)
        }
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      stickyObserver.disconnect()
      window.removeEventListener('scroll', handleScroll)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [sections])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    setActiveId(id)
    const element = document.getElementById(id)
    if (element) {
      const offset = 96 // top-24 = 96px
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div
      ref={sidebarRef}
      className={`
        bg-white/95 dark:bg-gray-800/95 
        backdrop-blur-sm
        rounded-xl 
        border border-gray-200/80 dark:border-gray-700/80
        shadow-sm
        transition-all duration-300 ease-out
        ${isSticky ? 'py-4' : 'py-6'}
      `}
    >
      <h3 className="text-sm font-semibold text-foreground mb-4 px-2">
        Contents
      </h3>
      <nav className="space-y-1" aria-label="Table of contents">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(e) => handleClick(e, section.id)}
            className={`
              block text-sm px-3 py-2 rounded-lg transition-all duration-200
              ${
                activeId === section.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
              }
            `}
          >
            {section.label}
          </a>
        ))}
      </nav>
    </div>
  )
}
