import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { BusinessProvider } from '@/contexts/BusinessContext'
import { ThemeProvider } from '@/contexts/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ReplyFlow',
  description: 'Automatically respond to missed calls',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
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
              try {
                document.documentElement.classList.add('dark');
                document.documentElement.style.backgroundColor = '#020617';
                document.body && (document.body.style.backgroundColor = '#020617');
              } catch (e) {}
              (function() {
                const savedTheme = localStorage.getItem('replyflow-theme');
                if (savedTheme) {
                  document.documentElement.classList.toggle('dark', savedTheme === 'dark');
                  document.documentElement.classList.toggle('light', savedTheme === 'light');
                } else {
                  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  document.documentElement.classList.toggle('dark', systemPrefersDark);
                  document.documentElement.classList.toggle('light', !systemPrefersDark);
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-slate-950 text-white antialiased`}>
        <AuthProvider>
          <ThemeProvider>
            <BusinessProvider>{children}</BusinessProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
