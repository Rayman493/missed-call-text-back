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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/*
          Desktop layout: Article centered, sidebar positioned to its left
          - Article wrapper is relative to serve as positioning reference
          - Article centered with mx-auto, no padding
          - Sidebar absolute positioned relative to article wrapper
        */}
        <div className="lg:relative lg:max-w-[900px] lg:mx-auto">
          {/* Sidebar - Positioned relative to article wrapper, left of article */}
          <aside className="hidden lg:block absolute left-[-312px] top-0 w-[280px]">
            <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              {sidebar}
            </div>
          </aside>

          {/* Main Content - Centered with no padding */}
          <div className="space-y-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
