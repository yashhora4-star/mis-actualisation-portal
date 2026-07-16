'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client - anon key only, used for auth (sign-in/out).
 * All table reads and writes go through Next.js API routes, never direct from browser.
 */
let client;
export function getSupabaseBrowser() {
    if (!client) {
          client = createBrowserClient(
                  process.env.NEXT_PUBLIC_SUPABASE_URL,
                  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                );
    }
    return client;
}
