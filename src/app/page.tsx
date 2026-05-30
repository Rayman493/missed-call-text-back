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
              Conversational missed-call response automation for modern businesses. 
              Capture leads and provide exceptional customer service.
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
        <section className="relative flex flex-col items-center justify-center py-20 md:py-28 text-center bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-muted dark:to-background">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent dark:from-transparent dark:via-muted/30 dark:to-transparent"></div>
          <div className="max-w-5xl mx-auto px-6 lg:px-8 space-y-8 relative z-10">
            {(() => { console.log('[ROOT PAGE] before hero content'); return null; })()}
            <div className="flex flex-col items-center text-center">
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.15] text-slate-900 dark:text-foreground">
                Never Miss a Lead Again
              </h1>
              <p className="text-lg md:text-xl text-slate-600 dark:text-muted-foreground max-w-2xl leading-relaxed mt-5 sm:mt-6">
                ReplyFlowHQ captures every customer call with AI receptionist, instant text responses, and smart follow-ups—all in one lead management platform.
              </p>
              
              {/* Pricing Information */}
              <div className="flex flex-col items-center gap-2 mt-4">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">14-day free trial</span>
                <span className="text-slate-700 dark:text-foreground text-lg">$49/month after trial</span>
              </div>
              
              {/* Trust Copy */}
              <div className="flex flex-col items-center gap-1 mt-3">
                <span className="text-slate-500 dark:text-muted-foreground text-sm">No contracts. Cancel anytime.</span>
                <span className="text-slate-500 dark:text-muted-foreground text-sm">Keep using the business number you already advertise everywhere.</span>
              </div>
              
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                {/* Primary CTA */}
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center h-12 px-8 min-w-[160px] bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200"
                >
                  Start Free Trial
                </Link>
              </div>

              {/* Trust/Simplicity Bar */}
              <div className="mt-12 pt-8 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      Works with your existing number
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      AI call summaries
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      Instant missed-call texts
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      Built for local service businesses
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

      {/* How It Works Section - SAFE VERSION WITHOUT FRAMER-MOTION */}
      {(() => { console.log('[ROOT PAGE] before How It Works Section'); return null; })()}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                How ReplyFlow Works
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
                Never lose another lead from a missed call.
              </p>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
            {/* Card 1 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-6 text-center relative">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">1</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-3">Customer calls your business</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">A potential customer calls your business number</p>
            </div>
            
            {/* Card 2 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-6 text-center relative">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">2</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-3">AI answers OR text is sent</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">AI receptionist answers live or instant text response is sent</p>
            </div>
            
            {/* Card 3 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-6 text-center relative">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">3</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-3">AI/text captures the details</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">AI extracts caller info, reason, and urgency automatically</p>
            </div>

            {/* Card 4 */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-6 text-center relative">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">4</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-3">Lead captured in dashboard</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">All customer details organized in your lead management dashboard</p>
            </div>
          </div>
        </div>
      </section>
      </HomepageErrorBoundary>

      {/* Features Section */}
      <HomepageErrorBoundary>
        <section className="bg-white dark:bg-slate-900 py-24 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
                Complete Business Communication Platform
              </h2>
              <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-3xl mx-auto">
                Everything you need to capture, manage, and grow your customer base
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              
              {/* Missed Call Text Back */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Missed Call Text Back</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Instant SMS sent after missed calls to capture leads that would otherwise be lost
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Automatic text responses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Capture lost opportunities</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Customizable messaging</span>
                  </li>
                </ul>
              </div>

              {/* AI Receptionist */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">AI Receptionist</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Answers missed calls automatically, collects caller information, and captures every lead
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>24/7 call answering</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Collects caller details</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Captures reason for calling</span>
                  </li>
                </ul>
              </div>

              {/* Lead Management */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Lead Management</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Automatic lead creation with status tracking and organized customer conversations
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Automatic lead creation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Lead status tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Customer conversation history</span>
                  </li>
                </ul>
              </div>

              {/* Follow-Up Automation */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Follow-Up Automation</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Automated follow-up messaging with business-hours aware scheduling
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Smart follow-up timing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Business-hours scheduling</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Automated reminders</span>
                  </li>
                </ul>
              </div>

              {/* Unified Inbox */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Unified Inbox</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  View all conversations in one place and manage customer communications efficiently
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>All conversations in one view</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Easy conversation management</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Team collaboration tools</span>
                  </li>
                </ul>
              </div>

              {/* Dedicated Business Numbers */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Dedicated Business Numbers</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Local business numbers with business identity preserved and professional appearance
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Local business numbers</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Business identity preserved</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Professional appearance</span>
                  </li>
                </ul>
              </div>

              {/* Calendar Integration */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Calendar Integration</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Sync with Google Calendar for smart scheduling and appointment booking
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Google Calendar sync</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Smart scheduling</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Appointment booking</span>
                  </li>
                </ul>
              </div>

              {/* Business Hours Routing */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Business Hours Routing</h3>
                <p className="text-slate-600 dark:text-muted-foreground mb-4">
                  Intelligent call routing based on your business hours and availability
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Business hours detection</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>After-hours handling</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Smart call forwarding</span>
                  </li>
                </ul>
              </div>

            </div>
          </div>
        </section>
      </HomepageErrorBoundary>

      {/* Example Conversation Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
              AI Call Intake & SMS Conversations
            </h2>
            <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
              See how AI answers calls and follows up with SMS to capture every lead
            </p>
          </div>
          
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800">
              {/* AI Call Summary Note */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400">📞</span>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>AI Call Summary:</strong> John Smith called about leaking water heater. Issue appears urgent because water is actively leaking. Caller requested callback this afternoon.
                  </p>
                </div>
              </div>

              {/* Business Message 1 - ReplyFlow sends first text */}
              <div className="flex justify-end mb-5">
                <div className="bg-blue-600 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-white">Hi John, this is Premier Plumbing. I heard you're dealing with a leaking water heater - that sounds urgent! When would be a good time to call you back this afternoon?</p>
                  <p className="text-xs text-blue-200 mt-1">2:34 PM</p>
                </div>
              </div>
              
              {/* Customer Message 1 */}
              <div className="flex justify-start mb-5">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-slate-800 dark:text-slate-200">Thanks for responding! Anytime after 3 PM would work. The water is really coming out fast.</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:35 PM</p>
                </div>
              </div>
              
              {/* Business Message 2 */}
              <div className="flex justify-end mb-5">
                <div className="bg-blue-600 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-white">Perfect - I'll call you at 3:15 PM. In the meantime, can you turn off the water supply to the heater? There should be a valve near the heater.</p>
                  <p className="text-xs text-blue-200 mt-1">2:36 PM</p>
                </div>
              </div>
              
              {/* Customer Message 2 */}
              <div className="flex justify-start mb-5">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-slate-800 dark:text-slate-200">Found it and turned it off. You're a lifesaver! See you at 3:15.</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:37 PM</p>
                </div>
              </div>
              
              {/* Lead Summary */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✅</span>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    <strong>Lead Captured:</strong> Urgent water heater replacement job scheduled for 3:15 PM today.
                  </p>
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
        <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
              Results local businesses see
            </h2>
            <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
              Real impact from businesses that never miss a lead
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-card/80 border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-8 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-100 dark:border-blue-800 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <span className="text-2xl font-bold text-white">3x</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">More Leads Captured</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                Businesses capture 3x more leads that would have been lost to missed calls
              </p>
            </div>
            
            <div className="bg-white dark:bg-card/80 border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-8 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 border border-emerald-100 dark:border-emerald-800 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <span className="text-2xl font-bold text-white">85%</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Faster Response Times</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                Instant responses mean 85% of customers book within 24 hours
              </p>
            </div>
            
            <div className="bg-white dark:bg-card/80 border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-8 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 border border-purple-100 dark:border-purple-800 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <span className="text-2xl font-bold text-white">24/7</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Always Available</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                AI answers calls around the clock so you never miss an opportunity
              </p>
            </div>
          </div>
        </div>
      </section>
      </HomepageErrorBoundary>

      {/* CTA Section */}
      <HomepageErrorBoundary>
        <section className="bg-gradient-to-br from-slate-50 to-white dark:from-muted dark:to-background py-24 sm:py-28 border-t border-slate-200 dark:border-border">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground mb-7">
              Never Miss a Lead Again
            </h2>
            <p className="text-xl md:text-2xl text-slate-600 dark:text-muted-foreground mb-12 leading-relaxed">
              ReplyFlowHQ captures every customer call with AI receptionist, instant text responses, and smart follow-ups—all in one platform.
            </p>
            <Link
              href="/signup"
              className="h-14 px-10 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-lg"
            >
              Start Your 14-Day Free Trial
            </Link>
          </div>
        </div>
      </section>
      </HomepageErrorBoundary>
      <HomepageFooter />
      </PageBackground>
    </>
  )
}
