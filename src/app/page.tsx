'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-200">Loading...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">
        <div className="text-xl font-bold text-gray-100">ReplyFlow</div>
        <Link
          href="/auth?mode=signin"
          className="text-sm font-medium text-gray-400 hover:text-gray-100 transition-colors"
        >
          Sign In
        </Link>
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
          <Link
            href="/auth?mode=signup"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get Started Free
          </Link>
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-gray-800 text-gray-300 font-semibold rounded-lg border border-gray-600 hover:bg-gray-700 transition-colors"
          >
            View Dashboard Demo
          </Link>
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
              <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📞</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-2">Step 1</h3>
              <p className="text-gray-400">Customer calls your business</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💬</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-2">Step 2</h3>
              <p className="text-gray-400">We instantly text them back</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-2">Step 3</h3>
              <p className="text-gray-400">You turn missed calls into paying customers</p>
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
      <section className="bg-gray-800 py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xl text-gray-400">
            Trusted by service businesses to capture missed leads
          </p>
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
