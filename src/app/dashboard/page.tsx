import { supabaseAdmin } from '@/lib/supabase'
import { formatPhoneNumber, formatRelativeTime, truncateText, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

// Force dynamic rendering to prevent stale data
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function markLeadAsContacted(leadId: string) {
  'use server'
  
  try {
    const { error } = await supabaseAdmin
      .from('leads')
      .update({ 
        status: 'contacted'
      })
      .eq('id', leadId)

    if (error) {
      console.error('Failed to mark lead as contacted:', error)
      throw new Error('Failed to update lead status')
    }

    // Redirect back to dashboard to refresh the data
    redirect('/dashboard?success=lead-contacted')
  } catch (error) {
    console.error('Unexpected error marking lead as contacted:', error)
    throw error
  }
}

async function getDashboardData() {
  // Find the business with the configured Twilio phone number
  const configuredPhone = process.env.TWILIO_PHONE_NUMBER
  
  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('twilio_phone_number', configuredPhone)
    .single()

  if (error || !business) {
    console.log('Business not found for phone:', configuredPhone, error)
    return { business: null, leads: [], allBusinesses: [], businessLeadCounts: [] }
  }

  console.log('Selected business:', { id: business.id, name: business.name, phone: business.twilio_phone_number })

  // Query leads only for this business, sorted by latest activity
  console.log("Dashboard fetching leads for business:", { business_id: business.id, business_name: business.name })
  
  const { data: leads, error: leadsError } = await supabaseAdmin
    .from('leads')
    .select(`
      *,
      messages (
        id,
        body,
        direction,
        created_at
      )
    `)
    .eq('business_id', business.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('first_contact_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  
  console.log("Dashboard leads query result:", { leads_count: leads?.length || 0, leads_error: leadsError })
  
  if (leadsError) {
    console.log("Dashboard leads query error:", leadsError)
  }

  return {
    business,
    leads: leads || [],
    allBusinesses: [business],
    businessLeadCounts: [{
      businessId: business.id,
      businessName: business.name,
      leadCount: leads?.length || 0
    }]
  }
}

export default async function DashboardPage({ searchParams }: { searchParams?: { success?: string } }) {
  const { business, leads, allBusinesses, businessLeadCounts } = await getDashboardData()
  
  // Calculate lead counts
  const newLeads = leads.filter(lead => lead.status === 'new').length
  const contactedLeads = leads.filter(lead => lead.status === 'contacted').length

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">No business found. Please set up your business first.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Debug Header */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="text-sm text-blue-800">
            <strong>DEBUG:</strong> Selected Business ID: {business.id} | 
            Selected Business Name: {business.name} | 
            Phone: {business.twilio_phone_number} | 
            Configured Phone: {process.env.TWILIO_PHONE_NUMBER} | 
            Lead Count: {leads.length}
          </div>
        </div>

        {/* Success Message */}
        {searchParams?.success === 'settings-updated' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="text-sm text-green-800">
              <strong>Success!</strong> Your business settings have been updated.
            </div>
          </div>
        )}
        {searchParams?.success === 'lead-contacted' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="text-sm text-green-800">
              <strong>Success!</strong> Lead has been marked as contacted.
            </div>
          </div>
        )}
        
        {/* Header */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
                <p className="text-sm text-gray-600">Automated text responses for missed calls</p>
              </div>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l6-6m6 6v4H4a2 2 0 01-4-4H5a4 4 0 01-4 4h2a4 4 0 01-4 4v6a2 4 0 01-4 4h6a4 4 0 01-4 4h6a4 4 0 01-4 4z"/>
                </svg>
                Settings
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 01-4-4H5a4 4 0 01-4 4h2a4 4 0 01-4 4h6a4 4 0 01-4 4h6a4 4 0 01-4 4v2a4 4 0 01-4 4h8a4 4 0 01-4 4h6a4 4 0 01-4-4v14a4 4 0 01-4-4h-4a4 4 0 01-4 4z"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{leads.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">New Leads</h3>
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-4H8m8 4v8m-4 4h4"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{newLeads}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Contacted</h3>
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2m0 0l-2-2m2 2l-2-2"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{contactedLeads}</p>
          </div>
        </div>

        {/* Debug Section */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-medium text-yellow-800 mb-4">Debug Info</h2>
          <div className="space-y-2 text-sm">
            <div className="text-yellow-700">
              <strong>Selected Business ID:</strong> {business.id}
            </div>
            <div className="text-yellow-700">
              <strong>Selected Business Name:</strong> {business.name}
            </div>
            <div className="text-yellow-700">
              <strong>Total Businesses:</strong> {allBusinesses.length}
            </div>
            <div className="text-yellow-700">
              <strong>Lead Counts by Business:</strong>
              <ul className="ml-4 mt-1">
                {businessLeadCounts.map((count) => (
                  <li key={count.businessId} className="text-yellow-600">
                    {count.businessName} ({count.businessId}): {count.leadCount} leads
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="bg-white rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Recent Leads</h2>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{leads.length}</span>
            </div>
          </div>
          <div className="p-6">
            {leads.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V7a2 2 0 01-2-2H7a2 2 0 01-2 2v10a2 2 0 01-2 2h2a2 2 0 01-2 2v6a2 2 0 01-2 2h2a2 2 0 01-2 2v10a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No leads yet</h3>
                <p className="text-gray-600">Missed calls will appear here automatically.</p>
                <p className="text-sm text-gray-500 mt-2">Call your Twilio number and hang up to test the missed call flow.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leads.map((lead) => (
                  <div key={lead.id} className="bg-gray-50 rounded-lg p-4 hover:bg-white transition-colors duration-200 border border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 01-2-2h14a2 2 0 01-2 2v14a2 2 0 01-2 2H5a2 2 0 01-2 2V7z"/>
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                {formatPhoneNumber(lead.caller_phone)}
                              </h3>
                              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getLeadStatusColor(lead.status)}`}>
                                {lead.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">
                              {lead.last_message_at ? (
                                <>Last message {formatRelativeTime(lead.last_message_at)}</>
                              ) : (
                                <>First contact {formatRelativeTime(lead.first_contact_at)}</>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 sm:gap-4">
                        {lead.status === 'new' && (
                          <form action={markLeadAsContacted.bind(null, lead.id)}>
                            <button
                              type="submit"
                              className="inline-flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-100 border border-green-300 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L16 7l-4-4"/>
                              </svg>
                              Mark Contacted
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                          </svg>
                          View Details
                        </Link>
                      </div>
                    </div>
                    
                    {/* Latest Message */}
                    {lead.messages && lead.messages.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M4 12h.01M16 12h.01M1 12h.01"/>
                          </svg>
                          <span className="text-sm font-medium text-gray-900">Latest Message</span>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatRelativeTime(lead.messages[0].created_at)}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {lead.status === 'new' && (
                            <form action={markLeadAsContacted.bind(null, lead.id)}>
                              <button
                                type="submit"
                                className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                              >
                                Mark Contacted
                              </button>
                            </form>
                          )}
                          <Link
                            href={`/dashboard/leads/${lead.id}`}
                            className="text-blue-600 hover:text-blue-900 text-xs"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
