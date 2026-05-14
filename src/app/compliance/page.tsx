import { Metadata } from 'next'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'ReplyFlowHQ Compliance | Conversational Messaging Standards',
  description: 'ReplyFlowHQ compliance information for conversational missed-call response automation. TCPA compliance, opt-out procedures, and regulatory adherence.',
}

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SSRSafeNavbar forceDark={true} />
      
      {/* Hero Section */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 00-2.812 2.812 3.066 3.066 0 01-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 00-2.812-2.812 3.066 3.066 0 01-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 002.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Compliance & Standards
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
              ReplyFlowHQ LLC maintains the highest standards for conversational messaging compliance during pilot testing and API validation.
            </p>
          </div>
        </div>
      </div>

      {/* Compliance Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-12">
          
          {/* Conversational Messaging Use Case */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  Conversational Messaging Use Case
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    ReplyFlowHQ LLC is designed exclusively for <strong>conversational pilot testing</strong> 
                    triggered by inbound customer contact. Our use case is fundamentally different from bulk marketing:
                  </p>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">ReplyFlowHQ LLC Pilot Model</h3>
                      <ul className="space-y-2 text-sm text-green-800 dark:text-green-200">
                        <li>• Customer-initiated contact</li>
                        <li>• Conversational context</li>
                        <li>• API validation/testing</li>
                        <li>• Internal pilot workflows</li>
                      </ul>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">Not Bulk Marketing</h3>
                      <ul className="space-y-2 text-sm text-red-800 dark:text-red-200">
                        <li>• No cold outreach</li>
                        <li>• No purchased lists</li>
                        <li>• No mass messaging</li>
                        <li>• No promotional content</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Missed-Call Workflow */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  Missed-Call Response Workflow
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                    Our compliant workflow ensures messages are only sent with proper context and customer initiation:
                  </p>
                  
                  {/* Visual Flow */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 mb-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex-1 text-center">
                        <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Customer Calls</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Inbound initiation</p>
                      </div>
                      <div className="hidden md:block text-blue-600 dark:text-blue-400">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="w-16 h-16 bg-orange-600 text-white rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Call Missed</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">System detects</p>
                      </div>
                      <div className="hidden md:block text-blue-600 dark:text-blue-400">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Text Sent</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Conversational response</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Customer initiation required</strong> - Messages only sent after customer calls your business
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Contextual relevance</strong> - Messages directly relate to the missed call interaction
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Immediate response</strong> - Messages sent within seconds of missed call
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Opt-In Process */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  Opt-In Process & Consent
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    ReplyFlowHQ LLC operates on the principle of <strong>implied consent</strong> through customer initiation during pilot testing:
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">ReplyFlowHQ LLC Pilot Testing</h3>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        ReplyFlowHQ LLC ensures appropriate consent for communications during pilot testing and maintains compliance 
                        with all applicable regulations including TCPA and local laws.
                      </p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">Customer Initiation</h3>
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        When a customer contacts ReplyFlowHQ LLC during pilot testing, they initiate contact and provide implied consent 
                        for a reasonable response related to their inquiry.
                      </p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">Conversational Support</h3>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        All messages maintain conversational context directly related to the customer's 
                        initial contact and are limited to pilot testing and support workflows.
                      </p>
                    </div>
                  </div>

                  {/* Example Verbal Opt-In Script */}
                  <div className="mt-8">
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4">
                        Example Verbal Opt-In Script
                      </h3>
                      <div className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 mb-4">
                        <p className="text-slate-800 dark:text-slate-200 italic leading-relaxed">
                          "Thanks for contacting ReplyFlowHQ LLC. As part of our pilot missed-call follow-up testing program, we may send you a conversational text message related to your inquiry. Reply STOP to opt out or HELP for assistance. Do you agree to receive these messages?"
                        </p>
                      </div>
                      <div className="bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
                        <p className="text-sm text-indigo-800 dark:text-indigo-200">
                          <strong>Important Note:</strong> Messages are only sent after inbound contact and are limited to ReplyFlowHQ LLC pilot testing and conversational support workflows.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* STOP/HELP Compliance */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  STOP/HELP Compliance
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    ReplyFlowHQ LLC automatically processes all standard opt-out and help requests during pilot testing:
                  </p>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                          <span className="text-red-600 dark:text-red-400 font-bold text-lg">STOP</span>
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Opt-Out Processing</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                        <li>• Immediate opt-out confirmation</li>
                        <li>• Removal from all messaging lists</li>
                        <li>• No future messages sent</li>
                        <li>• Compliance with all regulations</li>
                      </ul>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">HELP</span>
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Support Information</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                        <li>• Support contact details</li>
                        <li>• Business information</li>
                        <li>• Opt-out instructions</li>
                        <li>• Message frequency details</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      <strong>Automatic Processing:</strong> All STOP and HELP keywords are automatically detected 
                      and processed 24/7 without manual intervention.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Data Privacy */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  Data Privacy & Security
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    ReplyFlowHQ LLC maintains enterprise-grade data protection and privacy standards during pilot testing:
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Secure data transmission</strong> - All communications encrypted in transit and at rest
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>GDPR & CCPA compliant</strong> - Data handling practices meet global privacy standards
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Limited data retention</strong> - Only retain data necessary for service delivery
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Regular security audits</strong> - Ongoing compliance monitoring and updates
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Business Responsibilities */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  ReplyFlowHQ LLC Responsibilities
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    During pilot testing, ReplyFlowHQ LLC maintains responsibility for:
                  </p>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Obtaining proper consent</strong> for pilot testing communications
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Compliance with applicable laws</strong> including TCPA, state regulations, and international requirements
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                  <p className="text-slate-600 dark:text-slate-400">
                        <strong>Maintaining accurate ReplyFlowHQ LLC information</strong> and contact details
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        <strong>Limited to pilot testing</strong> and conversational support workflows
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Legal Disclaimer:</strong> ReplyFlowHQ LLC provides pilot testing services and is not a law firm. 
                      ReplyFlowHQ LLC should consult with legal counsel to ensure compliance with all applicable regulations 
                      for pilot testing use cases and jurisdictions.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Contact Support */}
          <section>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
              <h2 className="text-2xl font-semibold mb-4">
                Compliance Questions?
              </h2>
              <p className="text-blue-100 mb-6">
                ReplyFlowHQ LLC compliance team is available to help understand pilot testing regulatory requirements and best practices.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="mailto:support@replyflowhq.com"
                  className="inline-flex items-center px-6 py-3 bg-white text-blue-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  Email ReplyFlowHQ LLC Compliance
                </a>
                <a
                  href="/faq"
                  className="inline-flex items-center px-6 py-3 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition-colors"
                >
                  View FAQ
                </a>
              </div>
            </div>
          </section>

        </div>
      </div>
      <Footer />
    </div>
  )
}
