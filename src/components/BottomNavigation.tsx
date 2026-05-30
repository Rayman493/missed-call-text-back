'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Calendar, Settings, User, ExternalLink, LogOut, X } from 'lucide-react'

interface BottomNavigationProps {
  onLogout?: () => void
}

export default function BottomNavigation({ onLogout }: BottomNavigationProps) {
  const pathname = usePathname()
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
    { href: '/dashboard/calendar', icon: Calendar, label: 'Calendar' },
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(href)
  }

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 z-50 pb-safe">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-around h-16">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                    isActive(item.href)
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              )
            })}
            
            {/* More Button */}
            <button
              onClick={() => setIsMoreMenuOpen(true)}
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                isMoreMenuOpen
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Settings className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>
      </nav>

      {/* More Menu Modal */}
      {isMoreMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setIsMoreMenuOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 rounded-t-2xl z-50 md:hidden animate-in slide-in-from-bottom duration-200">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">More</h2>
                <button
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              
              <div className="space-y-2">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="flex items-center gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-foreground">Settings</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Manage your account settings</div>
                  </div>
                </Link>
                
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="flex items-center gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-foreground">Account</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Account information and billing</div>
                  </div>
                </Link>
                
                <Link
                  href="/"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="flex items-center gap-3 p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <ExternalLink className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-foreground">View Public Site</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Go to ReplyFlow homepage</div>
                  </div>
                </Link>
                
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false)
                    if (onLogout) onLogout()
                  }}
                  className="flex items-center gap-3 p-3 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors w-full"
                >
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                    <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-left">
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
