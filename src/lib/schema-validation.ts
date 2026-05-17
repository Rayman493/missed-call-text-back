/**
 * Schema Validation Utility
 * Validates that critical database columns exist to prevent PGRST204 errors
 */

import { createClient } from '@supabase/supabase-js'

interface ColumnValidationResult {
  tableName: string
  columnName: string
  exists: boolean
  error?: string
}

interface SchemaValidationReport {
  timestamp: string
  criticalColumns: ColumnValidationResult[]
  allValid: boolean
}

// Use service role key for schema validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

/**
 * Validate critical columns that must exist for the application to function correctly
 */
export async function validateCriticalSchema(): Promise<SchemaValidationReport> {
  const timestamp = new Date().toISOString()
  console.log('[SCHEMA VALIDATION] Starting schema validation...')
  
  if (!supabase) {
    console.error('[SCHEMA VALIDATION] Supabase client not configured')
    return {
      timestamp,
      criticalColumns: [],
      allValid: false
    }
  }

  const criticalColumns = [
    { table: 'businesses', column: 'forwarding_verified' },
    { table: 'businesses', column: 'forwarding_verified_at' },
    { table: 'follow_up_jobs', column: 'step' },
    { table: 'follow_up_jobs', column: 'idempotency_key' },
  ]

  const results: ColumnValidationResult[] = []

  for (const { table, column } of criticalColumns) {
    const fallbackError = await checkColumnFallback(table, column)
    results.push({
      tableName: table,
      columnName: column,
      exists: !fallbackError,
      error: fallbackError ? `Column does not exist: ${fallbackError}` : undefined
    })
  }

  const allValid = results.every(r => r.exists)

  if (allValid) {
    console.log('[SCHEMA VALIDATION] ✓ All critical columns exist')
  } else {
    console.error('[SCHEMA VALIDATION] ✗ Missing critical columns:')
    results.forEach(r => {
      if (!r.exists) {
        console.error(`  - ${r.tableName}.${r.columnName}: ${r.error || 'Missing'}`)
      }
    })
  }

  return {
    timestamp,
    criticalColumns: results,
    allValid
  }
}

/**
 * Fallback method to check if column exists by attempting a query
 */
async function checkColumnFallback(table: string, column: string): Promise<string | null> {
  try {
    const { error } = await supabase!
      .from(table as any)
      .select(column as any)
      .limit(1)
    
    // If we get a PGRST204 error, the column doesn't exist
    if (error && error.message?.includes('PGRST204')) {
      return error.message
    }
    
    return null
  } catch (error: any) {
    if (error.message?.includes('PGRST204')) {
      return error.message
    }
    return null
  }
}

/**
 * Log schema validation report on application startup
 */
export async function logSchemaValidationOnStartup() {
  try {
    const report = await validateCriticalSchema()
    
    if (!report.allValid) {
      console.error('[SCHEMA VALIDATION] CRITICAL: Missing columns detected. Run migrations to fix.')
      console.error('[SCHEMA VALIDATION] Report:', JSON.stringify(report, null, 2))
    }
  } catch (error) {
    console.error('[SCHEMA VALIDATION] Failed to validate schema:', error)
  }
}
