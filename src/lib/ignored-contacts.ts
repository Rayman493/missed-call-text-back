import { createClient } from '@supabase/supabase-js'
import { normalizePhoneNumber, phoneNumbersMatch } from './phone-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Check if a phone number is in the ignored contacts list for a business
 */
export async function isIgnoredContact(businessId: string, phoneNumber: string): Promise<boolean> {
  console.log('[IGNORED CONTACT CHECK START]', {
    businessId,
    incomingRaw: phoneNumber,
    timestamp: new Date().toISOString()
  })
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Fetch all ignored contacts for this business
    const { data: ignoredContacts, error } = await supabase
      .from('ignored_contacts')
      .select('id, phone_number')
      .eq('business_id', businessId)
    
    if (error) {
      console.error('[IGNORED CONTACT CHECK] Error fetching ignored contacts:', error)
      return false
    }
    
    const normalizedIncoming = normalizePhoneNumber(phoneNumber)
    
    console.log('[IGNORED CONTACT CHECK RESULT]', {
      ignoredContactsCount: ignoredContacts?.length || 0,
      incomingNormalized: normalizedIncoming,
      timestamp: new Date().toISOString()
    })
    
    if (!ignoredContacts || ignoredContacts.length === 0) {
      console.log('[IGNORED CONTACT CHECK] No ignored contacts found for business')
      return false
    }
    
    // Check if any ignored contact matches the incoming phone number
    for (const contact of ignoredContacts) {
      if (phoneNumbersMatch(phoneNumber, contact.phone_number)) {
        console.log('[IGNORED CONTACT MATCH]', {
          businessId,
          incomingNumber: phoneNumber,
          incomingNormalized: normalizedIncoming,
          matchedIgnoredContactId: contact.id,
          storedNumber: contact.phone_number,
          timestamp: new Date().toISOString()
        })
        return true
      }
    }
    
    console.log('[IGNORED CONTACT CHECK] No match found')
    return false
  } catch (error) {
    console.error('[IGNORED CONTACT CHECK] Unexpected error:', error)
    return false
  }
}
