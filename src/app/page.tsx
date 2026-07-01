import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import BrandIcon from '@/components/BrandIcon'
import HomepageErrorBoundary from '@/components/HomepageErrorBoundary'
import HomepageInteractiveDemo from '@/components/HomepageInteractiveDemo'
import { motion } from 'framer-motion'

// Structured Data for Google Search
function StructuredData() {
  const organizationData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ReplyFlowHQ",
    "url": "https://replyflowhq.com",
    "logo": "https://replyflowhq.com/replyflow-r-logo.png",
    "sameAs": []
  }

  const webSiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "ReplyFlowHQ",
    "url": "https://replyflowhq.com"
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteData) }}
      />
    </>
  )
}

// Footer with theme support for homepage
function HomepageFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 md:gap-12">
          
          {/* Company Info */}
          <div className="col-span-1 sm:col-span-2 md:col-span-2">
            <div className="flex items-center gap-2 mb-3 sm:mb-4 md:mb-6">
              <BrandIcon size={40} />
              <span className="text-xl sm:text-2xl font-bold text-foreground">ReplyFlowHQ</span>
            </div>
            <p className="text-muted-foreground mb-3 sm:mb-4 md:mb-6 max-w-md text-sm sm:text-base leading-relaxed">
              AI Voice, missed call recovery, lead management, appointment scheduling, payments, and follow-up automation — built for businesses that can't afford to miss a customer.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=support@replyflowhq.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm sm:text-base font-medium"
              >
                support@replyflowhq.com
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4 md:mb-6">Product</h3>
            <ul className="space-y-2 sm:space-y-3">
              <li>
                <Link href="/#features" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  Demo
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4 md:mb-6">Company</h3>
            <ul className="space-y-2 sm:space-y-3">
              <li>
                <Link href="/faq" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/compliance" className="text-muted-foreground hover:text-foreground text-sm sm:text-base transition-colors">
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-6 sm:mt-8 md:mt-10 pt-4 sm:pt-6 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-muted-foreground text-sm sm:text-base">
              © {currentYear} ReplyFlowHQ. All rights reserved.
            </p>
            <div className="flex items-center gap-4 sm:gap-6 mt-2 sm:mt-3 md:mt-0">
              <span className="text-muted-foreground text-sm sm:text-base">
                Built for local businesses
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default async function Home() {
  let cookieStore: ReturnType<typeof cookies> | undefined
  try {
    cookieStore = cookies()
  } catch {
    // Cookies not available (e.g., during static generation)
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          try {
            if (!cookieStore) {
              return []
            }
            if (typeof cookieStore.getAll !== 'function') {
              return []
            }
            return cookieStore.getAll()
          } catch {
            return []
          }
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getSession()
  const session = data?.session

  // DISABLED: Auto-redirect for logged-in users
  // Homepage is now always public - logged-in users can access it
  // Dashboard button will take logged-in users to dashboard
  // Render public homepage for unauthenticated users
  return (
    <>
      <StructuredData />
      <PageBackground>
        <SSRSafeNavbar forceDark={true} />

      {/* Hero Section - SAFE VERSION WITHOUT FRAMER-MOTION */}
      <HomepageErrorBoundary>
        <section className="relative flex flex-col items-center justify-center py-4 sm:py-5 md:py-16 text-center bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-muted dark:to-background">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent dark:from-transparent dark:via-muted/30 dark:to-transparent"></div>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-1.5 sm:space-y-2 relative z-10">
            <div className="flex flex-col items-center text-center">
              <h1 className="text-2xl sm:text-3xl md:text-6xl font-bold tracking-tight leading-[1.1] sm:leading-[1.15] text-slate-900 dark:text-foreground">
                Never Miss a Lead Again
              </h1>
              <p className="text-sm sm:text-base md:text-xl text-slate-700 dark:text-slate-300 max-w-2xl sm:max-w-3xl leading-relaxed mt-1 sm:mt-1.5">
                AI Voice answers your missed calls, collects customer information, and keeps the opportunity moving — from first response to booked appointment to payment.
              </p>

              {/* Primary CTA - Only shown for non-authenticated users */}
              {!session?.user && (
                <div className="mt-2 sm:mt-2.5 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                  <Link
                    href="/auth?mode=signup"
                    className="inline-flex items-center justify-center h-11 sm:h-12 px-5 sm:px-8 w-[260px] sm:w-auto sm:min-w-[240px] bg-blue-600 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 hover:scale-105"
                  >
                    Start Your 14-Day Free Trial
                  </Link>
                </div>
              )}

              {/* Pricing Information - Desktop and Mobile */}
              <div className="mt-1.5 sm:mt-2 flex flex-col items-center gap-0.5">
                <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-400 font-medium">14-Day Free Trial</span>
                <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">$59/month after trial</span>
              </div>

              {/* Trust Indicators - Desktop Only */}
              <div className="mt-1.5 hidden sm:block">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="leading-none">Keep Your Existing Number</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="leading-none">Setup In Under 5 Minutes</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="leading-none">No Contracts</span>
                  </div>
                </div>
              </div>

              {/* Trust Indicators - Mobile Only */}
              <div className="mt-2 sm:hidden">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-700 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="leading-none">14-Day Free Trial</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-700 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="leading-none">No Contracts</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-700 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="leading-none">Keep Your Existing Number</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* How It Works */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-4 sm:py-5 md:py-7 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-3 sm:mb-4 md:mb-5">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-2 sm:mb-3">
                How ReplyFlow Works
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-slate-700 dark:text-muted-foreground max-w-2xl mx-auto">
                Turn missed calls into conversations in 5 simple steps.
              </p>
            </div>
            
            {/* Desktop: Horizontal Flow */}
            <div className="hidden lg:flex items-center justify-between gap-3 max-w-5xl mx-auto">
              {/* Customer Calls */}
              <div className="flex flex-col items-center text-center group min-h-[160px]">
                <div className="w-13 h-13 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-2.5 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105" style={{width: '52px', height: '52px'}}>
                  <svg className="w-6.5 h-6.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5">Customer Calls</h3>
                <p className="text-xs text-slate-700 dark:text-slate-400">A customer calls your business</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Call Goes Unanswered */}
              <div className="flex flex-col items-center text-center group min-h-[160px]">
                <div className="w-13 h-13 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-2.5 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105" style={{width: '52px', height: '52px'}}>
                  <svg className="w-6.5 h-6.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5">You Miss the Call</h3>
                <p className="text-xs text-slate-700 dark:text-slate-400">You're busy, unavailable, or after hours</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* ReplyFlow Captures Information */}
              <div className="flex flex-col items-center text-center group min-h-[160px]">
                <div className="w-13 h-13 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mb-2.5 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105" style={{width: '52px', height: '52px'}}>
                  <svg className="w-6.5 h-6.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5">AI Voice Answers</h3>
                <p className="text-xs text-slate-700 dark:text-slate-400">AI answers live and collects customer information</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Customer Receives Response */}
              <div className="flex flex-col items-center text-center group min-h-[160px]">
                <div className="w-13 h-13 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mb-2.5 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105" style={{width: '52px', height: '52px'}}>
                  <svg className="w-6.5 h-6.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5">Customer Gets Instant Text</h3>
                <p className="text-xs text-slate-700 dark:text-slate-400">A confirmation text is automatically sent</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Lead Appears In Dashboard */}
              <div className="flex flex-col items-center text-center group min-h-[160px]">
                <div className="w-13 h-13 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-2.5 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105" style={{width: '52px', height: '52px'}}>
                  <svg className="w-6.5 h-6.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5">Lead Ready in Dashboard</h3>
                <p className="text-xs text-slate-700 dark:text-slate-400">Reply, schedule appointments, and request payment — all from one place</p>
              </div>
            </div>
            
            {/* Mobile: Vertical Flow */}
            <div className="lg:hidden space-y-1.5 max-w-md mx-auto">
              {/* Customer Calls */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">Customer Calls</h3>
                  <p className="text-[10px] text-slate-700 dark:text-slate-400">A customer calls your business</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Call Goes Unanswered */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">You Miss the Call</h3>
                  <p className="text-[10px] text-slate-700 dark:text-slate-400">You're busy, unavailable, or after hours</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* ReplyFlow Captures Information */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">AI Voice Answers</h3>
                  <p className="text-[10px] text-slate-700 dark:text-slate-400">AI answers live and collects customer information</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Customer Receives Response */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">Customer Gets Instant Text</h3>
                  <p className="text-[10px] text-slate-700 dark:text-slate-400">A confirmation text is automatically sent</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Lead Appears In Dashboard */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">Lead Ready in Dashboard</h3>
                  <p className="text-[10px] text-slate-700 dark:text-slate-400">Reply, schedule, and collect payment — all from one place</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Lead Capture Callout */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-background py-3 sm:py-4 md:py-5 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-6 lg:px-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 sm:p-4 text-center">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-foreground mb-1 sm:mb-1.5">
                AI Voice Answers Missed Calls
              </h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>AI Voice answers and collects caller information live</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Instant text summary sent to you and the customer</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>




      {/* Interactive Demo Section */}
      <HomepageInteractiveDemo />

      {/* Features Section */}
      <HomepageErrorBoundary>
        <section id="features-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-8 sm:py-10 md:py-14 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-6 sm:mb-8 md:mb-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-2 sm:mb-3">
                Turn Missed Calls Into Booked Jobs and Paid Invoices
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-slate-700 dark:text-muted-foreground max-w-2xl mx-auto">
                One platform to capture leads, continue conversations, schedule appointments, and collect payments
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
              
              {/* Keep Your Existing Number */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-2 sm:mb-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-2 sm:mb-2.5">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground">Keep Your Existing Number</h3>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400 mb-2 sm:mb-3 text-center">
                  No need to change your business phone number. Simply forward missed calls to ReplyFlow.
                </p>
              </div>

              {/* AI Voice */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-2 sm:mb-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-2 sm:mb-2.5">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground">AI Voice</h3>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400 mb-2 sm:mb-3 text-center">
                  AI answers calls live, collects caller information, and sends a text summary.
                </p>
              </div>

              {/* Instant Text-Back */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-2 sm:mb-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-2 sm:mb-2.5">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground">Instant Text-Back</h3>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400 mb-2 sm:mb-3 text-center">
                  Automatically respond to missed calls within seconds.
                </p>
              </div>

              {/* Appointments & Payments */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-2 sm:mb-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-2 sm:mb-2.5">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground">Appointments & Payments</h3>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400 mb-2 sm:mb-3 text-center">
                  Schedule jobs with Google Calendar and send branded payment requests via text.
                </p>
              </div>

            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Why Businesses Choose ReplyFlow - Trust Section */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-background py-8 sm:py-10 md:py-14 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-6 sm:mb-8 md:mb-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-2 sm:mb-3">
                Why Businesses Choose ReplyFlow
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-slate-700 dark:text-muted-foreground max-w-2xl mx-auto">
                The trusted solution for missed call recovery and lead capture
              </p>
            </div>

            {/* Desktop 3x2 Grid Layout */}
            <div className="hidden lg:grid lg:grid-cols-3 lg:gap-5 mb-6">
              {/* Works with your existing phone number */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-sm sm:text-base">Use your existing business number</h3>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">Keep the number your customers already know. Dedicated business numbers provide the best experience.</p>
                  </div>
                </div>
              </div>

              {/* No app required */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-sm sm:text-base">No app required</h3>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">Customers simply call your business as normal.</p>
                  </div>
                </div>
              </div>

              {/* Setup in under 5 minutes */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-sm sm:text-base">Quick setup</h3>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">Get started quickly with guided onboarding.</p>
                  </div>
                </div>
              </div>

              {/* 14-day free trial */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-sm sm:text-base">14-day free trial</h3>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">Try ReplyFlow risk-free before subscribing.</p>
                  </div>
                </div>
              </div>

              {/* AI Voice */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-sm sm:text-base">AI Voice answers missed calls</h3>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">AI answers live and collects caller information automatically.</p>
                  </div>
                </div>
              </div>

              {/* Appointments & Payments */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-sm sm:text-base">Schedule appointments & request payment</h3>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400">Book jobs with Google Calendar and send branded payment links via text.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="lg:hidden space-y-2">
              {/* Works with your existing phone number */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-xs sm:text-sm">Use your existing business number</h3>
                    <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">Keep the number your customers already know. Dedicated business numbers provide the best experience.</p>
                  </div>
                </div>
              </div>

              {/* No app required */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-xs sm:text-sm">No app required</h3>
                    <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">Customers simply call your business as normal.</p>
                  </div>
                </div>
              </div>

              {/* Setup in under 5 minutes */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-xs sm:text-sm">Quick setup</h3>
                    <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">Get started quickly with guided onboarding.</p>
                  </div>
                </div>
              </div>

              {/* 14-day free trial */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-xs sm:text-sm">14-day free trial</h3>
                    <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">Try ReplyFlow risk-free before subscribing.</p>
                  </div>
                </div>
              </div>

              {/* AI Voice */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-xs sm:text-sm">AI Voice answers missed calls</h3>
                    <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">AI answers live and collects caller information automatically.</p>
                  </div>
                </div>
              </div>

              {/* Appointments & Payments */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 md:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 text-xs sm:text-sm">Schedule appointments & request payment</h3>
                    <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400">Book jobs with Google Calendar and send branded payment links via text.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      
      {/* Final CTA Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 py-12 sm:py-16 md:py-20 border-t border-blue-200 dark:border-blue-800">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
            <div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground mb-4 sm:mb-5 md:mb-6">
                Don't Let Another Missed Call Slip Away
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-700 dark:text-muted-foreground mb-6 sm:mb-8 md:mb-10 leading-relaxed">
                When you can't answer, ReplyFlow keeps the opportunity moving — from AI intake through scheduling and payment.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 md:gap-4">
                <Link
                  href={session?.user ? "/dashboard" : "/auth?mode=signup"}
                  className="h-11 sm:h-12 px-5 sm:px-7 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-sm sm:text-base"
                >
                  {session?.user ? "Go to Dashboard" : "Start Your 14-Day Free Trial"}
                </Link>
                <Link
                  href="/demo"
                  className="h-11 sm:h-12 px-5 sm:px-7 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold rounded-xl shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-sm sm:text-base border border-blue-200 dark:border-blue-800"
                >
                  See How It Works
                </Link>
              </div>
              
              <div className="mt-4 sm:mt-5 text-xs sm:text-sm text-slate-700 dark:text-slate-400">
                No contracts. Cancel anytime.
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>
      <HomepageFooter />
      </PageBackground>
    </>
  )
}
