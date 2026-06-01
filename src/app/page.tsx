import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import HomepageErrorBoundary from '@/components/HomepageErrorBoundary'
import TabbedDemoSection from '@/components/TabbedDemoSection'
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
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-16">
          
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">RF</span>
              </div>
              <span className="text-2xl font-bold text-foreground">ReplyFlowHQ</span>
            </div>
            <p className="text-muted-foreground mb-8 max-w-md text-base leading-relaxed">
              Missed call recovery, AI voicemail intake, lead capture, calendar integration, 
              and follow-up automation for businesses that can't afford to miss opportunities.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="mailto:support@replyflowhq.com"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-base font-medium"
              >
                support@replyflowhq.com
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-8">Product</h3>
            <ul className="space-y-4">
              <li>
                <Link href="/#features" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  Demo
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-8">Company</h3>
            <ul className="space-y-4">
              <li>
                <Link href="/faq" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/compliance" className="text-muted-foreground hover:text-foreground text-base transition-colors">
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-16 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-muted-foreground text-base">
              © {currentYear} ReplyFlowHQ. All rights reserved.
            </p>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
              <span className="text-muted-foreground text-base">
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
  console.log('[ROOT REDIRECT SIGNED IN TO DASHBOARD] Starting auth check')
  console.log('[ROOT PAGE] rendering homepage')
  
  let cookieStore
  try {
    cookieStore = cookies()
    console.log('[ROOT PAGE] cookies type:', typeof cookieStore)
    console.log('[ROOT PAGE] cookies has getAll:', typeof cookieStore.getAll)
  } catch (error) {
    console.error('[ROOT PAGE] cookies() error:', error)
    throw error
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          try {
            if (!cookieStore) {
              console.warn('[ROOT PAGE] cookieStore is not available')
              return []
            }
            if (typeof cookieStore.getAll !== 'function') {
              console.warn('[ROOT PAGE] cookieStore.getAll is not a function, type:', typeof cookieStore)
              return []
            }
            return cookieStore.getAll()
          } catch (error) {
            console.error('[ROOT PAGE] cookieStore.getAll() error:', error)
            return []
          }
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getSession()
  const session = data?.session

  if (session?.user) {
    console.log('[ROOT REDIRECT SIGNED IN TO DASHBOARD] User is authenticated')
    
    // Check if user has a business
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    console.log('[ROOT REDIRECT SIGNED IN TO DASHBOARD] Business check', {
      hasBusiness: !!business,
      onboardingStatus: business?.onboarding_status,
      subscriptionStatus: business?.subscription_status
    })

    // Redirect to dashboard if business exists and setup is complete
    if (business) {
      console.log('[ROOT REDIRECT SIGNED IN TO DASHBOARD] Redirecting to dashboard')
      redirect('/dashboard')
    } else {
      console.log('[ROOT REDIRECT SIGNED IN TO DASHBOARD] Redirecting to onboarding')
      redirect('/onboarding')
    }
  }

  console.log('[ROOT REDIRECT SIGNED IN TO DASHBOARD] Rendering public homepage for unauthenticated user')
  console.log('[ROOT PAGE] before public homepage component render')
  
  // Render public homepage for unauthenticated users
  return (
    <>
      {(() => { console.log('[ROOT PAGE] before StructuredData'); return null; })()}
      <StructuredData />
      {(() => { console.log('[ROOT PAGE] after StructuredData'); return null; })()}
      {(() => { console.log('[ROOT PAGE] before PageBackground'); return null; })()}
      <PageBackground>
        {(() => { console.log('[ROOT PAGE] before SSRSafeNavbar'); return null; })()}
        <SSRSafeNavbar forceDark={true} />
        {(() => { console.log('[ROOT PAGE] after SSRSafeNavbar'); return null; })()}
      
      {/* Hero Section - SAFE VERSION WITHOUT FRAMER-MOTION */}
      {(() => { console.log('[ROOT PAGE] before safe Hero Section'); return null; })()}
      <HomepageErrorBoundary>
        <section className="relative flex flex-col items-center justify-center py-12 md:py-28 text-center bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-muted dark:to-background">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent dark:from-transparent dark:via-muted/30 dark:to-transparent"></div>
          <div className="max-w-6xl mx-auto px-6 lg:px-8 space-y-4 relative z-10">
            {(() => { console.log('[ROOT PAGE] before hero content'); return null; })()}
            <div className="flex flex-col items-center text-center">
              <h1 className="text-3xl sm:text-4xl md:text-7xl font-bold tracking-tight leading-[1.1] sm:leading-[1.15] text-slate-900 dark:text-foreground">
                Never Miss a Lead Again
              </h1>
              <p className="text-base sm:text-lg md:text-2xl text-slate-700 dark:text-slate-300 max-w-2xl sm:max-w-3xl leading-relaxed mt-3 sm:mt-5">
                Turn missed calls into conversations.
              </p>
              
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                {/* Primary CTA */}
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center h-11 sm:h-12 px-4 sm:px-8 w-[280px] sm:w-auto sm:min-w-[240px] bg-blue-600 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                  <span className="sm:hidden">Start Free Trial</span>
                  <span className="hidden sm:inline">Start 14-Day Free Trial</span>
                </Link>
              </div>

              {/* Pricing Information - Desktop and Mobile */}
              <div className="mt-4 sm:mt-3 flex flex-col items-center gap-0.5">
                <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">14-Day Free Trial</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">$49/month after trial</span>
              </div>

              {/* Trust Indicators - Desktop Only */}
              <div className="mt-4 hidden sm:block">
                <div className="inline-flex flex-col items-start gap-2 mx-auto">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Keep Your Existing Number</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Setup In Under 5 Minutes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>No Contracts</span>
                  </div>
                </div>
              </div>

              {/* Trust Indicators - Mobile Only */}
              <div className="mt-6 sm:hidden">
                <div className="inline-flex flex-col items-start gap-2 mx-auto">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>14-Day Free Trial</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>No Contracts</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Keep Your Existing Number</span>
                  </div>
                </div>
              </div>
            </div>
            {(() => { console.log('[ROOT PAGE] after hero content'); return null; })()}
          </div>
        </section>
      </HomepageErrorBoundary>
      {(() => { console.log('[ROOT PAGE] after safe Hero Section'); return null; })()}

      
      
      
      {/* How It Works */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-12 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                How ReplyFlow Works
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Turn missed calls into conversations in 5 simple steps.
              </p>
            </div>
            
            {/* Desktop: Horizontal Flow */}
            <div className="hidden lg:flex items-center justify-between gap-4 max-w-5xl mx-auto">
              {/* Customer Calls */}
              <div className="flex flex-col items-center text-center group min-h-[180px]">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">Customer Calls</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Incoming call from potential customer</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Call Goes Unanswered */}
              <div className="flex flex-col items-center text-center group min-h-[180px]">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">Call Goes Unanswered</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">You can't answer the phone</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* ReplyFlow Captures Information */}
              <div className="flex flex-col items-center text-center group min-h-[180px]">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">ReplyFlow Captures Information</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">AI collects caller details automatically</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Customer Receives Response */}
              <div className="flex flex-col items-center text-center group min-h-[180px]">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">Customer Receives Response</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Instant text message sent to caller</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Lead Appears In Dashboard */}
              <div className="flex flex-col items-center text-center group min-h-[180px]">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">Lead Appears In Dashboard</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">All information saved and ready for follow-up</p>
              </div>
            </div>
            
            {/* Mobile: Vertical Flow */}
            <div className="lg:hidden space-y-3 max-w-md mx-auto">
              {/* Customer Calls */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Customer Calls</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Incoming call from potential customer</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Call Goes Unanswered */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Call Goes Unanswered</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">You can't answer the phone</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* ReplyFlow Captures Information */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">ReplyFlow Captures Information</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">AI collects caller details automatically</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Customer Receives Response */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Customer Receives Response</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Instant text message sent to caller</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Lead Appears In Dashboard */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Lead Appears In Dashboard</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">All information saved and ready for follow-up</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Lead Capture Callout */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-background py-8 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-6 lg:px-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-3">
                Two Ways ReplyFlow Captures Leads
              </h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Instant text-back when a customer calls and nobody answers</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>AI voicemail intake when a caller leaves details</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      
      
      {/* Dashboard Showcase Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-32 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Everything In One Dashboard
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Manage leads, conversations, follow-ups, and call activity from one place.
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Dashboard Mockup */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <div className="bg-slate-900 dark:bg-slate-900 px-4 py-3 border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-slate-400 text-sm ml-4">ReplyFlow Dashboard</span>
                  </div>
                </div>
                
                <div className="p-4 sm:p-6 md:p-8 space-y-4 md:space-y-6">
                  {/* Navigation Tabs */}
                  <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg">Leads</button>
                    <button className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg">Inbox</button>
                    <button className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg">Calendar</button>
                    <button className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg">AI Calls</button>
                  </div>
                  
                  {/* Leads Table */}
                  <div className="space-y-2">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800 dark:text-green-200">John Smith</div>
                          <div className="text-sm text-green-600 dark:text-green-400">Water heater leak • Urgent</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">2:34 PM</div>
                          <div className="bg-green-600 text-white text-xs px-2 py-1 rounded">New</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">Sarah Johnson</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">AC repair • Medium</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">1:15 PM</div>
                          <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded">Contacted</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">Mike Davis</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">Plumbing estimate • Low</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">11:30 AM</div>
                          <div className="bg-slate-600 text-white text-xs px-2 py-1 rounded">Scheduled</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Features Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-foreground mb-2">Lead Management</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Track every lead with status updates and priority levels</p>
                </div>
                
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800">
                  <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-foreground mb-2">Conversation Inbox</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">All customer messages in one unified inbox</p>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                  <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-foreground mb-2">Calendar Integration</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Sync appointments and schedule follow-ups automatically</p>
                </div>
                
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
                  <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-foreground mb-2">AI Call History</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Review transcripts and summaries of all AI calls</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Features Section */}
      <HomepageErrorBoundary>
        <section id="features-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-16 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Everything You Need To Capture More Leads
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Complete lead capture platform with all the tools your business needs
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Keep Your Existing Number */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Keep Your Existing Number</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  No need to change your business phone number. Simply forward missed calls to ReplyFlow.
                </p>
              </div>

              {/* AI Voicemail Intake */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">AI Voicemail Intake</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Collect caller information automatically and receive an AI-generated summary.
                </p>
              </div>

              {/* Instant Text-Back */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Instant Text-Back</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Automatically respond to missed calls within seconds.
                </p>
              </div>

              {/* Calendar Booking */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Calendar Booking</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Allow customers to schedule appointments without phone tag.
                </p>
              </div>

            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Why Businesses Choose ReplyFlow - Trust Section */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-background py-16 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Why Businesses Choose ReplyFlow
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                The trusted solution for missed call recovery and lead capture
              </p>
            </div>

            {/* Desktop 3x2 Grid Layout */}
            <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6 mb-8">
              {/* Works with your existing phone number */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">Works with your existing phone number</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Keep the number your customers already know.</p>
                  </div>
                </div>
              </div>

              {/* No app required */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">No app required</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Customers simply call your business as normal.</p>
                  </div>
                </div>
              </div>

              {/* Setup in under 5 minutes */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">Setup in under 5 minutes</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Get started quickly with guided onboarding.</p>
                  </div>
                </div>
              </div>

              {/* 14-day free trial */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">14-day free trial</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Try ReplyFlow risk-free before subscribing.</p>
                  </div>
                </div>
              </div>

              {/* AI-powered call intake */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">AI-powered call intake</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">AI can collect caller information when you're unavailable.</p>
                  </div>
                </div>
              </div>

              {/* Automatic lead capture */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">Automatic lead capture</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Missed calls become organized leads automatically.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="lg:hidden space-y-4">
              {/* Works with your existing phone number */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">Works with your existing phone number</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Keep the number your customers already know.</p>
                  </div>
                </div>
              </div>

              {/* No app required */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">No app required</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Customers simply call your business as normal.</p>
                  </div>
                </div>
              </div>

              {/* Setup in under 5 minutes */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">Setup in under 5 minutes</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Get started quickly with guided onboarding.</p>
                  </div>
                </div>
              </div>

              {/* 14-day free trial */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">14-day free trial</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Try ReplyFlow risk-free before subscribing.</p>
                  </div>
                </div>
              </div>

              {/* AI-powered call intake */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">AI-powered call intake</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">AI can collect caller information when you're unavailable.</p>
                  </div>
                </div>
              </div>

              {/* Automatic lead capture */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">Automatic lead capture</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Missed calls become organized leads automatically.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      
      {/* Final CTA Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 py-24 sm:py-28 border-t border-blue-200 dark:border-blue-800">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground mb-7">
                Start Capturing More Leads Today
              </h2>
              <p className="text-xl md:text-2xl text-slate-600 dark:text-muted-foreground mb-12 leading-relaxed">
                Stop losing opportunities from missed calls and give every customer a faster response.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                <Link
                  href="/signup"
                  className="h-14 px-8 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-lg"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/demo"
                  className="h-14 px-8 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold rounded-xl shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-lg border border-blue-200 dark:border-blue-800"
                >
                  Book Demo
                </Link>
              </div>
              
              <div className="mt-8 text-sm text-slate-600 dark:text-slate-400">
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
