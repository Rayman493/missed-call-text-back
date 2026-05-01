import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReplyFlow Terms of Service',
  description: 'Terms and conditions for using ReplyFlow missed call text back service',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Page Title */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Terms of Service
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Terms and conditions for using ReplyFlow missed call text back service.
          </p>
        </div>

        {/* Section 1 - Acceptance of Terms */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6">
              Acceptance of Terms
            </h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing and using ReplyFlow, you accept and agree to be bound by the terms 
              and provision of this agreement.
            </p>
          </div>
        </section>

        {/* Section 2 - Services */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6">
              Services
            </h2>
            <p className="text-gray-300 leading-relaxed">
              ReplyFlow provides automated text message responses to missed calls for businesses. 
              The service includes lead capture, message management, and customer communication tools.
            </p>
          </div>
        </section>

        {/* Simple footer */}
        <div className="text-center text-gray-400 text-sm">
          <p>&copy; 2024 ReplyFlow. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
