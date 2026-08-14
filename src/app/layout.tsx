import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ProvidersWrapper from '@/components/ProvidersWrapper'
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary'
import { CapacitorInitializer } from '@/components/capacitor/CapacitorInitializer'
import NativeOfflineBoundary from '@/components/NativeOfflineBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ReplyFlow — Customers, Scheduling & Payments for Service Businesses',
  description: 'Capture customer requests with AI, manage conversations and jobs, schedule work, and accept payments from one place. Built for local service businesses.',
  keywords: ['missed call text back', 'automated SMS', 'local business', 'customer capture', 'customer communication', 'SMS automation'],
  authors: [{ name: 'ReplyFlowHQ' }],
  creator: 'ReplyFlowHQ',
  publisher: 'ReplyFlowHQ',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.replyflowhq.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://replyflowhq.com',
    title: 'ReplyFlow — Customers, Scheduling & Payments for Service Businesses',
    description: 'Capture customer requests with AI, manage conversations and jobs, schedule work, and accept payments from one place. Built for local service businesses.',
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
    title: 'ReplyFlow — Customers, Scheduling & Payments for Service Businesses',
    description: 'Capture customer requests with AI, manage conversations and jobs, schedule work, and accept payments from one place. Built for local service businesses.',
    images: ['/replyflow-r-logo.png'],
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
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
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
        <CapacitorInitializer />
        <NativeOfflineBoundary>
          <GlobalErrorBoundary>
            <ProvidersWrapper>{children}</ProvidersWrapper>
          </GlobalErrorBoundary>
        </NativeOfflineBoundary>
      </body>
    </html>
  )
}
