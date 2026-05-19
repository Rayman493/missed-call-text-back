import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ProvidersWrapper from '@/components/ProvidersWrapper'
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ReplyFlowHQ — Missed-Call Text Back for Local Businesses',
  description: 'Automatically text customers back when you miss a call. ReplyFlowHQ helps local businesses capture more leads with missed-call text-back automation.',
  keywords: ['missed call text back', 'automated SMS', 'local business', 'lead capture', 'customer communication', 'SMS automation'],
  authors: [{ name: 'ReplyFlowHQ' }],
  creator: 'ReplyFlowHQ',
  publisher: 'ReplyFlowHQ',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://replyflowhq.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://replyflowhq.com',
    title: 'ReplyFlowHQ — Missed-Call Text Back for Local Businesses',
    description: 'Automatically text customers back when you miss a call. ReplyFlowHQ helps local businesses capture more leads with missed-call text-back automation.',
    siteName: 'ReplyFlowHQ',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReplyFlowHQ - Missed-Call Text Back Automation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReplyFlowHQ — Missed-Call Text Back for Local Businesses',
    description: 'Automatically text customers back when you miss a call. ReplyFlowHQ helps local businesses capture more leads with missed-call text-back automation.',
    images: ['/og-image.png'],
    creator: '@replyflowhq',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  verification: {
    google: 'google9f3f4231ba864d62.html',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function getTheme() {
                  const stored = localStorage.getItem('theme');
                  if (stored) return stored;
                  return 'dark';
                }
                const theme = getTheme();
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <GlobalErrorBoundary>
          <ProvidersWrapper>{children}</ProvidersWrapper>
        </GlobalErrorBoundary>
      </body>
    </html>
  )
}
