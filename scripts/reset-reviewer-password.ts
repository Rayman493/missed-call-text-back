import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const tempPassword = process.env.REVIEWER_TEMP_PASSWORD

if (!supabaseUrl || !serviceRoleKey || !tempPassword) {
  console.error('Error: Missing required environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEWER_TEMP_PASSWORD')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const userId = 'c123d0b5-a4cd-4805-ac87-f00aff457fe3'
const email = 'review@replyflowhq.com'

async function resetPassword() {
  try {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: tempPassword,
    })

    if (error) {
      console.error('Error: Password reset failed')
      console.error('User ID:', userId)
      console.error('Email:', email)
      console.error('Error code:', error.status)
      console.error('Error message:', error.message)
      process.exit(1)
    }

    console.log('Success: Password reset completed')
    console.log('User ID:', userId)
    console.log('Email:', email)
    process.exit(0)
  } catch (error: any) {
    console.error('Error: Unexpected error during password reset')
    console.error('User ID:', userId)
    console.error('Email:', email)
    console.error('Error:', error.message)
    process.exit(1)
  }
}

resetPassword()