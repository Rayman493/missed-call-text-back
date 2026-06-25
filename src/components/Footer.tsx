'use client'

import Link from 'next/link'
import BrandIcon from '@/components/BrandIcon'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-100 dark:bg-background border-t border-slate-300 dark:border-border">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6">
          
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <BrandIcon size={24} />
              <span className="text-lg font-bold text-slate-900 dark:text-foreground">ReplyFlowHQ</span>
            </div>
            <p className="text-slate-800 dark:text-muted-foreground mb-2 sm:mb-3 max-w-md leading-relaxed text-xs sm:text-sm font-medium">
              Conversational missed-call response automation for modern businesses. 
              Capture leads and provide exceptional customer service.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="mailto:support@replyflowhq.com"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs sm:text-sm font-medium transition-colors"
              >
                support@replyflowhq.com
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider mb-2 sm:mb-3">
              Product
            </h3>
            <ul className="space-y-1.5 sm:space-y-2">
              <li>
                <Link 
                  href="/" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link 
                  href="/demo" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Demo
                </Link>
              </li>
              <li>
                <Link 
                  href="/faq" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard/leads" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Leads
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard/settings" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Settings
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider mb-2 sm:mb-3">
              Legal
            </h3>
            <ul className="space-y-1.5 sm:space-y-2">
              <li>
                <Link 
                  href="/privacy" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link 
                  href="/terms" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link 
                  href="/compliance" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-xs sm:text-sm font-medium transition-colors"
                >
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-300 dark:border-border">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-700 dark:text-muted-foreground text-xs sm:text-sm font-medium">
              © {currentYear} ReplyFlowHQ. All rights reserved.
            </p>
            <div className="flex items-center gap-4 sm:gap-6 mt-2 sm:mt-0">
              <span className="text-slate-700 dark:text-muted-foreground text-xs sm:text-sm font-medium">
                Built for service businesses
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
