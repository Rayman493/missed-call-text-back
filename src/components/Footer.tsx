'use client'

import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">RF</span>
              </div>
              <span className="text-xl font-bold text-foreground">ReplyFlowHQ</span>
            </div>
            <p className="text-muted-foreground mb-4 max-w-md">
              Conversational missed-call response automation for modern businesses. 
              Capture leads and provide exceptional customer service.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="mailto:support@replyflowhq.com"
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                support@replyflowhq.com
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
              Product
            </h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/dashboard" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard/settings" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  Settings
                </Link>
              </li>
              <li>
                <Link 
                  href="/faq" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link 
                  href="/demo" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
              Legal
            </h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/privacy" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link 
                  href="/terms" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link 
                  href="/compliance" 
                  className="text-muted-foreground hover:text-blue-400 text-sm"
                >
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {currentYear} ReplyFlowHQ. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <span className="text-sm text-muted-foreground">
                Conversational messaging platform
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
