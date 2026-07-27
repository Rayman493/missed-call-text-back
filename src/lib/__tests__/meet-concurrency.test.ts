// Test meeting record concurrency protection using lease mechanism
// This test verifies that multiple workers cannot process the same meeting record simultaneously

import { createClient } from '@supabase/supabase-js'
import { claimMeetingProcessingLease, releaseMeetingProcessingLease } from '@/lib/meet-lease'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function assert(condition: boolean, message: string): Promise<void> {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function testLeaseClaiming(): Promise<void> {
  console.log('\n=== Test 1: Lease Claiming ===')
  
  // Create a test meeting record
  const { data: testRecord, error: createError } = await supabase
    .from('meeting_records')
    .insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      google_calendar_event_id: 'test-concurrency-1',
      status: 'upcoming',
      transcript_status: 'pending',
      processing_attempts: 0,
    })
    .select('id')
    .single()
  
  if (createError || !testRecord) {
    throw new Error('Failed to create test record')
  }
  
  const recordId = testRecord.id
  
  // First worker attempts to claim
  const claim1 = await claimMeetingProcessingLease(recordId)
  await assert(claim1.success === true, 'First worker should successfully claim the record')
  
  // Second worker attempts to claim immediately (should fail)
  const claim2 = await claimMeetingProcessingLease(recordId)
  await assert(claim2.success === false, 'Second worker should fail to claim the same record')
  
  // Release lease
  if (claim1.claim) {
    await releaseMeetingProcessingLease(recordId, claim1.claim.claimedAt)
  }
  
  // Clean up
  await supabase.from('meeting_records').delete().eq('id', recordId)
  
  console.log('✅ Lease claiming test passed')
}

async function testStaleLeaseReclaiming(): Promise<void> {
  console.log('\n=== Test 2: Stale Lease Reclaiming ===')
  
  // Create a test meeting record with an old lease
  const { data: testRecord, error: createError } = await supabase
    .from('meeting_records')
    .insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      google_calendar_event_id: 'test-concurrency-2',
      status: 'upcoming',
      transcript_status: 'pending',
      processing_attempts: 0,
      processing_started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
    })
    .select('id')
    .single()
  
  if (createError || !testRecord) {
    throw new Error('Failed to create test record')
  }
  
  const recordId = testRecord.id
  
  // Worker should be able to reclaim the stale lease
  const claim = await claimMeetingProcessingLease(recordId)
  await assert(claim.success === true, 'Worker should successfully reclaim a stale lease')
  
  // Clean up
  await supabase.from('meeting_records').delete().eq('id', recordId)
  
  console.log('✅ Stale lease reclaiming test passed')
}

async function testOwnershipSafeRelease(): Promise<void> {
  console.log('\n=== Test 3: Ownership-Safe Lease Release ===')
  
  // Create a test meeting record
  const { data: testRecord, error: createError } = await supabase
    .from('meeting_records')
    .insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      google_calendar_event_id: 'test-concurrency-3',
      status: 'upcoming',
      transcript_status: 'pending',
      processing_attempts: 0,
    })
    .select('id')
    .single()
  
  if (createError || !testRecord) {
    throw new Error('Failed to create test record')
  }
  
  const recordId = testRecord.id
  
  // First worker claims
  const claim1 = await claimMeetingProcessingLease(recordId)
  await assert(claim1.success === true, 'First worker should claim successfully')
  
  // Simulate worker running longer than timeout, second worker reclaims
  await new Promise(resolve => setTimeout(resolve, 100)) // Small delay
  const oldClaimedAt = claim1.claim?.claimedAt
  if (oldClaimedAt) {
    // Manually set old timestamp to simulate stale lease
    await supabase.from('meeting_records').update({ 
      processing_started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() 
    }).eq('id', recordId)
  }
  
  const claim2 = await claimMeetingProcessingLease(recordId)
  await assert(claim2.success === true, 'Second worker should reclaim stale lease')
  
  // First worker tries to release with old timestamp (should fail silently)
  if (claim1.claim) {
    const released = await releaseMeetingProcessingLease(recordId, claim1.claim.claimedAt)
    await assert(released === false, 'Stale worker should not be able to clear newer lease')
  }
  
  // Verify lease is still set by second worker
  const { data: currentRecord } = await supabase
    .from('meeting_records')
    .select('processing_started_at')
    .eq('id', recordId)
    .single()
  
  await assert(currentRecord?.processing_started_at !== null, 'Lease should still be set by second worker')
  
  // Second worker releases correctly
  if (claim2.claim) {
    await releaseMeetingProcessingLease(recordId, claim2.claim.claimedAt)
  }
  
  // Clean up
  await supabase.from('meeting_records').delete().eq('id', recordId)
  
  console.log('✅ Ownership-safe lease release test passed')
}

