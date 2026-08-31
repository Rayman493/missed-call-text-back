import React from 'react'

interface DocumentationLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
}

/**
 * DocumentationLayout - Shared layout for documentation pages
 *
 * Features:
 * - Article content truly centered in viewport on desktop
 * - Sidebar positioned independently to the left of centered article
 * - Sidebar sticky within its container
 * - Outer container provides scroll context
 */
export default function DocumentationLayout({ children, sidebar }: DocumentationLayoutProps) {
  return (
    <div className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 relative">
        {/*
          Desktop layout: Article is centered, sidebar positioned to its left
          - Relative container allows absolute positioning of sidebar
          - Article uses max-w and margin-auto to center in available space (no padding affecting center)
          - Sidebar is positioned at a fixed distance from viewport center
        */}
        <div className="lg:relative">
          {/* Sidebar - Positioned relative to viewport center, left of centered article */}
          <aside className="hidden lg:block absolute left-[calc(50%-450px-40px)] top-0 w-[280px]">
            <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              {sidebar}
            </div>
          </aside>

          {/* Main Content - Truly centered in viewport, no asymmetric padding */}
          <div className="lg:mx-auto lg:max-w-[900px]">
            <div className="space-y-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
