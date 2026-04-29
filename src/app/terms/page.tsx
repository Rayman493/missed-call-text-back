import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReplyFlow Terms of Service',
  description: 'Rules and guidelines for using ReplyFlow',
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
            Rules and guidelines for using ReplyFlow.
          </p>
        </div>

        {/* Section 1 - Service Description */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              Service Description
            </h2>
            
            <p className="text-gray-300">
              ReplyFlow provides automated conversational SMS responses for missed business calls.
            </p>
          </div>
        </section>

        {/* Section 2 - Acceptable Use */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              Acceptable Use
            </h2>
            
            <p className="text-gray-300 mb-4">
              Businesses may NOT:
            </p>
            
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Send spam
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Send unlawful messages
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Use ReplyFlow for phishing or fraud
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Violate carrier messaging policies
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 3 - Customer Responsibility */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              Customer Responsibility
            </h2>
            
            <p className="text-gray-300 mb-4">
              Businesses are responsible for:
            </p>
            
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Obtaining proper customer consent
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Following SMS regulations
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Maintaining lawful communication practices
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4 - Service Availability */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Service Availability
            </h2>
            
            <p className="text-gray-300">
              ReplyFlow may experience occasional outages or maintenance periods.
            </p>
          </div>
        </section>

        {/* Section 5 - Limitation of Liability */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              Limitation of Liability
            </h2>
            
            <p className="text-gray-300">
              ReplyFlow is provided "as is" without guarantees of uninterrupted availability.
            </p>
          </div>
        </section>

        {/* Section 6 - Contact */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              Contact
            </h2>
            
            <div className="text-center">
              <a 
                href="mailto:support@replyflowhq.com" 
                className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                support@replyflowhq.com
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-gray-400 text-sm">
          Last updated: April 2026
        </div>
      </div>
    </div>
  )
}
