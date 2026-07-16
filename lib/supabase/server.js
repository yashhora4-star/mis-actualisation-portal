import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Server Supabase client bound to the calling user's session. RLS enforced. */
export async function getSupabaseServer() {
    const cookieStore = await cookies();
    return createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
              cookies: {
                        getAll() { return cookieStore.getAll(); },
                        setAll(cookiesToSet) {
                                    try {
                                                  cookiesToSet.forEach(({ name, value, options }) =>
                                                                  cookieStore.set(name, value, options)
                                                                                   );
                                    } catch { /* called from a Server Component - middleware refreshes sessions */ }
                        },
              },
      }
        );
}

/** Returns the signed-in user or throws a 401-shaped error. */
export async function requireUser(supabase) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
          const e = new Error('Not signed in');
          e.status = 401;
          throw e;
    }
    return user;
}
