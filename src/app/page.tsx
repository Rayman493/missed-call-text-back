'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const { loading, user } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-900 dark:text-gray-200">Loading...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center hover:opacity-90 transition">
          <span className="text-xl md:text-2xl font-semibold tracking-tight">
            <span className="text-gray-900 dark:text-gray-100">Reply</span>
            <span className="text-blue-600 dark:text-blue-500">Flow</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {loading ? (
            <div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
          ) : user ? (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-400 hover:text-gray-100 transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/auth?mode=signin"
              className="text-sm font-medium text-gray-400 hover:text-gray-100 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-4 py-20 md:py-32 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-100 mb-6 max-w-4xl">
          Never Lose Another Customer Who Calls You
        </h1>
        <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl">
          ReplyFlow instantly texts back missed calls so you can capture leads, book jobs, and grow your business automatically.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          {loading ? (
            <>
              <div className="px-8 py-4 bg-gray-300 dark:bg-gray-600 rounded-lg animate-pulse"></div>
              <div className="px-8 py-4 bg-gray-300 dark:bg-gray-600 rounded-lg animate-pulse"></div>
            </>
          ) : user ? (
            <>
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth?mode=signup"
                className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get Started Free
              </Link>
              <Link
                href="/demo"
                className="px-8 py-4 bg-gray-800 text-gray-300 font-semibold rounded-lg border border-gray-600 hover:bg-gray-700 transition-colors"
              >
                View Demo
              </Link>
            </>
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gray-800 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-100 text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-3">Missed call comes in</h3>
              <p className="text-gray-400">Customer calls your business but you can't answer</p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-3">ReplyFlow texts them instantly</h3>
              <p className="text-gray-400">Automatic personalized text response within seconds</p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-3">You manage the lead in your inbox</h3>
              <p className="text-gray-400">Convert conversations into booked jobs and revenue</p>
            </div>
          </div>
        </div>
      </section>

      {/* Example Message Section */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-8">
            What Your Customers See
          </h2>
          <div className="bg-gray-800 rounded-lg p-6 md:p-8 max-w-md mx-auto">
            <div className="bg-gray-700 rounded-lg p-4 shadow-sm">
              <p className="text-gray-200 text-left">
                "Hi, sorry we missed your call — how can we help?"
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="bg-gray-100 dark:bg-gray-800 py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            Trusted by service businesses to capture missed leads
          </p>
          <span className="text-2xl font-semibold tracking-tight">
            <span className="text-gray-900 dark:text-gray-100">Reply</span>
            <span className="text-blue-600 dark:text-blue-500">Flow</span>
          </span>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-6">
            Start capturing missed calls today
          </h2>
          <Link
            href="/auth?mode=signup"
            className="inline-block px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </section>
    </main>
  )
}
