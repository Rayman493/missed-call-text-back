/**
 * One-time repair script to backfill incorrect current_period_end values from Stripe
 * 
 * This script addresses a production data inconsistency where subscription_status was updated
 * but current_period_end was not updated during trial conversions.
 * 
 * Usage:
 *   npx tsx scripts/repair-subscription-period-end.ts
 *   npx tsx scripts/repair-subscription-period-end.ts --dry-run
 * 
 * The script will:
 * 1. Find all active subscriptions with stale current_period_end (older than 30 days)
 * 2. Fetch the current subscription data from Stripe
 * 3. Update the database with the correct current_period_end from Stripe (only if different)
 * 4. Log all changes for audit purposes
 * 
 * Safety features:
 * - Dry-run mode to preview changes without applying them
 * - Update-only-when-different behavior
 * - Idempotency (safe to rerun)
 * - Detailed logging of old/new values
 * - Scanned/updated/skipped/failed totals
 */

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const stripeSecretKey = process.env.STRIPE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
  console.error('Missing required environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const stripe = new Stripe(stripeSecretKey)

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run') || args.includes('-d')

if (dryRun) {
  console.log('=== DRY RUN MODE - No changes will be applied ===\n')
}

interface Business {
  id: string
  stripe_subscription_id: string
  subscription_status: string
  current_period_end: string | null
  trial_ends_at: string | null
}

async function main() {
  console.log('=== Subscription Period End Repair Script ===')
  console.log('Starting repair process...\n')

  // Find all businesses with active subscriptions
  const { data: businesses, error: fetchError } = await supabase
    .from('businesses')
    .select('id, stripe_subscription_id, subscription_status, current_period_end, trial_ends_at')
    .in('subscription_status', ['active', 'trialing'])
    .not('stripe_subscription_id', 'is', null)
    .order('current_period_end', { ascending: true, nullsFirst: false })

  if (fetchError) {
    console.error('Error fetching businesses:', fetchError)
    process.exit(1)
  }

  if (!businesses || businesses.length === 0) {
    console.log('No active subscriptions found')
    return
  }

  console.log(`Found ${businesses.length} active subscriptions\n`)

  // Check each business for stale current_period_end
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const staleBusinesses: Business[] = []

  for (const business of businesses) {
    if (!business.current_period_end) {
      console.log(`Business ${business.id}: current_period_end is NULL - will repair`)
      staleBusinesses.push(business)
      continue
    }

    const periodEndDate = new Date(business.current_period_end)
    if (periodEndDate < thirtyDaysAgo) {
      console.log(`Business ${business.id}: current_period_end is stale (${business.current_period_end}) - will repair`)
      staleBusinesses.push(business)
    }
  }

  if (staleBusinesses.length === 0) {
    console.log('No stale current_period_end values found')
    return
  }

  console.log(`\nFound ${staleBusinesses.length} businesses with stale current_period_end\n`)
  console.log('=== Starting Repairs ===\n')

  let scanned = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const business of staleBusinesses) {
    scanned++
    try {
      console.log(`Processing business ${business.id}...`)
      console.log(`  Subscription ID: ${business.stripe_subscription_id}`)
      console.log(`  Current current_period_end: ${business.current_period_end}`)

      // Fetch subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id)
      
      const stripePeriodEnd = (subscription as any).current_period_end
      const stripeTrialEnd = (subscription as any).trial_end

      const newPeriodEnd = stripePeriodEnd
        ? new Date(stripePeriodEnd * 1000).toISOString()
        : null

      const newTrialEnd = stripeTrialEnd
        ? new Date(stripeTrialEnd * 1000).toISOString()
        : null

      console.log(`  Stripe current_period_end: ${newPeriodEnd}`)
      console.log(`  Stripe trial_end: ${newTrialEnd}`)

      if (!newPeriodEnd) {
        console.log(`  WARNING: Stripe subscription has no current_period_end, skipping`)
        skipped++
        continue
      }

      // Update-only-when-different check
      if (business.current_period_end === newPeriodEnd) {
        console.log(`  SKIPPED: current_period_end already matches Stripe value`)
        skipped++
        continue
      }

      console.log(`  OLD: ${business.current_period_end}`)
      console.log(`  NEW: ${newPeriodEnd}`)

      if (dryRun) {
        console.log(`  [DRY RUN] Would update current_period_end`)
        updated++
        continue
      }

      // Update database
      const updatePayload: any = {
        current_period_end: newPeriodEnd,
      }

      if (newTrialEnd) {
        updatePayload.trial_ends_at = newTrialEnd
      }

      const { error: updateError } = await supabase
        .from('businesses')
        .update(updatePayload)
        .eq('id', business.id)

      if (updateError) {
        console.error(`  ERROR: Failed to update business: ${updateError.message}`)
        failed++
      } else {
        console.log(`  ✓ Successfully updated current_period_end`)
        updated++
      }

    } catch (error) {
      console.error(`  ERROR: Failed to process business ${business.id}:`, error)
      failed++
    }

    console.log('')
  }

  console.log('=== Repair Summary ===')
  console.log(`Total scanned: ${scanned}`)
  console.log(`Updated: ${updated}${dryRun ? ' (dry run)' : ''}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed: ${failed}`)
  console.log('\nRepair script completed')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
