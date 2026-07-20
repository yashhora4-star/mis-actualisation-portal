import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/utils/roles';
import { ok, handle } from '@/utils/http';

// Lightweight team roster for the Actualisation Sheet's POC filter. Unlike
// /api/admin/users (superadmin-only, returns admin-sensitive fields like
// email/active-status/role management), any active member can call this -
// it only exposes what's needed to filter "which students does this person
// look after", per the country scoping set on the Team access page: a name
// and the country list (or "sees everything" for the Accounts POC/superadmin).
//
// Uses the service-role client for the actual read so this doesn't depend on
// whatever RLS policy happens to be configured on `users` /
// `user_country_access` in the live project - membership listing here is
// low-sensitivity and meant to be visible to every signed-in, active user.
export async function GET() {
    try {
          const supabase = await getSupabaseServer();
          const user = await requireUser(supabase);
          const profile = await getProfile(supabase, user.id);
          if (!profile?.active) {
                  const e = new Error('Not authorized');
                  e.status = 403;
                  throw e;
          }

      const admin = getSupabaseAdmin();
          const { data: users, error } = await admin
            .from('users')
            .select('id, name, email, role, sees_all_students')
            .eq('active', true)
            .order('name');
          if (error) throw error;

      const { data: accessRows } = await admin.from('user_country_access').select('user_id, country');
          const countriesByUser = {};
          for (const r of accessRows || []) {
                  (countriesByUser[r.user_id] = countriesByUser[r.user_id] || []).push(r.country);
          }

      const team = (users || []).map((u) => ({
              id: u.id,
              name: u.name || u.email,
              sees_all_students: !!u.sees_all_students || u.role === 'superadmin',
              countries: countriesByUser[u.id] || [],
      }));

      return ok({ team });
    } catch (err) {
          return handle(err);
    }
}
