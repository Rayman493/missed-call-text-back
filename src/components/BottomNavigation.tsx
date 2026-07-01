'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Home, Users, Calendar, CreditCard, Settings, ExternalLink, LogOut, X } from 'lucide-react'
import { primaryNavItems, accountMenuItems } from '@/lib/navigation-config'
import { handleBillingAction } from '@/lib/billing'

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
            {primaryNavItems.map((item) => {
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
                {accountMenuItems.map((item) => {
                  const Icon = item.icon
                  const isDanger = item.variant === 'danger'
                  const isBilling = item.action === 'billing'
                  const isSignOut = item.action === 'signout'
                  
                  const handleClick = async () => {
                    setIsMoreMenuOpen(false)
                    if (isBilling) {
                      try {
                        const result = await handleBillingAction()
                        if (result.success && result.url && typeof window !== 'undefined') {
                          window.location.href = result.url
                        }
                      } catch (error) {
                        console.error('Billing action error:', error)
                      }
                    } else if (isSignOut) {
                      await handleLogout()
                    }
                  }
                  
                  const content = (
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isDanger
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : isBilling
                          ? 'bg-purple-100 dark:bg-purple-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          isDanger
                            ? 'text-red-600 dark:text-red-400'
                            : isBilling
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${isDanger ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-foreground'}`}>
                          {item.label}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {isDanger ? 'Sign out of your account' : isBilling ? 'Manage your subscription' : item.label === 'View Homepage' ? 'Go to homepage' : 'Configure your account'}
                        </div>
                      </div>
                    </div>
                  )
                  
                  if (item.href && !isBilling) {
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="flex items-center gap-4 p-4 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-[0.98]"
                      >
                        {content}
                      </Link>
                    )
                  }
                  
                  return (
                    <button
                      key={item.label}
                      onClick={handleClick}
                      className="flex items-center gap-4 p-4 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors w-full active:scale-[0.98]"
                    >
                      {content}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
