import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { redirect } from 'next/navigation'

async function getActiveBusiness() {
  const configuredPhone = process.env.TWILIO_PHONE_NUMBER
  
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('*')

  if (!businesses || businesses.length === 0) {
    return null
  }

  const business = businesses.find(b => b.twilio_phone_number === configuredPhone) || businesses[0]
  return business
}

async function updateBusiness(formData: FormData) {
  'use server'
  
  const businessId = formData.get('businessId') as string
  const businessName = formData.get('businessName') as string
  const twilioPhoneNumber = formData.get('twilioPhoneNumber') as string
  const autoReplyMessage = formData.get('autoReplyMessage') as string

  try {
    const { error } = await supabaseAdmin
      .from('businesses')
      .update({
        name: businessName,
        twilio_phone_number: twilioPhoneNumber,
        auto_reply_message: autoReplyMessage,
        updated_at: new Date().toISOString()
      })
      .eq('id', businessId)

    if (error) {
      console.error('Failed to update business:', error)
      throw new Error('Failed to update business')
    }

    // Redirect to dashboard on success
    redirect('/dashboard?success=settings-updated')
  } catch (error) {
    console.error('Unexpected error updating business:', error)
    // In a real app, you'd handle this error properly
    // For now, we'll just re-throw to let Next.js handle it
    throw error
  }
}

export default async function SettingsPage() {
  const business = await getActiveBusiness()

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">No business found. Please set up your business first.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <nav className="text-sm text-gray-500 mb-4">
            <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900">Settings</span>
          </nav>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Business Settings</h1>
          <p className="text-gray-600">Configure your business information and auto-reply message.</p>
        </div>

        {/* Debug Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="text-sm text-blue-800">
            <strong>DEBUG:</strong> Active Business ID: {business.id} | 
            Configured Phone: {process.env.TWILIO_PHONE_NUMBER}
          </div>
        </div>

        {/* Settings Form */}
        <form action={updateBusiness}>
          <div className="bg-white rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.405 1.405H8.02c0-1.405.594-1.405H6.375c-1.405-.594-1.405H4.317c-1.405-.594 1.405H2.68c-.426 0-.594.426-.594.426H1.405c-.426.594-.426.594H.594c0 .426.594.426.594h.821c.426 0 .594-.426.594h1.405c.426.594.426.594H16.53c.426-.594.426-.594h.821c.426 0 .594-.426.594h1.405c.426.594.426.594z"/>
                </svg>
                Business Settings
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <input type="hidden" name="businessId" value={business.id} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  id="businessName"
                  name="businessName"
                  defaultValue={business.name}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 hover:border-gray-400"
                />
              </div>
              <div>
                <label htmlFor="twilioPhoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                  Twilio Phone Number
                </label>
                <input
                  type="tel"
                  id="twilioPhoneNumber"
                  name="twilioPhoneNumber"
                  defaultValue={business.twilio_phone_number}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 hover:border-gray-400"
                  pattern="\+[0-9]+"
                  title="Format: +1234567890"
                />
                <p className="text-xs text-gray-500 mt-1">Format: +1234567890 (with country code)</p>
              </div>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="autoReplyMessage" className="block text-sm font-medium text-gray-700 mb-2">
                  Auto Reply Message
              </label>
              <textarea
                id="autoReplyMessage"
                name="autoReplyMessage"
                defaultValue={business.auto_reply_message}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 hover:border-gray-400 resize-none"
                placeholder="Hi, this is {{business_name}}. Sorry we missed your call—how can we help? Reply STOP to opt out."
              />
              <p className="text-xs text-gray-500 mt-1">This message will be sent automatically when customers miss your calls.</p>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button
                type="submit"
                className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 border border-blue-300 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 shadow-sm hover:shadow-md"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L16 7l-4-4"/>
                </svg>
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
