import { Metadata } from 'next'
import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import LegalNavigation from '@/components/LegalNavigation'

export const metadata: Metadata = {
  title: 'ReplyFlowHQ Privacy Policy | Data Protection & Security',
  description: 'ReplyFlowHQ privacy policy for automated missed-call text responses. How we protect customer and business data.',
}

export default function PrivacyPage() {
  return (
    <PageBackground>
      <SSRSafeNavbar forceDark={true} />
      
      {/* Back to Home Navigation */}
      <div className="bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 group"
          >
            <svg 
              className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
      
      {/* Hero Section */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Legal Page Navigation */}
          <div className="flex justify-center mb-8">
            <LegalNavigation activePage="privacy" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-6">
              <svg
                className="w-8 h-8 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              Privacy Policy
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              How ReplyFlowHQ protects customer and business information.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Privacy Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="lg:grid lg:grid-cols-4 lg:gap-12">
          {/* Table of Contents - Desktop Only */}
          <aside className="hidden lg:block lg:col-span-[1.25]">
            <div className="sticky top-8">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
                  Contents
                </h3>
                <nav className="space-y-3" aria-label="Table of contents">
                <a
                  href="#introduction"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Our Commitment to Privacy
                </a>
                <a
                  href="#information-we-collect"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Information We Collect
                </a>
                <a
                  href="#how-we-use-information"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  How We Use Information
                </a>
                <a
                  href="#voice-ai-services"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Voice & AI Services
                </a>
                <a
                  href="#data-security"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Data Security
                </a>
                <a
                  href="#data-retention"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Data Retention
                </a>
                <a
                  href="#third-party-providers"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Third-Party Providers
                </a>
                <a
                  href="#your-rights"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Your Privacy Rights
                </a>
                <a
                  href="#contact-information"
                  className="block text-base text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2"
                >
                  Contact Us
                </a>
              </nav>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-12">
          
          {/* Introduction */}
          <section id="introduction">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Our Commitment to Privacy
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    ReplyFlowHQ LLC is committed to protecting the privacy and security of our users and their customers. 
                    This privacy policy explains how we collect, use, and protect information in connection with our 
                    automated missed-call text response service.
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed mt-4">
                    ReplyFlowHQ LLC provides <strong>automated missed-call text response services</strong> that help businesses 
                    respond to missed customer calls through automated text messages. We are not a bulk marketing 
                    platform and only facilitate communications initiated by customer contact.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Information We Collect */}
          <section id="information-we-collect">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Information We Collect
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Business Information</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        We collect information from businesses that use ReplyFlowHQ, including:
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <li>• Business name and contact information</li>
                        <li>• Business phone numbers for call forwarding</li>
                        <li>• Account credentials and authentication data</li>
                        <li>• Payment and billing information</li>
                        <li>• Custom message templates and settings</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Customer Information</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        When customers call businesses using ReplyFlowHQ, we may collect:
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <li>• Customer phone numbers (for response delivery)</li>
                        <li>• Call timestamps and duration</li>
                        <li>• Message content and conversation history</li>
                        <li>• Opt-out preferences and requests</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Technical Information</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        We automatically collect certain technical information, including:
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <li>• IP addresses and device information</li>
                        <li>• Browser type and operating system</li>
                        <li>• Usage patterns and service interactions</li>
                        <li>• System logs and error reports</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How We Use Information */}
          <section id="how-we-use-information">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  How We Use Information
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    ReplyFlowHQ LLC uses collected information for the following purposes:
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Service Delivery</strong> - To provide automated missed-call text response services
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Account Management</strong> - To manage business accounts and provide customer support
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Compliance</strong> - To comply with legal obligations and regulatory requirements
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Security</strong> - To protect against fraud, abuse, and security threats
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Improvement</strong> - To analyze usage patterns and improve our services
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>Important:</strong> ReplyFlowHQ LLC does not sell, rent, or share customer information with third parties 
                      for marketing purposes. We only use information as described in this policy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Voice Calls and AI Services */}
          <section id="voice-ai-services">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Voice Calls and AI Services
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    ReplyFlowHQ LLC may process inbound telephone calls, voicemail recordings, call transcripts, call summaries, and AI-assisted conversations for the purpose of lead capture, customer communication, service improvement, and platform functionality.
                  </p>
                  <div className="mt-6">
                    <p className="text-gray-600 dark:text-gray-400 font-medium mb-3">
                      Depending on enabled features, ReplyFlowHQ LLC may store:
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li>• Caller phone numbers</li>
                      <li>• SMS conversations</li>
                      <li>• Voicemail recordings</li>
                      <li>• AI-generated call summaries</li>
                      <li>• Call transcripts</li>
                      <li>• Lead information</li>
                      <li>• Communication history</li>
                    </ul>
                  </div>
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Third-Party Processing:</strong> Voice and AI processing may utilize third-party service providers including telephony and artificial intelligence providers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Data Security */}
          <section id="data-security">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Data Security & Protection
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    ReplyFlowHQ LLC implements security measures to protect all data:
                  </p>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400">
                          <strong>Encryption</strong> - All data encrypted in transit and at rest
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400">
                          <strong>Access Controls</strong> - Strict authentication and authorization
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400">
                          <strong>Regular Audits</strong> - Ongoing security monitoring and testing
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400">
                          <strong>Data Minimization</strong> - Only collect necessary information
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400">
                          <strong>Secure Infrastructure</strong> - Secure hosting and monitoring
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 dark:text-gray-400">
                          <strong>Compliance</strong> - GDPR, CCPA, and industry standards
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section id="data-retention">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Data Retention
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    ReplyFlowHQ LLC retains data while your account remains active and for a reasonable period afterward for legal, operational, security, fraud-prevention, and dispute-resolution purposes.
                  </p>
                  <div className="mt-6">
                    <p className="text-gray-600 dark:text-gray-400 font-medium mb-3">Data that may be retained includes:</p>
                    <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li>• SMS messages and conversation history</li>
                      <li>• Lead information and contact details</li>
                      <li>• Conversations and customer interactions</li>
                      <li>• Voicemail recordings</li>
                      <li>• Call transcripts</li>
                      <li>• AI-generated summaries and extracted information</li>
                    </ul>
                  </div>
                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>Account Closure:</strong> Upon account closure, data will be retained according to our privacy policy and applicable legal requirements. You may request data deletion by contacting privacy@replyflowhq.com.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Third-Party Service Providers */}
          <section id="third-party-providers">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Third-Party Service Providers
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    ReplyFlowHQ LLC uses third-party service providers to deliver our services. These providers only process information necessary to deliver services and are bound by contractual obligations to protect your data.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Twilio</strong> - Voice and SMS delivery services
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>OpenAI</strong> - AI processing and transcription services
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Stripe</strong> - Billing and payment processing
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400">
                        <strong>Supabase</strong> - Authentication and data storage
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>Data Protection:</strong> All third-party providers are evaluated for security and compliance. We only share the minimum data necessary for service delivery.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section id="your-rights">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Your Privacy Rights
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    You have the following rights regarding your personal information:
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Access & Portability</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Request access to or export of your personal information
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Correction & Deletion</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Request correction or deletion of inaccurate or unnecessary information
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Opt-Out & Communication Preferences</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Control communication preferences and opt out of marketing communications
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Data Subject Rights</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Exercise rights under applicable privacy laws and regulations
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section id="contact-information">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Contact Us
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    If you have questions about this privacy policy or our data practices, please contact us:
                  </p>
                  <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-blue-900 dark:text-blue-100">Privacy & Security</p>
                        <a 
                          href="mailto:privacy@replyflowhq.com" 
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          privacy@replyflowhq.com
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-gray-600 dark:text-gray-400">
                      For general support and inquiries:
                    </p>
                    <a 
                      href="mailto:support@replyflowhq.com" 
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      support@replyflowhq.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          </div>
        </div>
      </div>
      <Footer />
    </PageBackground>
  )
}
