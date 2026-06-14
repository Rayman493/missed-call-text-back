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

  return (
    <nav className="inline-flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1" aria-label="Legal documents">
      {pages.map((page) => {
        const isActive = page.href === `/${activePage}`
        return (
          <Link
            key={page.href}
            href={page.href}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
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
