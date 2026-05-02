import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ReplyFlow - $49/month | 14-day Free Trial',
  description: 'Automatically respond to missed calls with ReplyFlow. 14-day free trial, then $49/month. No contracts. Capture leads and grow your business.',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
}

export default function RootLayoutMinimal({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white antialiased`}>
        {children}
      </body>
    </html>
  )
}
