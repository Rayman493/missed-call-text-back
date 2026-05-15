'use client'

import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

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
  const { user } = useAuth()
  const { business } = useBusiness()
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  
  // Check if user is authenticated and has active trial/subscription
  const isAuthenticated = !!user
  const hasActiveAccount = isAuthenticated && !!business
  
  // Redirect authenticated users to dashboard with retry logic for session race conditions
  useEffect(() => {
    console.log('[Homepage] Checking auth status for redirect decision')
    console.log('[Homepage] isAuthenticated:', isAuthenticated)
    console.log('[Homepage] hasActiveAccount:', hasActiveAccount)
    console.log('[Homepage] user:', user?.id)
    console.log('[Homepage] business:', business?.id)
    console.log('[Homepage] business subscription_status:', business?.subscription_status)
    
    let retryCount = 0
    const maxRetries = 5
    const retryDelay = 500 // 500ms
    
    const checkAndRedirect = async () => {
      if (isAuthenticated && hasActiveAccount) {
        console.log('[Homepage] Authenticated user with active account, redirecting to /dashboard')
        setIsCheckingAuth(false)
        router.replace('/dashboard')
        return
      }
      
      if (isAuthenticated && !hasActiveAccount) {
        // User is authenticated but business data might be loading
        if (retryCount < maxRetries) {
          console.log(`[Homepage] Authenticated but no business data yet, retrying (${retryCount + 1}/${maxRetries})`)
          retryCount++
          setTimeout(checkAndRedirect, retryDelay)
          return
        }
        console.log('[Homepage] Authenticated but no business data after retries, allowing homepage access')
        setIsCheckingAuth(false)
        return
      }
      
      // User is not authenticated
      console.log('[Homepage] User not authenticated, showing homepage')
      setIsCheckingAuth(false)
    }
    
    // Start the check
    checkAndRedirect()
  }, [isAuthenticated, hasActiveAccount, user, business, router])
  
  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }
  
  return (
    <main className="min-h-screen bg-background">
      <SSRSafeNavbar forceDark={true} />
      
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center py-20 md:py-28 text-center bg-gradient-to-b from-background via-muted to-background">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 space-y-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight text-foreground">
              Missed Calls Automatically Get a Text Reply
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              ReplyFlow automatically texts back missed callers so you can capture leads, book jobs, and grow your business without losing customers.
            </p>
            
            {/* Pricing Information */}
            <div className="flex flex-col items-center gap-2 mt-4">
              <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">14-day free trial</span>
              <span className="text-foreground text-lg">$49/month after trial</span>
              <span className="text-muted-foreground text-sm">No contracts, cancel anytime</span>
            </div>
            
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={hasActiveAccount ? "/dashboard" : "/signup"}
                className="h-12 px-8 bg-blue-600 text-white font-semibold rounded-xl shadow-sm hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                {hasActiveAccount ? "Go to Dashboard" : "Start Your Free Trial"}
              </Link>
              <Link
                href="/demo"
                className="h-12 px-8 bg-secondary text-secondary-foreground font-semibold rounded-xl border border-border hover:bg-secondary/80 transition-colors flex items-center justify-center"
              >
                View Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gradient-to-b from-muted to-background py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold text-foreground text-center mb-20"
          >
            How It Works
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-2xl shadow-sm p-10 text-center"
            >
              <div className="w-14 h-14 bg-blue-900/30 border border-blue-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Missed call comes in</h3>
              <p className="text-base text-muted-foreground leading-relaxed">Customer calls your business but you can't answer</p>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-2xl shadow-sm p-10 text-center"
            >
              <div className="w-14 h-14 bg-blue-900/30 border border-blue-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-4">ReplyFlow texts them instantly</h3>
              <p className="text-base text-muted-foreground leading-relaxed">Automatic personalized text response within seconds</p>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-2xl shadow-sm p-10 text-center"
            >
              <div className="w-14 h-14 bg-blue-900/30 border border-blue-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Lead captured</h3>
              <p className="text-base text-muted-foreground leading-relaxed">Customer appears in your dashboard ready to follow up</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-muted py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Trusted by service businesses
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for businesses that value every customer interaction
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="bg-card/50 rounded-xl p-8 text-center"
            >
              <div className="w-12 h-12 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">TCPA Compliant</h3>
              <p className="text-base text-muted-foreground">
                Follows SMS best practices and compliance guidelines
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-card/50 rounded-xl p-8 text-center"
            >
              <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Secure & Private</h3>
              <p className="text-base text-muted-foreground">
                Your data is encrypted and never shared with third parties
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              viewport={{ once: true }}
              className="bg-card/50 rounded-xl p-8 text-center"
            >
              <div className="w-12 h-12 bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Instant Setup</h3>
              <p className="text-base text-muted-foreground">
                Get started in minutes with no technical expertise needed
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-b from-muted to-background py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-8">
              Ready to never miss a customer again?
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 leading-relaxed">
              Built for service businesses that never want to miss another lead.
            </p>
            <Link
              href="/signup"
              className="h-12 px-8 bg-blue-600 text-white font-semibold rounded-xl shadow-sm hover:bg-blue-700 transition-colors inline-flex items-center justify-center"
            >
              Start Your 14-Day Free Trial
            </Link>
          </motion.div>
        </div>
      </section>
      <HomepageFooter />
    </main>
  )
}
