import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReplyFlow SMS Compliance',
  description: 'ReplyFlow SMS Compliance & Consent - Information for Twilio verification and carrier compliance',
}

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Page Title */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            ReplyFlow SMS Compliance & Consent
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            ReplyFlow provides conversational SMS responses for businesses when they miss incoming customer calls.
          </p>
        </div>

        {/* Section 1 - How ReplyFlow Works */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              How ReplyFlow Works
            </h2>
            
            <div className="space-y-4 mb-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  1
                </div>
                <p className="text-gray-300">
                  Customers call a business directly using the business's normal phone number.
                </p>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  2
                </div>
                <p className="text-gray-300">
                  If the business misses the call, the call may forward to ReplyFlow.
                </p>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  3
                </div>
                <p className="text-gray-300">
                  ReplyFlow sends a single automated SMS response related to the customer inquiry.
                </p>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  4
                </div>
                <p className="text-gray-300">
                  The business can continue the conversation manually through the ReplyFlow dashboard.
                </p>
              </div>
            </div>

            <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
              <p className="text-green-300 text-sm">
                <strong>Note:</strong> ReplyFlow messages are conversational and transactional in nature. ReplyFlow does not send bulk marketing campaigns.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2 - Verbal Opt-In Script */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Verbal Opt-In Script
            </h2>
            
            <div className="bg-amber-900/20 border-2 border-amber-600 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-amber-400 mb-4">Required Verbal Opt-In Dialogue</h3>
              
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <p className="text-amber-300 font-semibold mb-2">Business:</p>
                  <p className="text-gray-100 leading-relaxed">
                    "Thanks for calling Wolfie Construction. If we miss your call, we may send you a text message so we can continue helping you. Message and data rates may apply. Reply HELP for help or STOP to opt out. Do you agree to receive a text message about your inquiry?"
                  </p>
                </div>
                
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <p className="text-green-400 font-semibold mb-2">Customer:</p>
                  <p className="text-gray-100 leading-relaxed">
                    "Yes."
                  </p>
                </div>
                
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <p className="text-amber-300 font-semibold mb-2">Business:</p>
                  <p className="text-gray-100 leading-relaxed">
                    "Thank you. If we miss your call, ReplyFlow may send a text message to continue the conversation."
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
              <p className="text-blue-300 text-sm">
                <strong>Note:</strong> ReplyFlow only sends conversational customer-service messages after a customer initiates contact with a business.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3 - Sample SMS Message */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              Example SMS Message
            </h2>
            
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6 max-w-md mx-auto">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-gray-100">
                    Hi, this is Wolfie Construction. Sorry we missed your call â how can we help? Reply STOP to opt out.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4 - STOP / HELP Compliance */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              STOP / HELP Compliance
            </h2>
            
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Customers can opt out anytime by replying STOP.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Customers can request assistance by replying HELP.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  ReplyFlow only sends messages related to customer-initiated phone calls.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-gray-300">
                  Businesses control all ongoing customer conversations.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 5 - Contact */}
        <section className="mb-16">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              Compliance Contact
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
      </div>
    </div>
  )
}
