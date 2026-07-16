import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. SERVER ONLY. Bypasses RLS.
 * Used inside upload / sheet-sync routes after an explicit superadmin role check.
 */
export function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
          throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set - add it as a Cloudflare secret');
    }
    return createClient(url, key, {
          auth: { autoRefreshToken: false, persistSession: false },
    });
}
