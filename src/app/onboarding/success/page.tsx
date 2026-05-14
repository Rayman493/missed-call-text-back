import Link from 'next/link'
import Footer from '@/components/Footer'

export default function OnboardingSuccessPage() {
  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 dark:text-slate-100 mb-4">
            Setup Complete!
          </h1>
          <p className="text-lg text-slate-400 dark:text-slate-400 mb-8">
            Your ReplyFlow account has been successfully set up.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}
