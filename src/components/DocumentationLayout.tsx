import React from 'react'

interface DocumentationLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
}

/**
 * DocumentationLayout - Shared layout for documentation pages
 *
 * Features:
 * - Three-column grid to center article content on desktop
 * - Left rail: Sidebar (fixed 280px)
 * - Center: Content (minmax(720px, 900px) for comfortable reading)
 * - Right rail: Empty balancing column (280px) to center content
 * - Sidebar sticky within its container
 * - Outer container provides scroll context
 */
export default function DocumentationLayout({ children, sidebar }: DocumentationLayoutProps) {
  return (
    <div className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/*
          Three-column grid for desktop to center article content:
          - Left: Sidebar (fixed 280px)
          - Center: Content (minmax(720px, 900px) for comfortable reading)
          - Right: Empty balancing column (280px) to center content
        */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(720px,900px)_280px] lg:gap-8">
          {/* Sidebar - Desktop Only */}
          <aside className="hidden lg:block lg:shrink-0">
            <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              {sidebar}
            </div>
          </aside>

          {/* Main Content */}
          <div className="space-y-8">
            {children}
          </div>

          {/* Right Balancing Rail - Empty on Desktop */}
          <aside className="hidden lg:block lg:shrink-0">
            {/* This column exists only to balance the left sidebar */}
          </aside>
        </div>
      </div>
    </div>
  )
}
