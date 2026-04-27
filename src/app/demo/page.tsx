import Link from 'next/link'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import ThemeToggle from '@/components/ThemeToggle'

// Sample data for demo
const sampleLeads = [
  {
    id: '1',
    caller_phone: '+14125551234',
    status: 'replied',
    last_activity: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    messages: [
      {
        direction: 'outbound',
        body: 'Hi, sorry we missed your call — how can we help?',
        created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      },
      {
        direction: 'inbound',
        body: 'Yes, can you come tomorrow around 3?',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: '2',
    caller_phone: '+14125555678',
    status: 'sent',
    last_activity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    messages: [
      {
        direction: 'outbound',
        body: 'Hi, sorry we missed your call — how can we help?',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: '3',
    caller_phone: '+14125559012',
    status: 'replied',
    last_activity: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    messages: [
      {
        direction: 'outbound',
        body: 'Hi, sorry we missed your call — how can we help?',
        created_at: new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString(),
      },
      {
        direction: 'inbound',
        body: 'I need a quote for plumbing work',
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
]

const sampleActivity = [
  { type: 'call', text: 'Missed call from (412) 555-1234', time: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  { type: 'reply', text: 'Customer replied: "Yes, can you come tomorrow around 3?"', time: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  { type: 'call', text: 'Missed call from (412) 555-5678', time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { type: 'text', text: 'Auto-reply sent to (412) 555-5678', time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { type: 'followup', text: 'Follow-up scheduled for (412) 555-1234', time: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
]

export default function DemoPage() {
  const missedCalls = 7
  const textsSent = 7
  const replies = 3
  const followUps = 2

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Demo Mode Banner */}
      <div className="bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3 text-center">
        <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">Demo Mode — sample data shown</p>
      </div>

      {/* Value Message */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800 px-4 py-4 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400 font-semibold">⚡ We text missed callers instantly so you don't lose them to competitors</p>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Your Missed Call Leads</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">See who called, who got a text, and who replied.</p>
          </div>
          <div className="flex gap-4">
            <ThemeToggle />
            <Link
              href="/onboarding"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Set this up in 2 minutes
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Missed Calls</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{missedCalls}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Texts Sent</h3>
            <p className="text-3xl font-bold text-blue-600">{textsSent}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Replies</h3>
            <p className="text-3xl font-bold text-green-600">{replies}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Follow-ups Scheduled</h3>
            <p className="text-3xl font-bold text-purple-600">{followUps}</p>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Live Activity</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {sampleActivity.map((activity, index) => (
                <div key={index} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="text-xl">
                    {activity.type === 'call' ? '📞' : activity.type === 'text' ? '💬' : activity.type === 'reply' ? '📩' : '⏱'}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-gray-100">{activity.text}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeTime(activity.time)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leads Section */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">People Who Tried To Call You</h2>
          <div className="space-y-4">
            {sampleLeads.map((lead) => (
              <div key={lead.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-lg">💬</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{formatPhoneNumber(lead.caller_phone)}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{formatRelativeTime(lead.last_activity)}</p>
                      </div>
                    </div>
                    {/* Message Thread */}
                    <div className="ml-13 space-y-2">
                      {lead.messages.map((message, msgIndex) => (
                        <div
                          key={msgIndex}
                          className={`p-3 rounded-lg ${
                            message.direction === 'outbound'
                              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800'
                              : 'bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600'
                          }`}
                        >
                          <p className="text-sm text-gray-800 dark:text-gray-200">{message.body}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatRelativeTime(message.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        lead.status === 'replied'
                          ? 'bg-green-100 text-green-800'
                          : lead.status === 'sent'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {lead.status === 'replied' ? 'Replied' : lead.status === 'sent' ? 'Sent' : 'New'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA Section */}
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Start capturing missed calls today</h2>
          <Link
            href="/onboarding"
            className="inline-block px-6 py-3 text-lg bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Setup
          </Link>
        </div>
      </div>
    </main>
  )
}
