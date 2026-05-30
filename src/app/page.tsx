import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import HomepageErrorBoundary from '@/components/HomepageErrorBoundary'
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
              AI Receptionist, missed call recovery, lead capture, calendar integration, 
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
          <div className="max-w-5xl mx-auto px-6 lg:px-8 space-y-4 relative z-10">
            {(() => { console.log('[ROOT PAGE] before hero content'); return null; })()}
            <div className="flex flex-col items-center text-center">
              <h1 className="text-4xl md:text-7xl font-bold tracking-tight leading-[1.1] text-slate-900 dark:text-foreground">
                Never Miss a Lead Again
              </h1>
              <p className="text-lg md:text-2xl text-slate-700 dark:text-slate-300 max-w-3xl leading-relaxed mt-5">
                ReplyFlow answers calls with AI, texts back missed callers, and automatically captures leads so your business never loses another opportunity.
              </p>
              
              {/* Benefit Bullets */}
              {/* Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="mt-5">
                <div className="w-fit mx-auto flex flex-col items-center space-y-2">
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-base md:text-lg">Missed-call text-back</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-base md:text-lg">AI voicemail intake</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-base md:text-lg">Lead inbox and conversation history</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-base md:text-lg">Works with your existing business number</span>
                  </div>
                </div>
              </div>
              
              {/* Pricing Information */}
              <div id="pricing-section" className="flex flex-col items-center gap-1 mt-3">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-base">14-day free trial</span>
                <span className="text-slate-700 dark:text-foreground text-base">$49/month after trial</span>
              </div>
              
              {/* Trust Copy */}
              <div className="flex flex-col items-center gap-1 mt-2">
                <span className="text-slate-500 dark:text-muted-foreground text-sm">No contracts. Cancel anytime.</span>
                <span className="text-slate-500 dark:text-muted-foreground text-sm">Keep using the business number you already advertise everywhere.</span>
              </div>
              
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                {/* Primary CTA */}
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center h-14 px-10 min-w-[200px] bg-blue-600 text-white font-bold text-lg rounded-xl shadow-xl hover:bg-blue-700 hover:shadow-2xl transition-all duration-200 hover:scale-105"
                >
                  Start 14-Day Free Trial
                </Link>
              </div>

              {/* Enhanced Trust Indicators */}
              <div className="mt-16 pt-10 border-t border-slate-200/60 dark:border-slate-700/60">
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

      {/* How ReplyFlow Captures Every Opportunity Flow */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-12 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                How ReplyFlow Captures Every Opportunity
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Whether a call is answered by AI or missed entirely, ReplyFlow helps turn callers into customers.
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
              
              {/* AI Voicemail OR Missed Call - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">AI Voicemail OR Missed Call</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">AI takes message or call goes to voicemail</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Automated SMS Sent - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Automated SMS Sent</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Instant text back to customer</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-1 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              
              {/* Lead Captured - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
              <div className="flex flex-col items-center text-center group min-h-[200px]">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2 min-h-[72px] flex items-center justify-center">Lead Captured</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 min-h-[56px] flex items-center justify-center">Customer information saved</p>
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
        <section id="ai-receptionist-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Two Ways ReplyFlow Captures Leads
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Whether a call gets answered or missed, ReplyFlow helps recover the opportunity.
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* AI Receptionist Card */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-2xl shadow-xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-foreground">AI Receptionist</h3>
                    <p className="text-blue-700 dark:text-blue-300 font-medium">Answers calls instantly</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">1</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Customer calls your business</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Incoming call rings your business number</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">2</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">AI answers instantly</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Professional AI receptionist engages caller</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">3</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Collects name</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">AI gathers customer name and details</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">4</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Collects phone number</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Confirms caller's contact information</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">5</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Collects service request</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Understands reason for calling</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">6</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-foreground">Creates a lead automatically</div>
                      <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">Lead appears in your dashboard instantly</div>
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

      {/* AI Receptionist Call Transcript Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-muted py-24 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                AI Receptionist in Action
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                See how our AI answers calls and captures every detail
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              <div className="bg-slate-900 dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                {/* Call Header */}
                <div className="bg-slate-800 dark:bg-slate-900 px-6 py-4 border-b border-slate-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-white font-semibold">Incoming Call</div>
                        <div className="text-slate-400 text-sm">+1 (555) 123-4567</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">LIVE</span>
                      <span className="text-slate-400 text-sm">2:34 PM</span>
                    </div>
                  </div>
                </div>
                
                {/* Call Transcript */}
                <div className="p-6 space-y-4">
                  {/* AI Receptionist */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="bg-blue-600 text-white rounded-2xl rounded-tl-none px-4 py-3 max-w-lg">
                        <p className="text-sm">Hi, this is Premier Plumbing's AI assistant. How can I help you today?</p>
                      </div>
                      <div className="text-slate-400 text-xs mt-1">AI Receptionist • 2:34 PM</div>
                    </div>
                  </div>
                  
                  {/* Caller */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">JS</span>
                    </div>
                    <div className="flex-1">
                      <div className="bg-slate-700 dark:bg-slate-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-lg">
                        <p className="text-sm">Hi, I have a leaking water heater and water is everywhere! Can someone help?</p>
                      </div>
                      <div className="text-slate-400 text-xs mt-1">John Smith • 2:35 PM</div>
                    </div>
                  </div>
                  
                  {/* AI Receptionist */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="bg-blue-600 text-white rounded-2xl rounded-tl-none px-4 py-3 max-w-lg">
                        <p className="text-sm">I understand that's urgent! Let me get some details to help you faster. What's your address and is the water heater gas or electric?</p>
                      </div>
                      <div className="text-slate-400 text-xs mt-1">AI Receptionist • 2:35 PM</div>
                    </div>
                  </div>
                  
                  {/* Caller */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">JS</span>
                    </div>
                    <div className="flex-1">
                      <div className="bg-slate-700 dark:bg-slate-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-lg">
                        <p className="text-sm">123 Main Street, Apartment 4B. It's electric. The water is really coming out fast!</p>
                      </div>
                      <div className="text-slate-400 text-xs mt-1">John Smith • 2:36 PM</div>
                    </div>
                  </div>
                  
                  {/* AI Summary */}
                  <div className="bg-blue-900/50 border border-blue-700 rounded-xl p-4 mt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2h-1a1 1 0 100-2h1a4 4 0 014 4v6a4 4 0 01-4 4H6a4 4 0 01-4-4V5a4 4 0 014-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-blue-400 font-semibold">AI Call Summary</span>
                    </div>
                    <ul className="text-slate-300 text-sm space-y-1">
                      <li>• <strong>Caller:</strong> John Smith, 123 Main Street Apt 4B</li>
                      <li>• <strong>Issue:</strong> Electric water heater leaking heavily</li>
                      <li>• <strong>Urgency:</strong> High - active water leak</li>
                      <li>• <strong>Next Step:</strong> Immediate callback needed</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Dashboard Showcase Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Everything in One Dashboard
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Manage leads, conversations, calendar, and AI calls from a single platform
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
                
                <div className="p-4 space-y-4">
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
              
              {/* AI Receptionist */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">AI Receptionist</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Answers calls instantly and gathers customer information 24/7
                </p>
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                  <span>✓ Live Answering</span>
                  <span>✓ 24/7 Available</span>
                </div>
              </div>

              {/* Missed Call Text Back */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Missed Call Text Back</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Automatically texts missed callers to recover every opportunity
                </p>
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>✓ Instant Response</span>
                  <span>✓ Custom Messages</span>
                </div>
              </div>

              {/* Lead Inbox */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Lead Inbox</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  View every conversation and lead in one unified dashboard
                </p>
                <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                  <span>✓ Unified View</span>
                  <span>✓ Status Tracking</span>
                </div>
              </div>

              {/* Calendar Scheduling */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Calendar Scheduling</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Manage appointments and sync with Google Calendar
                </p>
                <div className="flex items-center gap-2 text-xs text-teal-600 dark:text-teal-400 font-medium">
                  <span>✓ Google Sync</span>
                  <span>✓ Smart Booking</span>
                </div>
              </div>

              {/* AI Call Summaries */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">AI Call Summaries</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Review AI call transcripts and intelligent summaries
                </p>
                <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 font-medium">
                  <span>✓ Full Transcripts</span>
                  <span>✓ AI Summaries</span>
                </div>
              </div>

              {/* Follow-Up Automation */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Follow-Up Automation</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Automatically nurture leads with smart timing and reminders
                </p>
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
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
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                See ReplyFlow In Action
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Watch how AI answers calls and recovers missed opportunities
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              {/* Tab Navigation */}
              <div className="flex justify-center mb-8">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-1 inline-flex">
                  <button className="px-6 py-3 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-md text-sm font-medium shadow-sm">
                    AI Receptionist Call
                  </button>
                  <button className="px-6 py-3 text-slate-600 dark:text-slate-400 rounded-md text-sm font-medium hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
                    SMS Recovery
                  </button>
                </div>
              </div>
              
              {/* Tab Content - AI Receptionist Call */}
              <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800">
                <div className="space-y-4">
                  {/* AI Message */}
                  <div className="flex justify-start mb-4">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">Thanks for calling Wolfie Plumbing. How can I help you today?</p>
                      <p className="text-xs text-blue-200 mt-1">AI Assistant • 2:34 PM</p>
                    </div>
                  </div>
                  
                  {/* Customer Message */}
                  <div className="flex justify-end mb-4">
                    <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">My water heater stopped working.</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Customer • 2:34 PM</p>
                    </div>
                  </div>
                  
                  {/* AI Message */}
                  <div className="flex justify-start mb-4">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">I'd be happy to help. May I have your name?</p>
                      <p className="text-xs text-blue-200 mt-1">AI Assistant • 2:35 PM</p>
                    </div>
                  </div>
                  
                  {/* Customer Message */}
                  <div className="flex justify-end mb-4">
                    <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">John Smith.</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Customer • 2:35 PM</p>
                    </div>
                  </div>
                  
                  {/* AI Message */}
                  <div className="flex justify-start mb-4">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">What's the best phone number to reach you?</p>
                      <p className="text-xs text-blue-200 mt-1">AI Assistant • 2:36 PM</p>
                    </div>
                  </div>
                  
                  {/* Customer Message */}
                  <div className="flex justify-end mb-4">
                    <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">(555) 123-4567</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Customer • 2:36 PM</p>
                    </div>
                  </div>
                  
                  {/* AI Message */}
                  <div className="flex justify-start mb-4">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">Thanks John. Is the water heater leaking or just not heating water?</p>
                      <p className="text-xs text-blue-200 mt-1">AI Assistant • 2:37 PM</p>
                    </div>
                  </div>
                  
                  {/* Customer Message */}
                  <div className="flex justify-end mb-4">
                    <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm">It's leaking pretty badly. There's water everywhere.</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Customer • 2:37 PM</p>
                    </div>
                  </div>
                  
                  {/* Lead Summary */}
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">✅</span>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        <strong>Lead Captured:</strong> John Smith - Urgent water heater leak. Phone: (555) 123-4567. Priority: High.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
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
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">AI Call Summaries</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                Get instant, business-friendly summaries of every AI call with caller details and reason for calling.
              </p>
            </div>
            
            {/* Feature Card 2 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Full Call Transcripts</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                Complete word-for-word transcripts with caller and assistant roles for full context.
              </p>
            </div>
            
            {/* Feature Card 3 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Lead Details Extracted Automatically</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                AI captures caller name, urgency level, location, and preferred callback times automatically.
              </p>
            </div>
            
            {/* Feature Card 4 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Follow-Up Automation</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                Automatic follow-up messages and scheduling to keep leads engaged without manual work.
              </p>
            </div>
            
            {/* Feature Card 5 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Voicemail Fallback</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                If AI can't answer, callers can leave a voicemail that's transcribed and stored in your dashboard.
              </p>
            </div>
            
            {/* Feature Card 6 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Simple Dashboard</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
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
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Answer Every Call</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AI receptionist answers 24/7, instant text backup
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
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground mb-2">Grow Revenue</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Convert more leads into paying customers
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
                AI answers calls.<br />
                ReplyFlow recovers missed opportunities.<br />
                Your business grows without hiring additional staff.
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
