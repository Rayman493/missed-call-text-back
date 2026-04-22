import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { redirect } from 'next/navigation'

async function getActiveBusiness() {
  const configuredPhone = process.env.TWILIO_PHONE_NUMBER
  
  const { data: businesses } = await supabase
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
    const { error } = await supabase
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
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Business Information</h2>
          </div>
          
          <form action={updateBusiness} className="p-6 space-y-6">
            <input type="hidden" name="businessId" value={business.id} />
            
            {/* Business Name */}
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-2">
                Business Name
              </label>
              <input
                type="text"
                id="businessName"
                name="businessName"
                defaultValue={business.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your business name"
                required
              />
            </div>

            {/* Twilio Phone Number */}
            <div>
              <label htmlFor="twilioPhoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Twilio Phone Number
              </label>
              <input
                type="tel"
                id="twilioPhoneNumber"
                name="twilioPhoneNumber"
                defaultValue={business.twilio_phone_number}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+1234567890"
                pattern="\+[0-9]+"
                title="Please enter in format: +1234567890"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Format: +1234567890 (with country code)
              </p>
            </div>

            {/* Auto Reply Message */}
            <div>
              <label htmlFor="autoReplyMessage" className="block text-sm font-medium text-gray-700 mb-2">
                Auto Reply Message
              </label>
              <textarea
                id="autoReplyMessage"
                name="autoReplyMessage"
                defaultValue={business.auto_reply_message}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your auto reply message for missed calls"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                This message will be sent to customers when they miss your call.
              </p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end space-x-4">
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
