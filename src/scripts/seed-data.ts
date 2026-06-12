import "dotenv/config";
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Create Supabase client directly with proper error handling
const supabaseAdmin = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
)

async function seedDemoBusiness() {
  try {
    console.log('Seeding demo business...')

    // Check if demo business already exists
    const { data: existingBusiness } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', '+15551234567')
      .single()

    if (existingBusiness) {
      console.log('Demo business already exists:', existingBusiness.name)
      return
    }

    // Create demo business
    const demoBusiness = {
      name: 'Joe\'s Plumbing',
      twilio_phone_number: '+15551234567',
      auto_reply_message: null, // No default - use context-specific templates in SMS routes
    }

    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .insert(demoBusiness)
      .select()
      .single()

    if (error) {
      console.error('Error creating demo business:', error)
      return
    }

    console.log('Demo business created successfully:', business.name)
    console.log('Business ID:', business.id)
    console.log('Phone:', business.twilio_phone_number)
    console.log('Auto-reply:', business.auto_reply_message)

    // Create some demo leads and messages
    const demoLeads = [
      {
        business_id: business.id,
        caller_phone: '+15558675309',
        status: 'contacted' as const,
        first_contact_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        last_message_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
      },
      {
        business_id: business.id,
        caller_phone: '+15552345678',
        status: 'new' as const,
        first_contact_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        last_message_at: null,
      },
      {
        business_id: business.id,
        caller_phone: '+15553456789',
        status: 'qualified' as const,
        first_contact_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        last_message_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      },
    ]

    for (const leadData of demoLeads) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .insert(leadData)
        .select()
        .single()

      if (leadError) {
        console.error('Error creating demo lead:', leadError)
        continue
      }

      console.log('Demo lead created:', lead.caller_phone)

      // Add demo messages for the first lead
      if (lead.caller_phone === '+15558675309') {
        const demoMessages = [
          {
            lead_id: lead.id,
            direction: 'outbound' as const,
            body: `Hi, this is ${business.name || 'My Business'}. We just missed your call. Reply here with what you need help with, and we'll get back to you soon. Reply STOP to opt out.`,
            from_phone: business.twilio_phone_number,
            to_phone: lead.caller_phone,
          },
          {
            lead_id: lead.id,
            direction: 'inbound' as const,
            body: 'Yes, I have a leaky faucet in my kitchen. When can you come out?',
            from_phone: lead.caller_phone,
            to_phone: business.twilio_phone_number,
          },
          {
            lead_id: lead.id,
            direction: 'outbound' as const,
            body: `Hi, this is ${business.name || 'My Business'}. We just missed your call. Reply here with what you need help with, and we'll get back to you soon. Reply STOP to opt out.`,
            from_phone: business.twilio_phone_number,
            to_phone: lead.caller_phone,
          },
        ]

        for (const messageData of demoMessages) {
          const { error: messageError } = await supabaseAdmin
            .from('messages')
            .insert(messageData)

          if (messageError) {
            console.error('Error creating demo message:', messageError)
          }
        }

        console.log('Demo messages created for lead:', lead.caller_phone)
      }

      // Add a call event for the second lead
      if (lead.caller_phone === '+15552345678') {
        const { error: callEventError } = await supabaseAdmin
          .from('call_events')
          .insert({
            business_id: business.id,
            caller_phone: lead.caller_phone,
            call_status: 'no-answer',
            twilio_call_sid: 'demo_call_1',
            raw_payload: { demo: true },
          })

        if (callEventError) {
          console.error('Error creating demo call event:', callEventError)
        } else {
          console.log('Demo call event created for lead:', lead.caller_phone)
        }
      }
    }

    console.log('Demo data seeding completed!')
    console.log('\nYou can now:')
    console.log('1. Visit /dashboard to see the demo business and leads')
    console.log('2. Test the webhooks with ngrok and Twilio')
    console.log('3. Modify the demo business details as needed')

  } catch (error) {
    console.error('Error seeding demo data:', error)
  }
}

// Auto-run the seed function
seedDemoBusiness()

export { seedDemoBusiness }
