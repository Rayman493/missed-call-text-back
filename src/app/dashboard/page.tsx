import { supabase } from '@/lib/supabase'
import { formatPhoneNumber, formatRelativeTime, truncateText, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

async function markLeadAsContacted(leadId: string) {
  'use server'
  
  try {
    const { error } = await supabase
      .from('leads')
      .update({ 
        status: 'contacted',
        updated_at: new Date().toISOString()
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
  // Get all businesses for debugging
  const { data: allBusinesses } = await supabase
    .from('businesses')
    .select('*')

  console.log('Dashboard Debug - All businesses:', allBusinesses)

  if (!allBusinesses || allBusinesses.length === 0) {
    return { business: null, leads: [], allBusinesses: [], businessLeadCounts: [] }
  }

  // Get lead counts for all businesses
  const businessLeadCounts = await Promise.all(
    allBusinesses.map(async (business) => {
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .eq('business_id', business.id)
      
      return {
        businessId: business.id,
        businessName: business.name,
        leadCount: leads?.length || 0
      }
    })
  )

  console.log('Dashboard Debug - Lead counts by business:', businessLeadCounts)

  // Find the business with the configured Twilio phone number
  const configuredPhone = process.env.TWILIO_PHONE_NUMBER
  console.log('Dashboard Debug - Looking for business with phone:', configuredPhone)
  console.log('Dashboard Debug - Available phone numbers:', allBusinesses.map(b => ({ id: b.id, name: b.name, phone: b.twilio_phone_number })))
  
  const business = allBusinesses.find(b => b.twilio_phone_number === configuredPhone) || allBusinesses[0]
  console.log('Dashboard Debug - Selected business:', business.id, business.name, business.twilio_phone_number)

  const { data: leads } = await supabase
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
    .order('created_at', { ascending: false })

  console.log('Dashboard Debug - Leads for selected business:', leads?.length || 0)

  return {
    business,
    leads: leads || [],
    allBusinesses,
    businessLeadCounts
  }
}

export default async function DashboardPage({ searchParams }: { searchParams?: { success?: string } }) {
  const { business, leads, allBusinesses, businessLeadCounts } = await getDashboardData()

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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
              <p className="text-gray-600">{business.name}</p>
            </div>
            <Link
              href="/dashboard/settings"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Leads</h3>
            <p className="text-3xl font-bold text-gray-900">{leads.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 mb-2">New Leads</h3>
            <p className="text-3xl font-bold text-blue-600">
              {leads.filter(lead => lead.status === 'new').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Contacted</h3>
            <p className="text-3xl font-bold text-green-600">
              {leads.filter(lead => lead.status === 'contacted').length}
            </p>
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

        {/* Leads Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Leads</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Latest Message
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    First Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Message
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leads.map((lead) => {
                  const latestMessage = lead.messages && lead.messages.length > 0
                    ? lead.messages[lead.messages.length - 1]
                    : null

                  return (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatPhoneNumber(lead.caller_phone)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getLeadStatusColor(lead.status)}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {latestMessage ? (
                          <div>
                            <p className="truncate max-w-xs">
                              {latestMessage.direction === 'inbound' ? 'In: ' : 'Out: '}
                              {truncateText(latestMessage.body, 40)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatRelativeTime(latestMessage.created_at)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">No messages</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatRelativeTime(lead.first_contact_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatRelativeTime(lead.last_message_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {leads.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No leads yet. Missed calls will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
