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
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const savedTheme = localStorage.getItem('replyflow-theme');
                if (savedTheme) {
                  document.documentElement.classList.toggle('dark', savedTheme === 'dark');
                } else {
                  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  document.documentElement.classList.toggle('dark', systemPrefersDark);
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-gray-900 text-gray-100`}>
        <ThemeProvider>
          <BusinessProvider>{children}</BusinessProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
