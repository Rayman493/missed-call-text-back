import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isSystemPhoneNumber } from '@/lib/twilio-assignment'

export const dynamic = 'force-dynamic'

// Configuration
const MIN_AVAILABLE_WARM_NUMBERS = parseInt(process.env.WARM_INVENTORY_TARGET || '3', 10)
const PROTECTED_NUMBERS = (process.env.PROTECTED_TWILIO_NUMBERS || '').split(',').filter(n => n.trim())
const MAX_ATTEMPTS = parseInt(process.env.TWILIO_RETIRED_CLEANUP_MAX_ATTEMPTS || '5', 10)

interface TwilioHealthMetrics {
  // Overall health
  overallHealth: 'healthy' | 'needs_attention' | 'critical'
  overallHealthMessage: string
  lastChecked: string
  
  // Inventory counts
  inventory: {
    total: number
    assigned: number
    active: number
    available: number
    reserved: number
    retired: number
    releasePending: number
    failed: number
    quarantined: number
  }
  
  // Warm pool
  warmPool: {
    count: number
    health: 'green' | 'amber' | 'red'
    minimum: number
    message: string
  }
  
  // Provisioning
  provisioning: {
    ready: number
    pending: number
    failed: number
    stuck: number
    smsReady: number
    smsPending: number
    smsFailed: number
  }
  
  // Release/Cleanup
  release: {
    retiredEligible: number
    releaseAttemptsPending: number
    releaseFailures: number
    exhaustedRetries: number
    retryScheduled: number
    retiredOlderThan30Days: number
  }
  
  // Integrity issues
  integrity: {
    orphanLiveNumbers: number
    missingBusinessLinks: number
    duplicatePhoneNumbers: number
    duplicateTwilioSids: number
    businessesWithMultipleLiveNumbers: number
    availableWithBusiness: number
    expiredReservations: number
    contradictoryStatus: number
  }
  
  // Protected system number
  protectedSystemNumber: {
    phoneNumber: string | null
    twilioSid: string | null
    status: string | null
    provisioningStatus: string | null
    smsStatus: string | null
    protectedStatus: string | null
    purpose: string
  } | null
  
