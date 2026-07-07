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
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe md:hidden">
        <div className="mx-auto max-w-7xl px-2 pb-2 sm:px-4" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <div className="flex h-16 items-center justify-around rounded-3xl border border-white/10 bg-slate-950/88 px-1 shadow-[0_1px_0_rgba(255,255,255,0.07),0_-20px_70px_rgba(2,6,23,0.62)] backdrop-blur-2xl">
            {primaryNavItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex h-12 w-full flex-col items-center justify-center rounded-2xl transition-all duration-200 ${
                    isActive(item.href)
                      ? 'text-white bg-white/12 scale-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(37,99,235,0.16)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.07] active:scale-95'
                  }`}
                >
                                    <Icon className="w-5 h-5 sm:w-5 sm:h-5 mb-1 transition-transform duration-200" />
                  <span className={`text-[10px] sm:text-[10px] font-medium transition-colors ${
                    isActive(item.href) ? 'font-semibold' : ''
                  }`}>{item.label}</span>
                </Link>
              )
            })}

            {/* More Button - Improved touch target */}
            <button
              onClick={() => setIsMoreMenuOpen(true)}
              className={`relative flex h-12 w-full flex-col items-center justify-center rounded-2xl transition-all duration-200 ${
                isMoreMenuOpen
                  ? 'text-white bg-white/12 scale-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(37,99,235,0.16)]'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.07] active:scale-95'
              }`}
            >
                            <Settings className="w-5 h-5 sm:w-5 sm:h-5 mb-1 transition-transform duration-200" />
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
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 md:hidden"
            onClick={() => setIsMoreMenuOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 rounded-t-[2rem] border-t border-white/10 bg-slate-900/96 shadow-[0_1px_0_rgba(255,255,255,0.07),0_-30px_100px_rgba(2,6,23,0.72)] backdrop-blur-2xl z-50 md:hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-4 pb-8" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
              {/* Drag Handle */}
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Menu</h2>
                <button
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"
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
                    <div className="flex w-full items-center gap-4 min-w-0 text-left">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isDanger
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : isBilling
                          ? 'bg-purple-100 dark:bg-purple-900/30'
                          : 'bg-blue-500/10 ring-1 ring-blue-400/15'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          isDanger
                            ? 'text-red-600 dark:text-red-400'
                            : isBilling
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate text-left ${isDanger ? 'text-red-400' : 'text-white'}`}>
                          {item.label}
                        </div>
                        <div className="text-sm text-slate-400 truncate text-left">
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
                        className="flex w-full items-center justify-start gap-4 p-4 hover:bg-white/[0.07] rounded-2xl transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                      >
                        {content}
                      </Link>
                    )
                  }
                  
                  return (
                    <button
                      key={item.label}
                      onClick={handleClick}
                      className="flex w-full items-center justify-start gap-4 p-4 text-left hover:bg-white/[0.07] rounded-2xl transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
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
