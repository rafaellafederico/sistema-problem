import { createClient, SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '[Database] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — database operations will fail'
  )
}

let supabase: SupabaseClient

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
} else {
  // Provide a dummy client that won't throw on import
  supabase = createClient(
    'http://localhost:54321',
    'dummy-key',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default supabase
