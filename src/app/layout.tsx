import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { BusinessProvider } from '@/contexts/BusinessContext'
import { ThemeProvider } from '@/contexts/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Missed Call Text Back',
  description: 'Automated text response for missed calls',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <BusinessProvider>{children}</BusinessProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
