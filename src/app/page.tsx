import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'

// Footer with theme support for homepage
function HomepageFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">RF</span>
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white">ReplyFlowHQ</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-md">
              Conversational missed-call response automation for modern businesses. 
              Capture leads and provide exceptional customer service.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="mailto:support@replyflowhq.com"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
              >
                support@replyflowhq.com
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Product</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/#features" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  Demo
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Company</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/faq" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/compliance" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-sm transition-colors">
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              © {currentYear} ReplyFlowHQ. All rights reserved.
            </p>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
              <span className="text-slate-500 dark:text-slate-500 text-sm">
                Built for service businesses
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <SSRSafeNavbar forceDark={true} />
      
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-4 py-20 md:py-32 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 max-w-4xl">
          Never Lose Another Customer Who Calls You
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          ReplyFlow instantly texts back missed calls so you can capture leads, book jobs, and grow your business automatically.
        </p>
        
        {/* Pricing Information */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">14-day free trial</span>
          <span className="text-slate-700 dark:text-slate-300 text-lg">Only $49/month after trial</span>
          <span className="text-slate-500 dark:text-slate-500 text-sm">No contracts</span>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/signup"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Your Free Trial
          </Link>
          <Link
            href="/demo"
            className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            View Demo
          </Link>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-slate-50 dark:bg-slate-900 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Missed call comes in</h3>
              <p className="text-slate-600 dark:text-slate-400">Customer calls your business but you can't answer</p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">ReplyFlow texts them instantly</h3>
              <p className="text-slate-600 dark:text-slate-400">Automatic personalized text response within seconds</p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Lead captured</h3>
              <p className="text-slate-600 dark:text-slate-400">Customer appears in your dashboard ready to follow up</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-900 dark:bg-slate-950 py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white dark:text-white mb-6">
            Ready to never miss a customer again?
          </h2>
          <p className="text-xl text-slate-300 dark:text-slate-400 mb-8">
            Built for service businesses that never want to miss another lead.
          </p>
          <Link
            href="/signup"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Your 14-Day Free Trial
          </Link>
        </div>
      </section>
      <HomepageFooter />
    </main>
  )
}
