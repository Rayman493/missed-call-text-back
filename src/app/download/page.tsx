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
const GOOGLE_PLAY_URL = process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.replyflowhq.app&hl=en_US'

export default function DownloadPage() {
  return (
    <div className="min-h-screen page-gradient">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {/* Logo and Brand */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-blue-500/10 blur-xl" aria-hidden="true" />
              <BrandIcon size={80} />
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
            ReplyFlow
          </h1>
          <p className="text-xl sm:text-2xl font-medium text-slate-700 dark:text-slate-300 mb-3">
            Run your business from one place.
          </p>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            Calls, customers, scheduling, payments, quotes &amp; invoices — wherever you work.
          </p>
        </div>

        {/* Download Section - Client-side device detection */}
        <DownloadSection
          appStoreUrl={APP_STORE_URL}
          googlePlayUrl={GOOGLE_PLAY_URL}
        />

        {/* Continue on Web — secondary path */}
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Prefer the browser?
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600/70 rounded-lg hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-colors duration-200"
          >
            Continue on the web
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-14 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} ReplyFlow. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
