import { Metadata } from 'next'
import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'

export const metadata: Metadata = {
  title: 'ReplyFlowHQ Terms of Service | Conversational Messaging Platform',
  description: 'ReplyFlowHQ terms of service for conversational missed-call response automation. Service agreement, responsibilities, and usage terms.',
}

export default function TermsPage() {
  return (
    <PageBackground>
      <SSRSafeNavbar forceDark={true} />
      
      {/* Back to Home Navigation */}
      <div className="bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 group"
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
      <div className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-6">
              <svg
                className="w-8 h-8 text-purple-600 dark:text-purple-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 00-2.812 2.812 3.066 3.066 0 01-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 00-2.812-2.812 3.066 3.066 0 01-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 002.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6">
              Terms of Service
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              ReplyFlowHQ service agreement for conversational missed-call response automation.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Terms Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-12">
          
          {/* Agreement */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Service Agreement
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    By using ReplyFlowHQ's conversational messaging services, you agree to these terms of service. 
                    ReplyFlowHQ provides <strong>missed-call response automation</strong> services for businesses 
                    to communicate with customers who have initiated contact by calling.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-4">
                    If you do not agree to these terms, please do not use our services. ReplyFlowHQ reserves the right 
                    to modify these terms at any time, with changes effective upon posting.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Service Description */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Service Description
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    ReplyFlowHQ provides the following services:
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Conversational Messaging</strong> - Automated text responses to missed customer calls
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Conversation Management</strong> - Dashboard for ongoing customer communications
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Call Forwarding</strong> - Infrastructure for missed call detection
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Compliance Support</strong> - Opt-out processing and regulatory adherence tools
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Important:</strong> ReplyFlowHQ is <strong>not</strong> a bulk marketing platform. 
                      Services are limited to conversational messaging initiated by customer contact.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* User Responsibilities */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  User Responsibilities
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    As a ReplyFlowHQ user, you are responsible for:
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-muted-foreground">
                        <strong>Legal Compliance</strong> - Ensuring all communications comply with applicable laws and regulations
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-muted-foreground">
                        <strong>Customer Consent</strong> - Obtaining proper consent for customer communications
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-muted-foreground">
                        <strong>Content Compliance</strong> - Ensuring message content is appropriate and professional
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-muted-foreground">
                        <strong>Account Security</strong> - Maintaining the security of your account and credentials
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">!</span>
                      </div>
                      <p className="text-muted-foreground">
                        <strong>Accurate Information</strong> - Providing and maintaining accurate business information
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Prohibited Uses */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Prohibited Uses
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    ReplyFlowHQ services may not be used for:
                  </p>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Bulk Marketing</strong> - Mass messaging, promotional campaigns, or marketing blasts
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Cold Outreach</strong> - Contacting individuals who have not initiated contact
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Illegal Activities</strong> - Any unlawful or fraudulent purposes
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Harassment</strong> - Abusive, threatening, or harassing communications
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Third-Party Lists</strong> - Using purchased or rented contact lists
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* AI-Assisted Communications */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  AI-Assisted Communications
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    ReplyFlowHQ LLC provides AI-assisted communication tools including AI voicemail intake, transcription, summarization, and automated responses to assist with customer communications.
                  </p>
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-foreground mb-3">Business Acknowledgments</h3>
                    <p className="text-muted-foreground mb-4">
                      Businesses acknowledge and agree to the following:
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-muted-foreground">
                          <strong>AI Inaccuracies</strong> - AI-generated responses, transcriptions, and summaries may contain inaccuracies, errors, or omissions. AI outputs are not guaranteed to be complete or correct.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-muted-foreground">
                          <strong>Business Responsibility</strong> - Businesses remain fully responsible for all customer communications, including those generated or assisted by AI. Businesses should review important customer interactions when appropriate.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-muted-foreground">
                          <strong>Legal Compliance</strong> - Businesses are responsible for complying with all applicable laws governing call handling, call recording, messaging, and customer communications, including obtaining required consents.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Important:</strong> ReplyFlowHQ LLC's AI features are designed to assist with customer communications but do not replace professional judgment or legal compliance requirements. Businesses should review and verify AI-generated content before sending to customers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Payment Terms */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Payment Terms
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Subscription Fees</h3>
                      <p className="text-muted-foreground">
                        ReplyFlowHQ services are provided on a subscription basis with monthly recurring fees.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Billing Cycle</h3>
                      <p className="text-muted-foreground">
                        Fees are billed in advance on a monthly basis. No refunds for partial months.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Payment Methods</h3>
                      <p className="text-muted-foreground">
                        We accept major credit cards and other payment methods as specified during signup.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Late Payments</h3>
                      <p className="text-muted-foreground">
                        Late payments may result in service suspension. Reconnection fees may apply.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Termination */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Service Termination
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">User Termination</h3>
                      <p className="text-muted-foreground">
                        You may terminate your account at any time through your dashboard settings or by contacting support.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">ReplyFlowHQ Termination</h3>
                      <p className="text-muted-foreground">
                        We may terminate service for violations of these terms or non-payment with appropriate notice.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Data Retention</h3>
                      <p className="text-muted-foreground">
                        Upon termination, data will be retained according to our privacy policy and legal requirements.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Limitation of Liability */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Limitation of Liability
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    ReplyFlowHQ's liability is limited as follows:
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        Service provided "as is" without warranties of any kind
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        Maximum liability limited to fees paid in the preceding 3 months
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        Not liable for indirect, incidental, or consequential damages
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Service Availability */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Service Availability
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    ReplyFlowHQ LLC strives to provide reliable service but does not guarantee uninterrupted or error-free availability.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-4">
                    Service interruptions may occur due to maintenance, telecommunications providers, infrastructure providers, third-party vendors, or circumstances outside our control.
                  </p>
                  <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Important:</strong> While we work to minimize downtime, we do not guarantee 100% uptime. Critical services may be temporarily unavailable during scheduled maintenance or unexpected outages.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SMS Messaging Terms */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  SMS Messaging Terms
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    ReplyFlowHQ facilitates conversational SMS communication between businesses and their customers.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Customer Initiated Contact</strong> - Customers may receive SMS messages regarding inquiries they initiated by contacting a participating business.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Message Frequency</strong> - Message frequency varies based on customer interaction and communication needs.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Message & Data Rates</strong> - Message and data rates may apply.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Opt-Out Instructions</strong> - Reply STOP at any time to opt out of SMS communications.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Support Information</strong> - Reply HELP for assistance.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-muted-foreground">
                        <strong>Support Contact</strong> - For support, contact <a href="mailto:support@replyflowhq.com" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">support@replyflowhq.com</a>.
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Additional Information:</strong> Additional information can be found in our <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline">Privacy Policy</Link> and <Link href="/compliance" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline">Compliance Policy</Link>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">
                  Contact Information
                </h2>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    For questions about these terms of service, please contact us:
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
                        <p className="font-semibold text-blue-900 dark:text-blue-100">Legal & Support</p>
                        <a 
                          href="mailto:support@replyflowhq.com" 
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          support@replyflowhq.com
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-muted-foreground">
                      ReplyFlowHQ LLC<br />
                      Conversational Messaging Platform<br />
                      replyflowhq.com
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
      <Footer />
    </PageBackground>
  )
}
