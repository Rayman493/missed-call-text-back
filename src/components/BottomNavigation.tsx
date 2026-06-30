'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Home, Users, Calendar, Settings, User, ExternalLink, LogOut, X } from 'lucide-react'

interface BottomNavigationProps {
  onLogout?: () => void
}

export default function BottomNavigation({ onLogout }: BottomNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)

  // Hide bottom nav on public pages
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
                       pathname === '/privacy' || 
                       pathname === '/terms' || 
                       pathname === '/compliance' || 
                       pathname === '/demo' ||
                       pathname === '/auth' ||
                       pathname?.startsWith('/signup')

  if (isPublicPage) {
    return null
  }

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/dashboard/leads', icon: Users, label: 'Leads' },
    { href: '/dashboard/calendar', icon: Calendar, label: 'Schedule' },
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(href)
  }

  const handleLogout = async () => {
    try {
      await signOut({ manual: true })
      router.push('/')
    } catch (error) {
      console.error('[MOBILE LOGOUT ERROR] Sign out error:', error)
    }
    setIsMoreMenuOpen(false)
  }

  return (
    <>
      {/* Bottom Navigation Bar - Mobile Only - Improved touch targets */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 z-50 pb-safe md:hidden">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div className="flex items-center justify-around h-16 sm:h-16">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${
                    isActive(item.href)
                      ? 'text-blue-600 dark:text-blue-400 scale-105'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:scale-105'
                  }`}
                >
                  <Icon className="w-6 h-6 sm:w-6 sm:h-6 mb-1 transition-transform duration-200" />
                  <span className={`text-[10px] sm:text-[10px] font-medium transition-colors ${
                    isActive(item.href) ? 'font-semibold' : ''
                  }`}>{item.label}</span>
                </Link>
              )
            })}

            {/* More Button - Improved touch target */}
            <button
              onClick={() => setIsMoreMenuOpen(true)}
              className={`relative flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${
                isMoreMenuOpen
                  ? 'text-blue-600 dark:text-blue-400 scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:scale-105'
              }`}
            >
              <Settings className="w-6 h-6 sm:w-6 sm:h-6 mb-1 transition-transform duration-200" />
              <span className={`text-[10px] sm:text-[10px] font-medium transition-colors ${
                isMoreMenuOpen ? 'font-semibold' : ''
              }`}>More</span>
            </button>
          </div>
        </div>
      </nav>

      {/* More Menu Modal - Mobile Only - Improved spacing */}
      {isMoreMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setIsMoreMenuOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 rounded-t-3xl z-50 md:hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-4 pb-8">
              {/* Drag Handle */}
              <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Menu</h2>
                <button
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="space-y-1">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="flex items-center gap-4 p-4 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-[0.98]"
                >
                  <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-foreground">Settings</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Configure your account</div>
                  </div>
                </Link>

                <Link
                  href="/"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="flex items-center gap-4 p-4 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-[0.98]"
                >
                  <div className="w-11 h-11 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ExternalLink className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-foreground">View Public Site</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Go to homepage</div>
                  </div>
                </Link>

                <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-4 p-4 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors w-full active:scale-[0.98]"
                >
                  <div className="w-11 h-11 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-red-600 dark:text-red-400">Logout</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Sign out of your account</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
