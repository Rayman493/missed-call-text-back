import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReplyFlow Compliance',
  description: 'ReplyFlow compliance information and regulatory adherence',
}

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Page Title */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Compliance
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            ReplyFlow compliance information and regulatory adherence.
          </p>
        </div>

        {/* Section 1 - TCPA Compliance */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6">
              TCPA Compliance
            </h2>
            <p className="text-gray-300 leading-relaxed">
              ReplyFlow is designed to comply with the Telephone Consumer Protection Act (TCPA). 
              Our system only responds to missed calls, ensuring compliance with consent requirements.
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
