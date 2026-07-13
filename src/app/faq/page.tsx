import { Metadata } from 'next'
import Link from 'next/link'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import PageBackground from '@/components/PageBackground'
import ReplyFlowAssistant from '@/components/ReplyFlowAssistant'
import DocumentationHero from '@/components/DocumentationHero'
import ScrollToTopOnMount from '@/components/ScrollToTopOnMount'

export const metadata: Metadata = {
  title: 'ReplyFlow FAQ | AI Voice, Lead Management, Appointments & Payments',
  description: 'Learn how ReplyFlow provides AI Voice, missed-call recovery, lead management, appointment scheduling, and Payment Requests. Setup, pricing, and compliance questions answered.',
}

export default function FAQPage() {
  return (
    <PageBackground>
      <ScrollToTopOnMount />
      <SSRSafeNavbar forceDark={true} />

      {/* Hero Section */}
      <DocumentationHero
        activePage="faq"
        title="Frequently Asked Questions"
        subtitle="Everything you need to know about ReplyFlow's AI Voice, missed-call recovery, lead management, appointment scheduling, and Payment Requests."
      >
        <div className="mt-8 max-w-4xl mx-auto">
          <ReplyFlowAssistant defaultCategory="Overview" context={{ currentPage: undefined }} />
        </div>
      </DocumentationHero>

      {/* FAQ Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-12">
          
          {/* What does ReplyFlow do? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What does ReplyFlow do?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  ReplyFlow is a customer management platform for local businesses. When a customer call goes unanswered and forwards to ReplyFlow, <strong>AI Voice</strong> answers live, collects their information, and sends a text summary. From there, you can reply via SMS, schedule an appointment with Google Calendar, and send a branded Payment Request — all from one dashboard.
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
                How does ReplyFlow work?
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
                        <strong>AI Voice answers</strong> - AI Voice answers the call, collects caller information, and ends with a summary
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">4</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Text summary sent</strong> - You and the customer receive a text message with the collected information
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">5</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Customer can reply</strong> - Customer replies appear in your ReplyFlow dashboard for follow-up
                      </p>
                    </div>
                  </div>
                </div>
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

          {/* Do I need a dedicated business phone number? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Do I need a dedicated business phone number?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>No.</strong> ReplyFlow works with either a dedicated business number or a personal phone used for business.
                </p>
                <div className="mt-4 space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4">
                    <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">Best experience: Dedicated business number</h3>
                    <p className="text-sm text-green-800 dark:text-green-200 mb-2">
                      A dedicated business phone number provides the best experience. It allows ReplyFlow to automatically handle every missed customer call without affecting personal callers.
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Still fully supported: Personal business phones</h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                      If you use one phone for both business and personal calls, ReplyFlow still works well. You can use Personal Contacts to keep known personal callers out of the normal ReplyFlow customer workflow.
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      If a personal contact reaches ReplyFlow after a missed call, their voicemail will be saved separately. ReplyFlow will not create a customer, send an automatic text, or schedule follow-ups.
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">
                  <strong>Recommendation:</strong> While ReplyFlow supports both dedicated and shared business phones, businesses with a dedicated business phone number receive the most seamless experience.
                </p>
              </div>
            </div>
          </div>

          {/* Can I use my personal phone as my business number? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Can I use my personal phone as my business number?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  Yes. Many small business owners use the same phone for both business and personal calls, and ReplyFlow fully supports this.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  You have complete control over how specific callers are handled:
                </p>
                <div className="mt-4 space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Leave a number off your Personal Contacts list</h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                      ReplyFlow will treat the missed call like any potential customer:
                    </p>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc pl-5">
                      <li>AI Voice can collect information</li>
                      <li>A lead is created</li>
                      <li>Automated text messages and follow-ups work normally</li>
                    </ul>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Add a number to Personal Contacts</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                      ReplyFlow stays out of the customer workflow:
                    </p>
                    <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1 list-disc pl-5">
                      <li>No customer is created</li>
                      <li>No automated text messages</li>
                      <li>No AI Voice intake</li>
                      <li>No follow-ups are scheduled</li>
                      <li>If they reach ReplyFlow, their voicemail is saved separately</li>
                    </ul>
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">
                  This flexibility makes it easy to keep business calls inside ReplyFlow while allowing personal contacts to bypass automation. You can add or remove numbers from your Personal Contacts list at any time in Settings.
                </p>
                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Why does this work this way?</h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    ReplyFlow identifies callers by their incoming phone number. It can't automatically know whether a missed call is from a customer, a friend, or a family member. Personal Contacts gives you complete control over which phone numbers ReplyFlow should handle and which ones it should leave alone.
                  </p>
                </div>
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
                  <strong>Yes.</strong> ReplyFlow provides a conversation management system:
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
                  Continue conversations naturally through the ReplyFlow dashboard. You can also schedule appointments directly from a lead and send Payment Requests via a branded ReplyFlow link — all within the same conversation view.
                </p>
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
                  <strong>No.</strong> ReplyFlow is designed for <strong>automated missed-call text responses</strong> only.
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
                  <strong>Yes.</strong> ReplyFlow supports opt-out requirements:
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

          {/* Why does the text come from a different number? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Why does the text come from a different number?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  ReplyFlow provides a <strong>dedicated messaging line</strong> so conversations remain organized and customers can continue texting you after the missed call. Your existing business phone number remains unchanged.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Organized conversations</strong> - All customer messages go to one dedicated number for easy management
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Continuous conversation</strong> - Customers can reply and continue the conversation even after the initial missed call
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        <strong>Your number stays the same</strong> - Your business phone number doesn't change, customers still call you at the same number
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Tip:</strong> The ReplyFlow messaging number appears in customer text conversations, but your business number remains unchanged for all incoming calls.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Is ReplyFlow TCPA compliant? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Is ReplyFlow TCPA compliant?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  <strong>ReplyFlow supports compliant conversational messaging workflows.</strong> Here's how:
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
                  ReplyFlow sends automated responses <strong>quickly</strong> after a missed call. 
                  The typical delivery time is:
                </p>
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                    <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">&lt;1m</span>
                  </div>
                  <p className="text-muted-foreground">
                    Typical message delivery time
                  </p>
                </div>
                <p className="text-muted-foreground mt-4">
                  This quick response helps capture leads while they're actively engaged and thinking about your business.
                </p>
              </div>
            </div>
          </div>

          {/* How does AI Voice work? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How does AI Voice work?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  When a call goes unanswered and forwards to ReplyFlow, AI Voice answers the call live and converses with the caller to collect information.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  AI Voice collects details such as the caller's name, reason for calling, important details, location or address, desired completion time, and preferred callback time through a guided conversation. This information is stored in your ReplyFlow dashboard so you can follow up, schedule an appointment, or send a Payment Request without re-entering the details.
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

          
          {/* How do I contact support? */}
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How do I contact support?
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  Our support team is here to help you succeed with ReplyFlow:
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
                        href="https://mail.google.com/mail/?view=cm&fs=1&to=support@replyflowhq.com"
                        target="_blank"
                        rel="noopener noreferrer"
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

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-semibold text-foreground mb-4">
            Ready to get started?
          </h3>
          <p className="text-muted-foreground mb-6">
            Start your 14-day free trial and stop losing missed-call customers.
          </p>
          <Link
            href="/auth?mode=signup"
            className="inline-flex items-center h-12 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
          >
            Start Your 14-Day Free Trial
          </Link>
        </div>

        {/* Contact Section */}
        <div className="mt-16 text-center bg-card rounded-2xl p-8 border border-border">
          <h3 className="text-2xl font-semibold text-foreground mb-4">
            Still have questions?
          </h3>
          <p className="text-muted-foreground mb-6">
            Our support team is ready to help you get the most out of ReplyFlow.
          </p>
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=support@replyflowhq.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center h-12 px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
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
