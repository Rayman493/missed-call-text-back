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
  const isProgrammaticScrollRef = useRef(false)

  useEffect(() => {
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

    // Active section tracking based on heading positions
    const handleScroll = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      rafRef.current = requestAnimationFrame(() => {
        // Skip if programmatic scroll is in progress
        if (isProgrammaticScrollRef.current) {
          return
        }

        const activationLinePercent = 0.3 // 30% from top of viewport
        const activationLine = window.innerHeight * activationLinePercent
        const bottomTolerance = 32 // 32px tolerance for bottom-of-page detection

        // Check if at bottom of page
        const isAtBottom = 
          window.innerHeight + window.scrollY >= 
          document.documentElement.scrollHeight - bottomTolerance

        if (isAtBottom && sections.length > 0) {
          // Set final section as active when at bottom of page
          setActiveId(sections[sections.length - 1].id)
          return
        }

        // Find the last section whose heading is at or above the activation line
        let activeSectionId = ''
        
        for (let i = sections.length - 1; i >= 0; i--) {
          const element = document.getElementById(sections[i].id)
          if (element) {
            const rect = element.getBoundingClientRect()
            // Check if the section heading is at or above the activation line
            if (rect.top <= activationLine) {
              activeSectionId = sections[i].id
              break
            }
          }
        }

        // If no section is at or above the line, select the first section
        if (!activeSectionId && sections.length > 0) {
          activeSectionId = sections[0].id
        }

        if (activeSectionId) {
          setActiveId(activeSectionId)
        }
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
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
      // Set programmatic scroll guard
      isProgrammaticScrollRef.current = true
      setActiveId(id)
      
      const offset = 96 // top-24 = 96px
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })

      // Clear programmatic scroll guard after animation completes
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1000) // 1 second should be enough for smooth scroll
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
