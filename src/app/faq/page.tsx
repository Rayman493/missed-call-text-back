import { Metadata } from 'next'
import Link from 'next/link'
import FAQAccordion from '@/components/FAQAccordion'

export const metadata: Metadata = {
  title: 'ReplyFlow FAQ | Missed Call Text Back Questions',
  description: 'Learn how ReplyFlow works, how missed-call texting works, setup details, pricing, and common questions.',
}

const faqItems = [
  {
    question: 'How does ReplyFlow work?',
    answer: [
      'Customers call your normal business number.',
      'If you miss the call, it forwards to ReplyFlow.',
      'ReplyFlow instantly texts the customer back and creates a lead in your inbox.',
    ],
  },
  {
    question: 'Do I keep my existing business number?',
    answer: 'Yes. Your customers continue calling your normal business number.',
  },
  {
    question: 'Will my phone still ring normally?',
    answer: 'Yes. ReplyFlow only activates if you miss the call.',
  },
  {
    question: 'What happens if I answer the call?',
    answer: 'Nothing. ReplyFlow only responds to missed calls.',
  },
  {
    question: 'How long does setup take?',
    answer: 'Most businesses are fully set up in under 5 minutes.',
  },
  {
    question: 'Do I need any new hardware?',
    answer: 'No. ReplyFlow works with your existing phone and carrier.',
  },
  {
    question: 'Can customers reply to the text message?',
    answer: 'Yes. Customer replies appear directly inside your ReplyFlow inbox.',
  },
  {
    question: 'Do follow-up texts stop if the customer replies?',
    answer: 'Yes. ReplyFlow automatically stops follow-up messages once the customer responds.',
  },
  {
    question: 'Does ReplyFlow work with Verizon, AT&T, and T-Mobile?',
    answer: 'Yes. ReplyFlow works with most major US carriers using missed-call forwarding.',
  },
  {
    question: 'Will customers know the message is automated?',
    answer: 'The first message is automated, but you can continue the conversation personally from your dashboard.',
  },
  {
    question: 'Can I customize the auto-reply message?',
    answer: 'Yes. You can fully customize your automatic text response and follow-up timing.',
  },
  {
    question: 'Is there a contract?',
    answer: 'No contracts. ReplyFlow is month-to-month and can be canceled anytime.',
  },
]

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero Section */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
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
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Everything you need to know about ReplyFlow and missed-call texting.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <FAQAccordion items={faqItems} />
      </div>

      {/* CTA Section */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Still have questions?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              We're happy to help you get set up.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Start Free Trial
              </Link>
              <Link
                href="mailto:support@replyflowhq.com"
                className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
