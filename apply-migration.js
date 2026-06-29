const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('[MIGRATION] Starting migration for payment_requests.token column');
  
  try {
    // Check if token column exists
    console.log('[MIGRATION] Checking if token column exists...');
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_columns', { table_name: 'payment_requests' });
    
    const tokenExists = columns && columns.some(col => col.column_name === 'token');
    console.log('[MIGRATION] Token column exists:', tokenExists);
    
    if (tokenExists) {
      console.log('[MIGRATION] Token column already exists, skipping migration');
      return { success: true, tokenExisted: true };
    }
    
    // Apply migration SQL
    console.log('[MIGRATION] Applying migration to add token column...');
    
    const migrationSQL = `
      -- Add token column with unique constraint (idempotent)
      ALTER TABLE payment_requests
      ADD COLUMN IF NOT EXISTS token TEXT;

      -- Add unique index for fast token lookups (idempotent)
      CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_token_unique 
      ON payment_requests(token) 
      WHERE token IS NOT NULL;

      -- Generate tokens for existing payment requests (idempotent)
      UPDATE payment_requests
      SET token = encode(gen_random_bytes(16), 'hex')
      WHERE token IS NULL;

      -- Set NOT NULL constraint after backfilling (idempotent)
      ALTER TABLE payment_requests
      ALTER COLUMN token SET NOT NULL;

      -- Comment for documentation
      COMMENT ON COLUMN payment_requests.token IS 'Secure random token for branded payment links (ReplyFlow URL)';
    `;
    
    // Execute migration using SQL editor
    const { error: migrationError } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (migrationError) {
      console.error('[MIGRATION] Migration failed:', migrationError);
      return { success: false, error: migrationError };
    }
    
    console.log('[MIGRATION] Migration applied successfully');
    return { success: true, tokenExisted: false };
    
  } catch (error) {
    console.error('[MIGRATION] Migration error:', error);
    return { success: false, error: error.message };
  }
}

applyMigration().then(result => {
  console.log('[MIGRATION] Result:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
});
