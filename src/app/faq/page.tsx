import { Metadata } from 'next'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'

export const metadata: Metadata = {
  title: 'ReplyFlowHQ FAQ | Missed Call Response Automation',
  description: 'Learn how ReplyFlowHQ provides conversational customer messaging through missed-call response automation. Setup, pricing, and compliance questions answered.',
}

export default function FAQPage() {
  return (
    <PageBackground>
      <AppHeader />
      
      {/* Back to Home Navigation */}
      <div className="bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-6">
              <svg
                className="w-8 h-8 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Everything you need to know about ReplyFlowHQ's conversational missed-call response automation
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-12">
          
          {/* What does ReplyFlow do? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What does ReplyFlowHQ do?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  ReplyFlowHQ provides <strong>conversational missed-call response automation</strong> for businesses. 
                  When a customer calls your business and the call is missed, ReplyFlow automatically sends a 
                  personalized text message to continue the conversation and capture the lead.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  This is <strong>not</strong> bulk marketing or cold outreach. Messages are only sent after 
                  an inbound customer initiates contact by calling your business number.
                </p>
              </div>
            </div>
          </div>

          {/* How does ReplyFlow work? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How does ReplyFlowHQ work?
              </h2>
              <div className="prose prose-invert max-w-none">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">1</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Customer calls your business</strong> - A customer dials your existing business phone number
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">2</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Call is missed</strong> - If the call goes unanswered, ReplyFlow detects the missed call
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">3</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Automated response sent</strong> - ReplyFlow sends a personalized text message within seconds
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">4</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Conversation continues</strong> - Customer replies appear in your ReplyFlow dashboard for ongoing communication
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Are these marketing texts? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Are these marketing texts?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>No, absolutely not.</strong> ReplyFlowHQ is designed for <strong>conversational customer messaging</strong> only.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-muted-foreground">No cold texting or purchased contact lists</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-muted-foreground">Messages only occur after inbound customer calls</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-muted-foreground">Pure conversational customer communication</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-muted-foreground">Customer-initiated contact triggers every message</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Can customers opt out? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Can customers opt out?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>Yes, absolutely.</strong> ReplyFlowHQ supports full compliance with opt-out requirements:
                </p>
                <div className="mt-4 space-y-3">
                  <div className="bg-muted rounded-2xl p-4">
                    <p className="font-mono text-sm text-foreground mb-2">STOP</p>
                    <p className="text-muted-foreground">
                      Customers can reply "STOP" to immediately opt out of all future messages
                    </p>
                  </div>
                  <div className="bg-muted rounded-2xl p-4">
                    <p className="font-mono text-sm text-foreground mb-2">HELP</p>
                    <p className="text-muted-foreground">
                      Customers can reply "HELP" to get support contact information
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">
                  All opt-out requests are processed immediately and customers are removed from your messaging list.
                </p>
              </div>
            </div>
          </div>

          {/* Do I keep my existing business number? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Do I keep my existing business number?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>Yes, completely.</strong> Your business keeps its existing public phone number. 
                  ReplyFlow works seamlessly in the background:
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    <span className="text-muted-foreground">Customers continue calling your published business number</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-muted-foreground">Missed calls forward to ReplyFlow infrastructure</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8a6 6 0 01-7.743 5.743L10 16l-1.257-2.257A6 6 0 0118 8z" />
                    </svg>
                    <span className="text-muted-foreground">ReplyFlow handles the automated text response</span>
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">
                  No changes to your business cards, website, or marketing materials are needed.
                </p>
              </div>
            </div>
          </div>

          {/* Is ReplyFlow TCPA compliant? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Is ReplyFlowHQ TCPA compliant?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>ReplyFlowHQ supports compliant conversational messaging workflows.</strong> Here's how:
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Inbound-call-triggered messaging</strong> - Messages are only sent after customers initiate contact by calling
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Conversational context</strong> - Messages relate directly to the missed call interaction
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Full opt-out support</strong> - STOP and HELP keywords are automatically processed
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Important:</strong> Businesses are responsible for ensuring they have proper consent for 
                    communications and maintaining compliance with applicable regulations.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* How quickly are messages sent? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How quickly are messages sent?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  ReplyFlowHQ sends automated responses <strong>within seconds</strong> of a missed call. 
                  The typical delivery time is:
                </p>
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                    <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">&lt;5s</span>
                  </div>
                  <p className="text-muted-foreground">
                    Average message delivery time
                  </p>
                </div>
                <p className="text-muted-foreground mt-4">
                  This rapid response helps capture leads while they're actively engaged and thinking about your business.
                </p>
              </div>
            </div>
          </div>

          {/* Can I respond to customer replies? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Can I respond to customer replies?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>Yes, absolutely.</strong> ReplyFlowHQ provides a complete conversation management system:
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                      <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                    </svg>
                    <span className="text-muted-foreground">Real-time conversation inbox in your dashboard</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="text-muted-foreground">Instant notifications for new customer messages</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2a1 1 0 100-2h2a4 4 0 014 4v6a4 4 0 01-4 4H6a4 4 0 01-4-4V7a4 4 0 014-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-muted-foreground">Message history and conversation tracking</span>
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">
                  Continue the conversation naturally through the ReplyFlowHQ dashboard interface.
                </p>
              </div>
            </div>
          </div>

          {/* What happens if I cancel ReplyFlow? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What happens if I cancel ReplyFlow?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  If you cancel ReplyFlow, your business phone may still be forwarding missed calls to your ReplyFlow number. To stop forwarding, simply disable call forwarding from your business phone using your carrier's forwarding disable code.
                </p>

                <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">
                  Common Carrier Codes
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="bg-muted rounded-2xl p-4 border border-border">
                    <h4 className="font-semibold text-foreground mb-1">Verizon</h4>
                    <p className="text-muted-foreground text-sm">Dial <code className="bg-secondary px-2 py-1 rounded text-foreground font-mono">*73</code> from your business phone.</p>
                  </div>

                  <div className="bg-muted rounded-2xl p-4 border border-border">
                    <h4 className="font-semibold text-foreground mb-1">AT&T</h4>
                    <p className="text-muted-foreground text-sm">Dial <code className="bg-secondary px-2 py-1 rounded text-foreground font-mono">##004#</code> from your business phone.</p>
                  </div>

                  <div className="bg-muted rounded-2xl p-4 border border-border">
                    <h4 className="font-semibold text-foreground mb-1">T-Mobile</h4>
                    <p className="text-muted-foreground text-sm">Dial <code className="bg-secondary px-2 py-1 rounded text-foreground font-mono">##004#</code> from your business phone.</p>
                  </div>

                  <div className="bg-muted rounded-2xl p-4 border border-border">
                    <h4 className="font-semibold text-foreground mb-1">Comcast/Xfinity</h4>
                    <p className="text-muted-foreground text-sm">Dial <code className="bg-secondary px-2 py-1 rounded text-foreground font-mono">*73</code> from your business phone.</p>
                  </div>
                </div>

                <div className="mt-6 bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                        We'll also show these instructions inside your dashboard after cancellation.
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                        You'll receive an email with carrier-specific disable instructions when your subscription ends.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-muted-foreground leading-relaxed mt-6">
                  For other carriers, check with your phone provider or look in your phone settings for call forwarding options.
                </p>
              </div>
            </div>
          </div>

          {/* Does ReplyFlow replace my phone number? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Does ReplyFlow replace my phone number?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>No.</strong> Keep your existing business number and forward unanswered calls to ReplyFlow.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  ReplyFlow works alongside your current phone system. When calls go unanswered, they can be forwarded to ReplyFlow for AI-assisted intake or automatic SMS responses, while you keep using the business number you already advertise everywhere.
                </p>
              </div>
            </div>
          </div>

          {/* How does the AI Receptionist work? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How does the AI Receptionist work?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  When a call goes unanswered, ReplyFlow can answer on your behalf, collect caller information, and save the conversation details inside your account.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  The AI Receptionist can capture the caller's name, reason for calling, urgency level, and preferred callback time. This information is then stored in your ReplyFlow dashboard for easy follow-up.
                </p>
              </div>
            </div>
          </div>

          {/* Can I use ReplyFlow without AI? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Can I use ReplyFlow without AI?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>Yes.</strong> Businesses can use SMS-only workflows without enabling AI receptionist features.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  ReplyFlow offers flexible options - you can use traditional missed-call text responses, or enable the AI Receptionist for call answering and information capture. Choose what works best for your business.
                </p>
              </div>
            </div>
          </div>

          {/* What information does the AI collect? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What information does the AI collect?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  Depending on the conversation, the AI may collect the caller's name, reason for calling, urgency, callback information, and relevant business details.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  The AI is designed to capture operationally important information that helps you understand the customer's needs and prioritize follow-up appropriately.
                </p>
              </div>
            </div>
          </div>

          {/* Are AI conversations saved? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Are AI conversations saved?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  Conversation details, transcripts, and call summaries may be stored within ReplyFlow for business use.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  This allows you to review conversations, track customer interactions, and maintain a complete record of customer communications for your business operations.
                </p>
              </div>
            </div>
          </div>

          {/* Can ReplyFlow answer calls after business hours? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Can ReplyFlow answer calls after business hours?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>Yes.</strong> Businesses can configure after-hours handling and AI-assisted call intake.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  ReplyFlow works 24/7 to ensure you never miss a lead, whether during business hours, after hours, or on weekends. The AI can handle calls and collect information anytime.
                </p>
              </div>
            </div>
          </div>

          {/* How do I contact support? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How do I contact support?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  Our support team is here to help you succeed with ReplyFlowHQ:
                </p>
                <div className="mt-6 bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900 dark:text-blue-100">Email Support</p>
                      <a 
                        href="mailto:support@replyflowhq.com" 
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        support@replyflowhq.com
                      </a>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">
                  We typically respond within 24 hours during business days.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Contact Section */}
        <div className="mt-16 text-center bg-card rounded-2xl p-8 border border-border">
          <h3 className="text-2xl font-semibold text-foreground mb-4">
            Still have questions?
          </h3>
          <p className="text-muted-foreground mb-6">
            Our support team is ready to help you get the most out of ReplyFlowHQ.
          </p>
          <a
            href="mailto:support@replyflowhq.com"
            className="inline-flex items-center h-12 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            Email Support
          </a>
        </div>
      </div>
      <Footer />
    </PageBackground>
  )
}