  // Anomaly details (limited rows)
  anomalies: {
    orphanLiveNumbers: any[]
    missingBusinessLinks: any[]
    duplicatePhoneNumbers: any[]
    duplicateTwilioSids: any[]
    businessesWithMultipleLiveNumbers: any[]
    availableWithBusiness: any[]
    expiredReservations: any[]
    contradictoryStatus: any[]
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Ignore setAll errors from Server Components
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch all twilio numbers
    const { data: numbers, error: numbersError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('*')
      .order('created_at', { ascending: false })

    if (numbersError) {
      console.error('[TWILIO HEALTH] Failed to fetch numbers:', numbersError)
      return NextResponse.json({ success: false, error: 'Failed to fetch Twilio numbers' }, { status: 500 })
    }

    const allNumbers = numbers || []

    // Calculate inventory counts
    const inventory = {
      total: allNumbers.length,
      assigned: allNumbers.filter(n => n.business_id !== null && n.status === 'active').length,
      active: allNumbers.filter(n => n.status === 'active').length,
      available: allNumbers.filter(n => n.status === 'available').length,
      reserved: allNumbers.filter(n => n.status === 'reserved').length,
      retired: allNumbers.filter(n => n.status === 'retired').length,
      releasePending: allNumbers.filter(n => n.status === 'release_pending').length,
      failed: allNumbers.filter(n => n.status === 'failed' || n.status === 'error' || n.status === 'quarantined').length,
      quarantined: allNumbers.filter(n => n.status === 'quarantined').length,
    }

    // Calculate warm pool (available with no reservations, ready, no errors)
    const warmPool = allNumbers.filter(n =>
      n.status === 'available' &&
      n.business_id === null &&
      n.reserved_for_business_id === null &&
      n.provisioning_status === 'ready' &&
      n.last_error === null &&
      n.provisioning_error === null
    )
    const warmPoolCount = warmPool.length
    let warmPoolHealth: 'green' | 'amber' | 'red' = 'green'
    let warmPoolMessage = ''

    if (warmPoolCount >= MIN_AVAILABLE_WARM_NUMBERS) {
      warmPoolHealth = 'green'
      warmPoolMessage = `${warmPoolCount} warm numbers available (minimum: ${MIN_AVAILABLE_WARM_NUMBERS})`
    } else if (warmPoolCount === MIN_AVAILABLE_WARM_NUMBERS - 1) {
      warmPoolHealth = 'amber'
      warmPoolMessage = `${warmPoolCount} warm numbers available (minimum: ${MIN_AVAILABLE_WARM_NUMBERS}) - consider replenishing`
    } else {
      warmPoolHealth = 'red'
      warmPoolMessage = `${warmPoolCount} warm numbers available (minimum: ${MIN_AVAILABLE_WARM_NUMBERS}) - immediate attention required`
    }

    // Calculate provisioning metrics
    const provisioning = {
      ready: allNumbers.filter(n => n.provisioning_status === 'ready').length,
      pending: allNumbers.filter(n => ['purchasing', 'purchased', 'campaign_registering', 'campaign_registered', 'sender_pool_attaching'].includes(n.provisioning_status || '')).length,
      failed: allNumbers.filter(n => n.provisioning_status === 'failed').length,
      stuck: allNumbers.filter(n => 
        n.provisioning_status !== 'ready' && 
        n.last_provisioning_attempt_at &&
        new Date(n.last_provisioning_attempt_at) < thirtyMinutesAgo
      ).length,
      smsReady: allNumbers.filter(n => n.status === 'active' && n.sms_status === 'verified').length,
      smsPending: allNumbers.filter(n => n.status === 'active' && n.sms_status === 'pending').length,
      smsFailed: allNumbers.filter(n => n.status === 'active' && n.sms_status === 'failed').length,
    }

    // Calculate release/cleanup metrics
    const release = {
      retiredEligible: allNumbers.filter(n => 
        n.status === 'retired' &&
        n.retired_at &&
        new Date(n.retired_at) < thirtyDaysAgo
      ).length,
      releaseAttemptsPending: allNumbers.filter(n => 
        n.status === 'release_pending' &&
        n.next_release_retry_at &&
        new Date(n.next_release_retry_at) > now
      ).length,
      releaseFailures: allNumbers.filter(n => 
        n.last_release_error !== null &&
        n.release_attempt_count >= MAX_ATTEMPTS
      ).length,
      exhaustedRetries: allNumbers.filter(n => n.release_attempt_count >= 5).length,
      retryScheduled: allNumbers.filter(n => n.next_release_retry_at && new Date(n.next_release_retry_at) > now).length,
      retiredOlderThan30Days: allNumbers.filter(n =>
        n.status === 'retired' &&
        n.retired_at &&
        new Date(n.retired_at) < thirtyDaysAgo
      ).length,
    }

    // Calculate integrity issues
    const allBusinessIds = [...new Set(allNumbers.filter(n => n.business_id).map(n => n.business_id))]
    
    // Orphan live numbers (active with no business, excluding protected system numbers)
    const orphanLiveNumbers = allNumbers.filter(n =>
      n.status === 'active' &&
      n.business_id === null &&
      !isSystemPhoneNumber(n.phone_number)
    )
    
    // Missing business links
    const missingBusinessLinks = allNumbers.filter(n =>
      n.business_id !== null &&
      !allBusinessIds.includes(n.business_id)
    )
    
    // Duplicate phone numbers
    const phoneNumbers = allNumbers.map(n => n.phone_number)
    const duplicatePhoneNumbers = allNumbers.filter(n => 
      phoneNumbers.filter(p => p === n.phone_number).length > 1
    )
    
    // Duplicate Twilio SIDs
    const twilioSids = allNumbers.map(n => n.twilio_sid)
    const duplicateTwilioSids = allNumbers.filter(n => 
      twilioSids.filter(s => s === n.twilio_sid).length > 1
    )
    
    // Businesses with multiple live numbers
    const businessNumberCounts = allBusinessIds.reduce((acc, businessId) => {
      const count = allNumbers.filter(n => n.business_id === businessId && n.status === 'active').length
      acc[businessId] = count
      return acc
    }, {} as Record<string, number>)
    const businessesWithMultipleLiveNumbers = (Object.entries(businessNumberCounts) as [string, number][])
      .filter(([, count]) => count > 1)
      .map(([businessId, count]) => ({ businessId, count }))
    
    // Available numbers still linked to a business
    const availableWithBusiness = allNumbers.filter(n =>
      n.status === 'available' &&
      n.business_id !== null
    )
    
    // Expired reservations
    const expiredReservations = allNumbers.filter(n =>
      n.status === 'reserved' &&
      n.reserved_expires_at &&
      new Date(n.reserved_expires_at) < now
    )
    
    // Contradictory status combinations
    const contradictoryStatus = allNumbers.filter(n => {
      const hasBusiness = n.business_id !== null
      const isReleased = n.status === 'released'
      const isActive = n.status === 'active'
      
      // Released numbers should not have businesses
      if (isReleased && hasBusiness) return true
      
      // Available numbers should not have businesses
      if (isActive && !hasBusiness && !isSystemPhoneNumber(n.phone_number)) return true
      
      return false
    })

    // Get protected system number details
    const systemPhoneNumber = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER
    let protectedSystemNumber = null
    if (systemPhoneNumber) {
      const systemNumberRecord = allNumbers.find(n => n.phone_number === systemPhoneNumber)
      if (systemNumberRecord) {
        protectedSystemNumber = {
          phoneNumber: systemNumberRecord.phone_number,
          twilioSid: systemNumberRecord.twilio_sid,
          status: systemNumberRecord.status,
          provisioningStatus: systemNumberRecord.provisioning_status,
          smsStatus: systemNumberRecord.sms_status,
          protectedStatus: 'protected',
          purpose: 'ReplyFlow system messaging',
        }
      }
    }

    // Calculate overall health
    const issues = [
      warmPoolHealth === 'red',
      orphanLiveNumbers.length > 0,
      missingBusinessLinks.length > 0,
      provisioning.failed > 0,
      release.releaseFailures > 0,
      duplicatePhoneNumbers.length > 0,
      duplicateTwilioSids.length > 0,
    ]
    
    const criticalIssues = issues.filter(Boolean).length
    let overallHealth: 'healthy' | 'needs_attention' | 'critical' = 'healthy'
    let overallHealthMessage = `${warmPoolCount} warm numbers available. No provisioning, release, duplicate, or ownership issues detected.`
    
    if (criticalIssues >= 3) {
      overallHealth = 'critical'
      overallHealthMessage = `Critical: ${criticalIssues} major issues detected. ${overallHealthMessage}`
    } else if (criticalIssues > 0) {
      overallHealth = 'needs_attention'
      overallHealthMessage = `Needs attention: ${criticalIssues} issue(s) detected. ${overallHealthMessage}`
    }

    // Limit anomaly rows to 50 each
    const maxRows = 50

    const anomalies = {
      orphanLiveNumbers: orphanLiveNumbers.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.business_id,
        twilioSid: n.twilio_sid,
        provisioningStatus: n.provisioning_status,
        smsStatus: n.sms_status,
        assignedAt: n.assigned_at,
        createdAt: n.created_at,
      })),
      missingBusinessLinks: missingBusinessLinks.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.business_id,
        twilioSid: n.twilio_sid,
        provisioningStatus: n.provisioning_status,
        smsStatus: n.sms_status,
        createdAt: n.created_at,
      })),
      duplicatePhoneNumbers: duplicatePhoneNumbers.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.business_id,
        twilioSid: n.twilio_sid,
        provisioningStatus: n.provisioning_status,
        smsStatus: n.sms_status,
        createdAt: n.created_at,
      })),
      duplicateTwilioSids: duplicateTwilioSids.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.business_id,
        twilioSid: n.twilio_sid,
        provisioningStatus: n.provisioning_status,
        smsStatus: n.sms_status,
        createdAt: n.created_at,
      })),
      businessesWithMultipleLiveNumbers: businessesWithMultipleLiveNumbers.slice(0, maxRows),
      availableWithBusiness: availableWithBusiness.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.business_id,
        twilioSid: n.twilio_sid,
        provisioningStatus: n.provisioning_status,
        smsStatus: n.sms_status,
        createdAt: n.created_at,
      })),
      expiredReservations: expiredReservations.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.reserved_for_business_id,
        twilioSid: n.twilio_sid,
        reservedAt: n.reserved_at,
        reservedExpiresAt: n.reserved_expires_at,
        reservationReason: n.reservation_reason,
        createdAt: n.created_at,
      })),
      contradictoryStatus: contradictoryStatus.slice(0, maxRows).map(n => ({
        phoneNumber: n.phone_number,
        status: n.status,
        businessId: n.business_id,
        twilioSid: n.twilio_sid,
        provisioningStatus: n.provisioning_status,
        smsStatus: n.sms_status,
        assignedAt: n.assigned_at,
        releasedAt: n.released_at,
        createdAt: n.created_at,
      })),
    }

    const response: TwilioHealthMetrics = {
      overallHealth,
      overallHealthMessage,
      lastChecked: now.toISOString(),
      inventory,
      warmPool: {
        count: warmPoolCount,
        health: warmPoolHealth,
        minimum: MIN_AVAILABLE_WARM_NUMBERS,
        message: warmPoolMessage,
      },
      provisioning,
      release,
      integrity: {
        orphanLiveNumbers: orphanLiveNumbers.length,
        missingBusinessLinks: missingBusinessLinks.length,
        duplicatePhoneNumbers: duplicatePhoneNumbers.length,
        duplicateTwilioSids: duplicateTwilioSids.length,
        businessesWithMultipleLiveNumbers: businessesWithMultipleLiveNumbers.length,
        availableWithBusiness: availableWithBusiness.length,
        expiredReservations: expiredReservations.length,
        contradictoryStatus: contradictoryStatus.length,
      },
      protectedSystemNumber,
      anomalies,
    }

    return NextResponse.json({ success: true, data: response })
  } catch (error: any) {
    console.error('[TWILIO HEALTH] Unexpected error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}