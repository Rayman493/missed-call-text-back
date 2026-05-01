import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReplyFlow Privacy Policy',
  description: 'How ReplyFlow handles customer and business information',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Page Title */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Privacy Policy
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            How ReplyFlow handles customer and business information.
          </p>
        </div>

        {/* Section 1 - Information We Collect */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6">
              Information We Collect
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We collect information you provide directly to us, such as when you create an account, 
              use our services, or contact us for support.
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
