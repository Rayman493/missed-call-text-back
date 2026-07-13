import React from 'react'

interface DocumentationLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
}

/**
 * DocumentationLayout - Shared layout for documentation pages
 * 
 * Features:
 * - Simple two-column layout for reliable sticky positioning
 * - Fixed sidebar (280px) + flexible content with min-width
 * - Content width: minmax(720px, 900px) for comfortable reading
 * - Sidebar sticky within its container
 * - Outer container provides scroll context
 */
export default function DocumentationLayout({ children, sidebar }: DocumentationLayoutProps) {
  return (
    <div className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* 
          Two-column layout for desktop:
          - Left: Sidebar (fixed 280px)
          - Right: Content (minmax(720px, 900px) for comfortable reading width)
        */}
        <div className="flex flex-col lg:flex-row lg:gap-16">
          {/* Sidebar - Desktop Only */}
          <aside className="hidden lg:block lg:shrink-0 lg:w-[280px]">
            <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              {sidebar}
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0 lg:min-w-[720px] lg:max-w-[900px] space-y-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
