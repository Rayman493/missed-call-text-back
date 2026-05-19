'use client'

import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-100 dark:bg-background border-t border-slate-300 dark:border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8">
          
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">RF</span>
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-foreground">ReplyFlowHQ</span>
            </div>
            <p className="text-slate-800 dark:text-muted-foreground mb-3 sm:mb-4 max-w-md leading-relaxed font-medium">
              Conversational missed-call response automation for modern businesses. 
              Capture leads and provide exceptional customer service.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="mailto:support@replyflowhq.com"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
              >
                support@replyflowhq.com
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider mb-3 sm:mb-4">
              Product
            </h3>
            <ul className="space-y-2 sm:space-y-3">
              <li>
                <Link 
                  href="/dashboard" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard/leads" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Leads
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard/settings" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Settings
                </Link>
              </li>
              <li>
                <Link 
                  href="/demo" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider mb-3 sm:mb-4">
              Legal
            </h3>
            <ul className="space-y-2 sm:space-y-3">
              <li>
                <Link 
                  href="/privacy" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link 
                  href="/terms" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link 
                  href="/compliance" 
                  className="text-slate-800 hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 text-sm font-medium transition-colors"
                >
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-300 dark:border-border">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-700 dark:text-muted-foreground text-sm font-medium">
              © {currentYear} ReplyFlowHQ. All rights reserved.
            </p>
            <div className="flex items-center gap-6 mt-3 sm:mt-0">
              <span className="text-slate-700 dark:text-muted-foreground text-sm font-medium">
                Built for service businesses
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
