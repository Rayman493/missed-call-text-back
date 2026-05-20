'use client'

import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { clearAnonymousAppState } from '@/lib/clear-anonymous-state'

// Temporary debug banner component (only in development)
function DebugBanner() {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  
  useEffect(() => {
    const supabase = createBrowserClient()
    const gatherDebugInfo = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setDebugInfo({
        pathname: window.location.pathname,
        hasSession: !!session,
        sessionUserId: session?.user?.id,
      })
    }
    gatherDebugInfo()
  }, [])
  
  if (!debugInfo) return null
  
  // Only show in development or if ?debug=true
  if (process.env.NODE_ENV !== 'development' && !window.location.search.includes('debug=true')) {
    return null
  }
  
  return (
    <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-xs p-2 z-50 font-mono">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <span>DEBUG: pathname={debugInfo.pathname} | session={debugInfo.hasSession ? 'YES' : 'NO'} | userId={debugInfo.sessionUserId || 'none'}</span>
        <button onClick={() => window.location.reload()} className="underline">Reload</button>
      </div>
    </div>
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

export default function Home() {
  const { user } = useAuth()
  const { business } = useBusiness()
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const supabase = createBrowserClient()
  
  // Trace log at homepage mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[TRACE Homepage Mounted]', {
        pathname: window.location.pathname,
        search: window.location.search,
        referrer: document.referrer
      })
    }
  }, [])

  // Check if user is authenticated and has active trial/subscription
  const isAuthenticated = !!user
  const hasActiveAccount = isAuthenticated && !!business
  
  // Trace log on Homepage render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const checkoutSuccess = url.searchParams.get('checkout') === 'success'
      console.log('[TRACE Homepage Render]', {
        pathname: window.location.pathname,
        search: window.location.search,
        href: window.location.href,
        referrer: document.referrer,
        checkoutSuccess,
        authState: {
          isAuthenticated,
          hasActiveAccount,
          hasUser: !!user,
          hasBusiness: !!business
        }
      })
    }
  }, [isAuthenticated, hasActiveAccount, user, business])
  
  // Clear anonymous app state for logged-out users
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('[Anonymous State Cleanup] User not authenticated, clearing ReplyFlow local state')
      
      // Log all storage keys before clearing for diagnostics
      const storageKeysToCheck = ['onboarding', 'business', 'setup', 'dashboard', 'checkout', 'signup', 'trial', 'redirect', 'replyflow', 'supabase']
      
      console.log('[Storage Diagnostics] === LOCAL STORAGE BEFORE CLEAR ===')
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key) {
            const keyLower = key.toLowerCase()
            const isRelevant = storageKeysToCheck.some(keyword => keyLower.includes(keyword.toLowerCase()))
            if (isRelevant) {
              const value = localStorage.getItem(key)
              console.log(`[Storage Diagnostics] localStorage: ${key} = ${value}`)
            }
          }
        }
      }
      
      console.log('[Storage Diagnostics] === SESSION STORAGE BEFORE CLEAR ===')
      if (typeof window !== 'undefined' && window.sessionStorage) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key) {
            const keyLower = key.toLowerCase()
            const isRelevant = storageKeysToCheck.some(keyword => keyLower.includes(keyword.toLowerCase()))
            if (isRelevant) {
              const value = sessionStorage.getItem(key)
              console.log(`[Storage Diagnostics] sessionStorage: ${key} = ${value}`)
            }
          }
        }
      }
      
      const { clearedKeys } = clearAnonymousAppState()
      console.log('[Anonymous State Cleanup]', {
        hasSession: false,
        pathname: window.location.pathname,
        clearedKeys,
      })
    }
  }, [isAuthenticated])
  
  // Homepage always shows public marketing page
  // Do NOT auto-redirect authenticated users to onboarding from homepage
  // Users can access onboarding via: Start Free Trial button, Dashboard link, or direct URL
  useEffect(() => {
    console.log('[Homepage] Rendering public homepage (no automatic redirects)')
    setIsCheckingAuth(false)
  }, [])
  
  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Please wait</p>
        </div>
      </div>
    )
  }
  
  return (
    <>
      <DebugBanner />
      <main className="min-h-screen bg-background">
        <SSRSafeNavbar forceDark={true} />
      
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center py-20 md:py-28 text-center bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-muted dark:to-background">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent dark:from-transparent dark:via-muted/30 dark:to-transparent"></div>
        <div className="max-w-5xl mx-auto px-6 lg:px-8 space-y-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.15] text-slate-900 dark:text-foreground">
              Missed Calls Automatically Get a Text Reply
            </h1>
            <p className="text-lg md:text-xl text-slate-600 dark:text-muted-foreground max-w-2xl leading-relaxed mt-5 sm:mt-6">
              ReplyFlow automatically texts back missed callers so you can capture leads, book jobs, and grow your business without losing customers.
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
            
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={isAuthenticated ? (hasActiveAccount ? "/dashboard" : "/onboarding") : "/signup"}
                className="h-12 px-8 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 flex items-center justify-center"
              >
                {isAuthenticated ? (hasActiveAccount ? "Go to Dashboard" : "Complete Setup") : "Start Your Free Trial"}
              </Link>
              <Link
                href="/demo"
                className="h-12 px-8 bg-white dark:bg-secondary text-slate-700 dark:text-secondary-foreground font-semibold rounded-xl border border-slate-200 dark:border-border hover:bg-slate-50 dark:hover:bg-secondary/80 hover:border-slate-300 dark:hover:border-border transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md"
              >
                View Demo
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    Setup in under 5 minutes
                  </span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    No app download required
                  </span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    Built for local businesses
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4"
            >
              How ReplyFlow Works
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto"
            >
              Never lose another lead from a missed call.
            </motion.p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Card 1 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-8 text-center relative"
            >
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">1</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">Customer calls your business</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground leading-relaxed">A potential customer calls your business number</p>
            </motion.div>
            
            {/* Card 2 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-8 text-center relative"
            >
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">2</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">ReplyFlow instantly texts them back</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground leading-relaxed">If you miss the call, we automatically send a personalized text response</p>
            </motion.div>
            
            {/* Card 3 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              viewport={{ once: true }}
              className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-8 text-center relative"
            >
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">3</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-3">The customer replies and becomes a lead</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground leading-relaxed">They reply to your text and you've captured a new lead</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Example Conversation Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4"
            >
              Example Conversation
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto"
            >
              See how ReplyFlow helps you capture leads automatically
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-8 shadow-lg">
              {/* Business Message 1 - ReplyFlow sends first text */}
              <div className="flex justify-end mb-4">
                <div className="bg-blue-600 rounded-2xl rounded-br-none px-4 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-white">Sorry we missed your call — this is Wolfie Plumbing. How can we help?</p>
                  <p className="text-xs text-blue-200 mt-1">2:34 PM</p>
                </div>
              </div>
              
              {/* Customer Message 1 */}
              <div className="flex justify-start mb-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-slate-800 dark:text-slate-200">Do you install water heaters?</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:35 PM</p>
                </div>
              </div>
              
              {/* Business Message 2 */}
              <div className="flex justify-end mb-4">
                <div className="bg-blue-600 rounded-2xl rounded-br-none px-4 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-white">Yes, we do. What size water heater do you need?</p>
                  <p className="text-xs text-blue-200 mt-1">2:36 PM</p>
                </div>
              </div>
              
              {/* Customer Message 2 */}
              <div className="flex justify-start mb-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-slate-800 dark:text-slate-200">50 gallon gas</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:37 PM</p>
                </div>
              </div>
              
              {/* Business Message 3 */}
              <div className="flex justify-end mb-4">
                <div className="bg-blue-600 rounded-2xl rounded-br-none px-4 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-white">Perfect — we can help with that. What zip code are you located in?</p>
                  <p className="text-xs text-blue-200 mt-1">2:38 PM</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
              Trusted by local businesses
            </h2>
            <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
              Built for businesses that value every customer interaction
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="bg-white dark:bg-card/80 border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-8 text-center"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-100 dark:border-blue-800 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">TCPA Compliant</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                Follows SMS best practices and compliance guidelines
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-white dark:bg-card/80 border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-8 text-center"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 border border-emerald-100 dark:border-emerald-800 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Secure & Private</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                Your data is encrypted and never shared with third parties
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              viewport={{ once: true }}
              className="bg-white dark:bg-card/80 border border-slate-200 dark:border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-8 text-center"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 border border-purple-100 dark:border-purple-800 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Instant Setup</h3>
              <p className="text-base text-slate-600 dark:text-muted-foreground">
                Get started in minutes with no technical expertise needed
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-slate-50 to-white dark:from-muted dark:to-background py-24 sm:py-28 border-t border-slate-200 dark:border-border">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground mb-7">
              Ready to never miss a customer again?
            </h2>
            <p className="text-xl md:text-2xl text-slate-600 dark:text-muted-foreground mb-12 leading-relaxed">
              Built for contractors and home services that never want to miss another lead.
            </p>
            <Link
              href="/signup"
              className="h-14 px-10 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-lg"
            >
              Start Your 14-Day Free Trial
            </Link>
          </motion.div>
        </div>
      </section>
      <HomepageFooter />
    </main>
    </>
  )
}
