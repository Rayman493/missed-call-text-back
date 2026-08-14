import { Metadata } from 'next'
import Link from 'next/link'
import BrandIcon from '@/components/BrandIcon'
import { DownloadSection } from './DownloadSection'

export const metadata: Metadata = {
  title: 'Download ReplyFlow',
  description: 'Download ReplyFlow for iPhone or Android, or continue using ReplyFlow on the web.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.replyflowhq.com'),
  alternates: {
    canonical: '/download',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://replyflowhq.com/download',
    title: 'Download ReplyFlow',
    description: 'Download ReplyFlow for iPhone or Android, or continue using ReplyFlow on the web.',
    siteName: 'ReplyFlow',
    images: [
      {
        url: '/replyflow-r-logo.png',
        width: 512,
        height: 512,
        alt: 'ReplyFlow - Customer Management and Scheduling',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download ReplyFlow',
    description: 'Download ReplyFlow for iPhone or Android, or continue using ReplyFlow on the web.',
    images: ['/replyflow-r-logo.png'],
    creator: '@replyflowhq',
  },
  robots: {
    index: true,
    follow: true,
  },
}

// Store URLs - configured here for easy future updates
// These can be moved to environment variables when available
const APP_STORE_URL = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || null
const GOOGLE_PLAY_URL = process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL || null

export default function DownloadPage() {
  return (
    <div className="min-h-screen page-gradient">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {/* Logo and Brand */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2">
            <BrandIcon size={72} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-2">
            ReplyFlow
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400">
            Run your business from one place.
          </p>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-6">
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Calls, customers, scheduling, payments, and more — wherever you work.
          </p>
        </div>

        {/* Download Section - Client-side device detection */}
        <DownloadSection 
          appStoreUrl={APP_STORE_URL}
          googlePlayUrl={GOOGLE_PLAY_URL}
        />

        {/* Continue on Web */}
        <div className="mt-8 text-center">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Available now
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Continue using ReplyFlow on the web.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-sm hover:shadow"
          >
            Continue on the web
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} ReplyFlow. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
