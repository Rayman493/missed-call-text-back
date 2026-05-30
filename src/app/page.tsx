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
                  className="inline-flex items-center justify-center h-14 px-10 min-w-[200px] bg-blue-600 text-white font-bold text-lg rounded-xl shadow-xl hover:bg-blue-700 hover:shadow-2xl transition-all duration-200 hover:scale-105"
                >
                  Start 14-Day Free Trial
                </Link>
              </div>

              {/* Pricing Information - Desktop and Mobile */}
              <div className="mt-3 flex flex-col items-center gap-0.5">
                <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">14-Day Free Trial</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">$49/month after trial</span>
              </div>

              {/* Small Trust Indicators - Desktop Only */}
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 hidden sm:block">
                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Keep Your Existing Number</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Setup In Under 5 Minutes</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>No Contracts</span>
                </div>
              </div>

              {/* Trust Pills - Mobile Only */}
              <div className="mt-4 flex flex-col items-center gap-2 sm:hidden">
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

              {/* Enhanced Trust Indicators - Desktop Only */}
              <div className="mt-4 sm:mt-6 sm:pt-4 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 hidden sm:block">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8">
                  <div className="flex flex-col items-center text-center group">
                    <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-105">
                      <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300">
                      Works with your existing number
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center group">
                    <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-105">
                      <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300">
                      Setup in under 5 minutes
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center group">
                    <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-105">
                      <svg className="w-7 h-7 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300">
                      14-day free trial
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center group">
                    <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-105">
                      <svg className="w-7 h-7 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300">
                      Built for local businesses
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {(() => { console.log('[ROOT PAGE] after hero content'); return null; })()}
          </div>
        </section>
      </HomepageErrorBoundary>
      {(() => { console.log('[ROOT PAGE] after safe Hero Section'); return null; })()}

      {/* Mobile-Only: How It Works Section */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-background py-12 border-t border-slate-200 dark:border-slate-800 sm:hidden">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-foreground mb-2">
                How ReplyFlow Works
              </h2>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                Missed calls become conversations in 4 steps
              </p>
            </div>
            
            <div className="max-w-md mx-auto space-y-1.5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-foreground">Missed Call</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Customer calls your business</div>
                </div>
              </div>
              
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-foreground">AI Voicemail Intake</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Captures details automatically</div>
                </div>
              </div>
              
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-foreground">Automated Text-Back</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Sends message to the caller</div>
                </div>
              </div>
              
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-foreground">Lead Captured</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Lead appears in your dashboard</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Why Businesses Use ReplyFlow Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-white to-slate-50 dark:from-background dark:to-muted py-16 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-foreground mb-3">
                Why Businesses Use ReplyFlow
              </h2>
              <p className="text-base md:text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Capture every opportunity, even when you can't answer the phone.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-card rounded-xl p-6 border border-slate-200 dark:border-slate-700 text-center shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-foreground mb-2">Works With Your Existing Number</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">No need to change your business number or reprint marketing materials.</p>
              </div>
              
              <div className="bg-white dark:bg-card rounded-xl p-6 border border-slate-200 dark:border-slate-700 text-center shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-foreground mb-2">Setup In Under 5 Minutes</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Get started quickly with simple call forwarding configuration.</p>
              </div>
              
              <div className="bg-white dark:bg-card rounded-xl p-6 border border-slate-200 dark:border-slate-700 text-center shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-foreground mb-2">Automated Text-Back</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Automatically text callers back to start conversations immediately.</p>
              </div>
              
              <div className="bg-white dark:bg-card rounded-xl p-6 border border-slate-200 dark:border-slate-700 text-center shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-foreground mb-2">Capture More Leads</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Never miss a potential customer even when you're busy or closed.</p>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Mobile-Only: Pricing Section */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-background py-12 border-t border-slate-200 dark:border-slate-800 sm:hidden">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
                <div className="text-blue-600 dark:text-blue-400 font-bold text-xl mb-2">14-Day Free Trial</div>
                <div className="text-slate-900 dark:text-foreground text-2xl font-bold mb-4">$49/month after trial</div>
                <div className="text-slate-600 dark:text-slate-400 text-sm mb-4">Keep using the business number you already advertise.</div>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center h-12 px-8 bg-blue-600 text-white font-bold text-base rounded-xl shadow-lg hover:bg-blue-700 transition-all duration-200"
                >
                  Start 14-Day Free Trial
                </Link>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* How ReplyFlow Captures Every Opportunity Flow */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-12 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                How ReplyFlow Works
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                When you miss a call, ReplyFlow helps turn it into a conversation.
              </p>
            </div>
            
            {/* Desktop: Horizontal Flow - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
            <div className="hidden lg:flex items-center justify-between gap-4 max-w-5xl mx-auto">
              {/* Customer Calls */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Customer Calls</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Incoming call from potential customer</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Call Goes Unanswered - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Call Goes Unanswered</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">You can't answer the phone</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* AI Voicemail Intake - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">AI Voicemail Intake</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Captures details automatically</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Automated Text-Back - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Automated Text-Back</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Sends message to the caller</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Lead Captured - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Lead Captured</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Lead appears in your dashboard</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Conversation Started - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Conversation Started</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Customer engaged via SMS</p>
              </div>
            </div>
            
            {/* Mobile: Vertical Flow - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
            <div className="lg:hidden space-y-4 max-w-md mx-auto">
              {/* Customer Calls */}
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 min-h-[100px]">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">Customer Calls</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Incoming call from potential customer</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* AI Voicemail OR Missed Call - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 min-h-[100px]">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">AI Voicemail OR Missed Call</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">AI takes message or call goes to voicemail</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Automated SMS Sent - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 min-h-[100px]">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">Automated SMS Sent</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Instant text back to customer</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Lead Captured - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 min-h-[100px]">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">Lead Captured</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Customer information saved</p>
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Conversation Started - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 min-h-[100px]">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">Conversation Started</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Customer engaged via SMS</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Two Ways ReplyFlow Captures Leads Section */}
      <HomepageErrorBoundary>
        <section id="two-ways-capture-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Two Ways ReplyFlow Captures Leads
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Whether a call goes to AI voicemail or is missed entirely, ReplyFlow helps capture the opportunity.
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* AI Voicemail Intake Card - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-2xl shadow-xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-foreground">AI Voicemail Intake</h3>
                    <p className="text-blue-700 dark:text-blue-300 font-medium">Captures details after a missed call</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">1</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Customer calls your business</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Incoming call rings your existing business number</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">2</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">If you do not answer</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">The call forwards to ReplyFlow after your normal ring time</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">3</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">AI voicemail answers</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">ReplyFlow asks for the caller's name and reason for calling</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">4</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Captures caller details</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Name, phone number, and service request are saved</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">5</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Creates a lead automatically</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">The lead appears in your dashboard</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">6</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Follow-up can begin</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">You can text the caller from the conversation inbox</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Missed Call Recovery Card */}
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl shadow-xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-foreground">Missed Call Recovery</h3>
                    <p className="text-emerald-700 dark:text-emerald-300 font-medium">Sends instant SMS</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">1</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Call goes unanswered</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Customer call goes to voicemail</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">2</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">ReplyFlow sends a text immediately</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Automated SMS reaches out within seconds</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">3</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Customer replies</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Customer responds with their needs</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">4</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Lead is created automatically</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">All details captured in your dashboard</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* AI Voicemail Intake Section - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-muted py-24 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                How ReplyFlow Works
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                See what happens when a customer calls and you can't answer.
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              <div className="grid gap-6">
                {/* Step 1: Incoming Call */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">1</span>
                      </div>
                      <div className="text-white font-semibold">Incoming Call</div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-foreground">Premier Plumbing</div>
                        <div className="text-slate-600 dark:text-slate-400 text-sm">(555) 123-4567</div>
                      </div>
                      <div className="text-blue-600 dark:text-blue-400 font-medium">
                        Ringing...
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                      Ringing...
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mt-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                      Ringing...
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mt-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                      Ringing...
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        No Answer
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Forwarded to ReplyFlow */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">2</span>
                      </div>
                      <div className="text-white font-semibold">Forwarded to ReplyFlow</div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-3">
                      <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <div className="text-slate-700 dark:text-slate-300">
                        Call automatically forwards after your normal ring time
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3: AI Voicemail Message */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">3</span>
                      </div>
                      <div className="text-white font-semibold">AI Voicemail Message</div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                          </svg>
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-foreground">Premier Plumbing AI</div>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300 space-y-2">
                        <p>"Hi, you've reached Premier Plumbing.</p>
                        <p>Sorry we missed your call.</p>
                        <p>Please leave your name, phone number, and a brief description of what you need help with.</p>
                        <p>We'll get back to you shortly."</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4: Captured Lead Card */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">4</span>
                      </div>
                      <div className="text-white font-semibold">Captured Lead</div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Name</div>
                          <div className="font-semibold text-slate-900 dark:text-foreground">John Smith</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Phone</div>
                          <div className="font-semibold text-slate-900 dark:text-foreground">(555) 123-4567</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Service</div>
                          <div className="font-semibold text-slate-900 dark:text-foreground">Water heater leaking</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Status</div>
                          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                            New Lead
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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

      {/* Complete Features Grid Section */}
      <HomepageErrorBoundary>
        <section id="features-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-20 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Everything You Need To Capture More Leads
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-3xl mx-auto">
                Complete lead capture platform with all the tools your business needs
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              
              {/* AI Voicemail Intake */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">AI Voicemail Intake</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Captures caller details after missed calls
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium mt-auto">
                  <span>✓ Voicemail Intake</span>
                  <span>✓ Caller Details</span>
                </div>
              </div>

              {/* Missed Call Text Back */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Missed Call Text Back</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Automatically texts missed callers to recover every opportunity
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-auto">
                  <span>✓ Instant Response</span>
                  <span>✓ Custom Messages</span>
                </div>
              </div>

              {/* Lead Inbox */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Lead Inbox</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  View every conversation and lead in one unified dashboard
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium mt-auto">
                  <span>✓ Unified View</span>
                  <span>✓ Status Tracking</span>
                </div>
              </div>

              {/* Calendar Integration */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Calendar Integration</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  View and sync your existing calendar appointments
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-teal-600 dark:text-teal-400 font-medium mt-auto">
                  <span>✓ Google Sync</span>
                  <span>✓ View Appointments</span>
                </div>
              </div>

              {/* AI Call Summaries */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">AI Call Summaries</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Review AI call transcripts and intelligent summaries
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-orange-600 dark:text-orange-400 font-medium mt-auto">
                  <span>✓ Full Transcripts</span>
                  <span>✓ AI Summaries</span>
                </div>
              </div>

              {/* Follow-Up Automation */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Follow-Up Automation</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center">
                  Automatically nurture leads with smart timing and reminders
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium mt-auto">
                  <span>✓ Smart Timing</span>
                  <span>✓ Auto Reminders</span>
                </div>
              </div>

            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Tabbed Demo Section */}
      <HomepageErrorBoundary>
        <TabbedDemoSection />
      </HomepageErrorBoundary>

      {/* Know Why They Called Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
              Know why they called before you call back
            </h2>
            <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
              AI captures every detail so you can prioritize and prepare for every call
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature Card 1 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 text-center">AI Call Summaries</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground text-left">
                Get instant, business-friendly summaries of every AI call with caller details and reason for calling.
              </p>
            </div>
            
            {/* Feature Card 2 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 text-center">Full Call Transcripts</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground text-left">
                Complete word-for-word transcripts with caller and assistant roles for full context.
              </p>
            </div>
            
            {/* Feature Card 3 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 text-center">Lead Details Extracted Automatically</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground text-left">
                AI captures caller name, urgency level, location, and preferred callback times automatically.
              </p>
            </div>
            
            {/* Feature Card 4 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 text-center">Follow-Up Automation</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground text-left">
                Automatic follow-up messages and scheduling to keep leads engaged without manual work.
              </p>
            </div>
            
            {/* Feature Card 5 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 text-center">Voicemail Fallback</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground text-left">
                If AI can't answer, callers can leave a voicemail that's transcribed and stored in your dashboard.
              </p>
            </div>
            
            {/* Feature Card 6 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 text-center">Simple Dashboard</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground text-left">
                Organized lead management with conversation history, call details, and follow-up tracking.
              </p>
            </div>
          </div>
        </div>
      </section>
      </HomepageErrorBoundary>

      {/* Trust Section */}
      {(() => { console.log('[ROOT PAGE] before Trust Section'); return null; })()}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-20 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
              Built for Local Service Businesses
            </h2>
            <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
              Created for businesses that can't afford to miss calls
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Capture More Leads</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Never lose a customer to a missed call again
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Recover Missed Calls</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AI voicemail intake and automated text-back working together
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Save Time</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Automation handles follow-ups and scheduling
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Track Your Leads</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Monitor and manage captured leads in one place
              </p>
            </div>
          </div>
        </div>
      </section>
      </HomepageErrorBoundary>

      {/* CTA Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 py-24 sm:py-28 border-t border-blue-200 dark:border-blue-800">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground mb-7">
                Start Capturing More Leads Today
              </h2>
              <p className="text-xl md:text-2xl text-slate-600 dark:text-muted-foreground mb-12 leading-relaxed">
                Capture missed-call opportunities automatically.<br />
                Respond faster with automated text-back.<br />
                Stay connected even when you can't answer the phone.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                <Link
                  href="/signup"
                  className="h-14 px-8 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-lg"
                >
                  Start 14-Day Free Trial
                </Link>
                <Link
                  href="/demo"
                  className="h-14 px-8 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold rounded-xl shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-lg border border-blue-200 dark:border-blue-800"
                >
                  View Demo
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
