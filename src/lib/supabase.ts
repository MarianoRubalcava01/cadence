import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null =
  isConfigured && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

/** Returns the configured client. App gates rendering on isConfigured, so this is safe in views. */
export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}

/** Public URL for a file in the activity-photos storage bucket. */
export function photoPublicUrl(path: string): string {
  return db().storage.from('activity-photos').getPublicUrl(path).data.publicUrl
}