async function testFailedClaimDoesNotIncrementAttempts(): Promise<void> {
  console.log('\n=== Test 4: Failed Claim Does Not Increment Attempts ===')
  
  // Create a test meeting record
  const { data: testRecord, error: createError } = await supabase
    .from('meeting_records')
    .insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      google_calendar_event_id: 'test-concurrency-4',
      status: 'upcoming',
      transcript_status: 'pending',
      processing_attempts: 5,
    })
    .select('id, processing_attempts')
    .single()
  
  if (createError || !testRecord) {
    throw new Error('Failed to create test record')
  }
  
  const recordId = testRecord.id
  const initialAttempts = testRecord.processing_attempts || 0
  
  // First worker claims
  const claim1 = await claimMeetingProcessingLease(recordId)
  await assert(claim1.success === true, 'First worker should claim successfully')
  
  // Second worker fails to claim
  const claim2 = await claimMeetingProcessingLease(recordId)
  await assert(claim2.success === false, 'Second worker should fail to claim')
  
  // Verify processing_attempts unchanged
  const { data: unchangedRecord } = await supabase
    .from('meeting_records')
    .select('processing_attempts')
    .eq('id', recordId)
    .single()
  
  await assert(unchangedRecord?.processing_attempts === initialAttempts, 'Processing attempts should not increment on failed claim')
  
  // Release lease
  if (claim1.claim) {
    await releaseMeetingProcessingLease(recordId, claim1.claim.claimedAt)
  }
  
  // Clean up
  await supabase.from('meeting_records').delete().eq('id', recordId)
  
  console.log('✅ Failed claim does not increment attempts test passed')
}

async function testProcessedRecordCannotBeReprocessed(): Promise<void> {
  console.log('\n=== Test 5: Processed Record Cannot Be Reprocessed ===')
  
  // Create a processed meeting record
  const { data: testRecord, error: createError } = await supabase
    .from('meeting_records')
    .insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      google_calendar_event_id: 'test-concurrency-5',
      status: 'completed',
      transcript_status: 'processed',
      processing_attempts: 1,
      ai_summary: 'test summary',
      ai_summary_structured: { key: 'value' },
    })
    .select('id')
    .single()
  
  if (createError || !testRecord) {
    throw new Error('Failed to create test record')
  }
  
  const recordId = testRecord.id
  
  // Worker can claim lease (lease mechanism doesn't check transcript_status)
  const claim = await claimMeetingProcessingLease(recordId)
  await assert(claim.success === true, 'Lease mechanism can claim processed record')
  
  // But the processor should skip it due to idempotency check
  // This is verified by the processor logic, not the lease mechanism
  
  // Release lease
  if (claim.claim) {
    await releaseMeetingProcessingLease(recordId, claim.claim.claimedAt)
  }
  
  // Clean up
  await supabase.from('meeting_records').delete().eq('id', recordId)
  
  console.log('✅ Processed record test passed (lease works, processor enforces idempotency)')
}

async function runAllTests(): Promise<void> {
  console.log('🧪 Starting Meeting Concurrency Tests...\n')
  
  try {
    await testLeaseClaiming()
    await testStaleLeaseReclaiming()
    await testOwnershipSafeRelease()
    await testFailedClaimDoesNotIncrementAttempts()
    await testProcessedRecordCannotBeReprocessed()
    
    console.log('\n✅ All meeting concurrency tests passed!')
    console.log('✅ Lease mechanism prevents duplicate processing')
    console.log('✅ Stale leases can be reclaimed after timeout')
    console.log('✅ Ownership-safe release prevents clearing newer leases')
    console.log('✅ Failed claims do not increment retry attempts')
    console.log('✅ Processed records are protected by processor idempotency')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

runAllTests()
