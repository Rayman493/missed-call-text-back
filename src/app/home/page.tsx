'use client'

import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

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
  const { user } = useAuth()
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
              Turn Missed Calls Into Paying Customers
            </h1>
            <p className="text-lg md:text-xl text-slate-600 dark:text-muted-foreground max-w-3xl leading-relaxed mt-5 sm:mt-6">
              Automatically text back missed callers, capture leads, and recover lost revenue—using your existing business number. Fast setup.
            </p>

            {/* Benefit Bullets - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
            <div className="mt-8">
              <div className="flex flex-col items-center space-y-3">
                <div className="flex items-center justify-center gap-3 text-slate-700 dark:text-slate-300">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-base">Automatic text-back</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-slate-700 dark:text-slate-300">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-base">Instant lead capture</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-slate-700 dark:text-slate-300">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-base">Your existing number</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-slate-700 dark:text-slate-300">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-base">Fast setup</span>
                </div>
              </div>
            </div>

            {/* Pricing Information */}
            <div id="pricing-section" className="flex flex-col items-center gap-2 mt-4">
              <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">14-day free trial</span>
              <span className="text-slate-700 dark:text-foreground text-lg">$59/month after trial</span>
            </div>

            {/* Trust Copy */}
            <div className="flex flex-col items-center gap-1 mt-3">
              <span className="text-slate-500 dark:text-muted-foreground text-sm">No contracts. Cancel anytime.</span>
              <span className="text-slate-500 dark:text-muted-foreground text-sm">Keep using the business number you already advertise everywhere.</span>
            </div>

            {/* Trust Indicators */}
            <div className="mt-6">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3 text-center">
                Works with your existing business number
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Verizon</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">AT&T</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">T-Mobile</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Google Voice</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">RingCentral</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
              {/* Primary CTA */}
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="inline-flex items-center justify-center h-12 px-8 min-w-[160px] bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200"
              >
                {user ? "Go to Dashboard" : "Start Free Trial"}
              </Link>
            </div>

            {/* Works For Section - Mobile Conversion */}
            <div className="mt-6 sm:mt-8">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3 text-center">
                Works for:
              </p>
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Plumbers</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">HVAC</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Electricians</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Landscapers</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Contractors</span>
                </div>
              </div>
            </div>

            {/* UI Mockup */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              className="mt-16 w-full max-w-4xl mx-auto"
            >
              <div className="relative rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                {/* Mockup Header */}
                <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <div className="flex-1 text-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400">ReplyFlow Dashboard</span>
                    </div>
                  </div>
                </div>

                {/* Mockup Content */}
                <div className="p-6 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Lead Card Mockup */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Latest Lead</span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-foreground">John Smith</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">(555) 123-4567</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">Missed call 2 min ago</div>
                    </div>

                    {/* Activity Card Mockup */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Recent Activity</span>
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          <span className="text-xs text-slate-700 dark:text-slate-300">Auto-text sent to Jane</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span className="text-xs text-slate-700 dark:text-slate-300">Lead captured from Mike</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                          <span className="text-xs text-slate-700 dark:text-slate-300">Follow-up scheduled</span>
                        </div>
                      </div>
                    </div>

                    {/* Metrics Card Mockup */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">This Month</span>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Leads</span>
                          <span className="text-sm font-bold text-slate-900 dark:text-foreground">24</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Texts Sent</span>
                          <span className="text-sm font-bold text-slate-900 dark:text-foreground">18</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Conversion</span>
                          <span className="text-sm font-bold text-green-600">75%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message Preview Mockup */}
                  <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                          <p className="text-xs text-slate-700 dark:text-slate-300">Hi! I noticed you called earlier. How can I help you today?</p>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Auto-sent via ReplyFlow</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

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
          </motion.div>
        </div>
      </section>

      {/* Two Ways ReplyFlow Captures Leads Section */}
      <section id="two-ways-capture-section" className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
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
              Whether a call goes to AI voicemail or is missed entirely, ReplyFlow helps capture the opportunity.
            </motion.p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* AI Voicemail Intake Card - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-2xl shadow-xl p-8"
            >
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

      {/* AI Voicemail Intake Section - Keep this copy in sync with src/app/home/page.tsx and src/app/page.tsx. */}
      <section className="bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-muted py-24 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4"
            >
              See ReplyFlow In Action
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true }}
              className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto"
            >
              Experience both our AI voicemail intake and SMS recovery in real scenarios
            </motion.p>
          </motion.div>
          
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
                  AI Voicemail Intake
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
              // AI Voicemail Intake Demo
              <div className="space-y-6">
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
                      <p className="text-sm text-white">Sorry we missed your call — this is Premier Plumbing. How can we help?</p>
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
