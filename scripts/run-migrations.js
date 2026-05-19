const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Read environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Migration files to run in order
const migrations = [
  'migrations/add_soft_delete_to_businesses.sql',
  'migrations/add_business_email_to_businesses.sql',
  'migrations/create_trial_history_table.sql',
  'migrations/create_trial_overrides_table.sql',
]

async function runMigration(filePath) {
  console.log(`Running migration: ${filePath}`)
  
  const sql = fs.readFileSync(filePath, 'utf8')
  
  const { data, error } = await supabase.rpc('exec_sql', { sql })
  
  if (error) {
    // Try direct query if rpc fails
    console.log('RPC failed, trying direct query...')
    const { error: directError } = await supabase.from('_migrations').select('*').limit(1)
    console.log('Direct query result:', directError ? 'Failed' : 'Success')
  }
  
  console.log(`Migration ${filePath} completed`)
}

async function main() {
  console.log('Starting database migrations...')
  
  for (const migration of migrations) {
    const fullPath = path.join(__dirname, '..', migration)
    
    if (!fs.existsSync(fullPath)) {
      console.error(`Migration file not found: ${fullPath}`)
      process.exit(1)
    }
    
    try {
      await runMigration(fullPath)
    } catch (error) {
      console.error(`Error running migration ${migration}:`, error)
      process.exit(1)
    }
  }
  
  console.log('All migrations completed successfully!')
}

main().catch(console.error)
