/**
 * Public Route Layout
 *
 * This layout wraps public routes (/, /home, /pricing, etc.) with independent dark theme.
 * Public routes are always dark regardless of user's authenticated app theme preference.
 */

import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Force dark theme for all public routes - independent of user's app preference
    <div className="dark min-h-screen bg-zinc-950">
      <div className={`${inter.className} antialiased`}>
        {children}
      </div>
    </div>
  )
}