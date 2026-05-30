'use client'

import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import { motion } from 'framer-motion'
import { useState } from 'react'

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
              AI-powered lead capture and communication platform for modern businesses. 
              Answer calls, recover missed opportunities, and grow your business.
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
                <Link href="/home#features" className="text-muted-foreground hover:text-foreground text-base transition-colors">
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

export default function PublicHome() {
  const [activeTab, setActiveTab] = useState('ai')
  console.log('[PUBLIC HOME ROUTE RENDER] Rendering public homepage at /home - NO AUTH CHECK')
  
  // Render public homepage for all users (no auth check)
  return (
    <>
      <StructuredData />
      <PageBackground>
        <SSRSafeNavbar forceDark={true} />
      
      {/* Hero Section */}
      <section id="features-section" className="relative flex flex-col items-center justify-center py-20 md:py-28 text-center bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-muted dark:to-background">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent dark:from-transparent dark:via-muted/30 dark:to-transparent"></div>
        <div className="max-w-5xl mx-auto px-6 lg:px-8 space-y-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.15] text-slate-900 dark:text-foreground">
              Never Miss a Lead Again
            </h1>
            <p className="text-lg md:text-xl text-slate-600 dark:text-muted-foreground max-w-3xl leading-relaxed mt-5 sm:mt-6">
              ReplyFlow answers calls with AI, texts back missed callers, and automatically captures leads so your business never loses another opportunity.
            </p>
            
            {/* Benefit Bullets */}
            <div className="mt-8 space-y-3 max-w-2xl mx-auto">
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base">AI answers incoming calls</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base">Instant missed-call text back</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base">Lead inbox and conversation history</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-base">Works with your existing business number</span>
              </div>
            </div>
            
            {/* Pricing Information */}
            <div id="pricing-section" className="flex flex-col items-center gap-2 mt-4">
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

      {/* Two Ways ReplyFlow Captures Leads Section */}
      <section id="ai-receptionist-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4"
            >
              Two Ways ReplyFlow Captures Leads
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto"
            >
              Whether a call gets answered or missed, ReplyFlow helps recover the opportunity.
            </motion.p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* AI Receptionist Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl border border-blue-200 dark:border-blue-800 p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100/20 to-transparent rounded-full -mr-16 -mt-16"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-foreground">AI Receptionist</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                  Our AI answers incoming calls instantly, captures customer information, and qualifies leads before they even speak to a human.
                </p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-foreground mb-1">24/7 Call Answering</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Never miss a call, day or night</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-foreground mb-1">Lead Qualification</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">AI asks qualifying questions automatically</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-foreground mb-1">Appointment Booking</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Schedule calls and meetings automatically</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Missed Call Recovery Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-100/20 to-transparent rounded-full -mr-16 -mt-16"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-foreground">Missed Call Recovery</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                  When you can't answer, ReplyFlow automatically sends personalized text messages to turn missed calls into captured leads.
                </p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-foreground mb-1">Instant Text Response</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Auto-text within 60 seconds of missed call</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-foreground mb-1">Lead Capture</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Customer replies create new leads instantly</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-foreground mb-1">Conversation History</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Full SMS thread in your lead inbox</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Tabbed Demo Section */}
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
              See ReplyFlow in Action
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto"
            >
              Experience both our AI Receptionist and Missed Call Recovery in real scenarios
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            {/* Tab Navigation */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'ai' 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  AI Receptionist Call
                </button>
                <button
                  onClick={() => setActiveTab('sms')}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'sms' 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  SMS Recovery
                </button>
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'ai' ? (
              // AI Receptionist Call Demo
              <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">AI Receptionist Call Demo</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Our AI answers calls and captures leads automatically</p>
                </div>
                
                {/* Call Interface */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 mb-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">AI</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-foreground">ReplyFlow AI</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Virtual Receptionist</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">2:34 PM</div>
                  </div>
                  
                  {/* Call Transcript */}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-medium">AI:</span>
                      <p className="text-slate-700 dark:text-slate-300">Thank you for calling Wolfie Plumbing. I'm your virtual assistant. How can I help you today?</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-medium">Customer:</span>
                      <p className="text-slate-700 dark:text-slate-300">Hi, I need to install a new water heater.</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-medium">AI:</span>
                      <p className="text-slate-700 dark:text-slate-300">I'd be happy to help you with that! What size water heater do you need and is it gas or electric?</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-medium">Customer:</span>
                      <p className="text-slate-700 dark:text-slate-300">50 gallon gas water heater.</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-medium">AI:</span>
                      <p className="text-slate-700 dark:text-slate-300">Perfect! What's your zip code so I can check availability and provide an accurate quote?</p>
                    </div>
                  </div>
                </div>
                
                {/* Lead Summary */}
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Lead Captured</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-600 dark:text-slate-400">Service:</span> <span className="font-medium">Water Heater Installation</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400">Size:</span> <span className="font-medium">50 Gallon</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400">Type:</span> <span className="font-medium">Gas</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400">Status:</span> <span className="font-medium text-emerald-600">Qualified Lead</span></div>
                  </div>
                </div>
              </div>
            ) : (
              // SMS Recovery Demo
              <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">SMS Recovery Demo</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Automatic text response when you miss a call</p>
                </div>
                
                {/* SMS Conversation */}
                <div className="space-y-4">
                  {/* Business Message 1 - ReplyFlow sends first text */}
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm text-white">Sorry we missed your call — this is Wolfie Plumbing. How can we help?</p>
                      <p className="text-xs text-blue-200 mt-1">2:34 PM</p>
                    </div>
                  </div>
                  
                  {/* Customer Message 1 */}
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm text-slate-800 dark:text-slate-200">Do you install water heaters?</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:35 PM</p>
                    </div>
                  </div>
                  
                  {/* Business Message 2 */}
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm text-white">Yes, we do. What size water heater do you need?</p>
                      <p className="text-xs text-blue-200 mt-1">2:36 PM</p>
                    </div>
                  </div>
                  
                  {/* Customer Message 2 */}
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm text-slate-800 dark:text-slate-200">50 gallon gas</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:37 PM</p>
                    </div>
                  </div>
                  
                  {/* Business Message 3 */}
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-2xl rounded-br-none px-5 py-3 shadow-sm max-w-[85%]">
                      <p className="text-sm text-white">Perfect — we can help with that. What zip code are you located in?</p>
                      <p className="text-xs text-blue-200 mt-1">2:38 PM</p>
                    </div>
                  </div>
                </div>
                
                {/* Lead Summary */}
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800 mt-4">
                  <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-2">Lead Captured</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-600 dark:text-slate-400">Service:</span> <span className="font-medium">Water Heater Installation</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400">Size:</span> <span className="font-medium">50 Gallon</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400">Type:</span> <span className="font-medium">Gas</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400">Status:</span> <span className="font-medium text-emerald-600">Active Conversation</span></div>
                  </div>
                </div>
              </div>
            )}
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
      </PageBackground>
    </>
  )
}
