import React from 'react'

interface DocumentationLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
}

/**
 * DocumentationLayout - Shared layout for documentation pages
 * 
 * Features:
 * - Proper sticky sidebar positioning with full-height scroll context
 * - Centered main content with balanced left/right spacing
 * - Wider container (max-w-6xl) for better desktop layout
 * - 3-column grid: sidebar (280px) | content (auto) | balancing space
 * - Compressed vertical spacing
 */
export default function DocumentationLayout({ children, sidebar }: DocumentationLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Main documentation content with proper scroll context */}
      <div className="flex-1 w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* 
            3-column grid for desktop:
            - Left: Sidebar (fixed 280px)
            - Center: Main content (auto, constrained by max-w-3xl)
            - Right: Balancing space (1fr)
          */}
          <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)_1fr] lg:gap-16 lg:items-start">
            {/* Sidebar - Desktop Only */}
            <aside className="hidden lg:block lg:self-start">
              <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
                {sidebar}
              </div>
            </aside>

            {/* Main Content */}
            <div className="lg:max-w-3xl lg:col-start-2 space-y-8">
              {children}
            </div>

            {/* Right balancing column - empty on desktop */}
            <div className="hidden lg:block"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
