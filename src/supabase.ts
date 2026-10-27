import { createClient } from '@supabase/supabase-js';
// These are public client credentials. Authorization is enforced by database RLS.
const demo = new URLSearchParams(location.search).get('demo') === '1';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'https://dpjhusoezovklfbzxfrc.supabase.co', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_YVigFCKEDGlJjrfGiGwRPw_gj2ZB7B0', {auth:{persistSession:!demo,autoRefreshToken:!demo,detectSessionInUrl:!demo}});
