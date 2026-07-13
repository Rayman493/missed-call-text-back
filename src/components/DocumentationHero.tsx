import Link from 'next/link'
import LegalNavigation from '@/components/LegalNavigation'

interface DocumentationHeroProps {
  activePage: 'faq' | 'privacy' | 'terms' | 'compliance'
  title: string
  subtitle: string
  icon?: React.ReactNode
  iconColor?: 'blue' | 'purple' | 'green' | 'slate'
  lastUpdated?: string
  showBackLink?: boolean
  children?: React.ReactNode
}

const iconColors = {
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  slate: 'bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400',
}

export default function DocumentationHero({
  activePage,
  title,
  subtitle,
  icon,
  iconColor = 'blue',
  lastUpdated,
  showBackLink = true,
  children,
}: DocumentationHeroProps) {
  return (
    <div className="bg-card border-b border-border">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Back to Home Link */}
        {showBackLink && (
          <div className="mb-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 group"
            >
              <svg
                className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Home
            </Link>
          </div>
        )}

        {/* Documentation Tabs */}
        <div className="flex justify-center mb-6">
          <LegalNavigation activePage={activePage} />
        </div>
      </div>

      {/* Hero Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
        <div className="text-center">
          {/* Icon */}
          {icon && (
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${iconColors[iconColor]} mb-4`}>
              {icon}
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            {title}
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            {subtitle}
          </p>

          {/* Last Updated */}
          {lastUpdated && (
            <p className="text-sm text-muted-foreground mt-3">
              Last updated: {lastUpdated}
            </p>
          )}

          {/* Additional Content */}
          {children}
        </div>
      </div>
    </div>
  )
}
