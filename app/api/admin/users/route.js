import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

async function requireSuperadmin(supabase) {
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    if (profile?.role !== 'superadmin') {
          const e = new Error('Superadmin only');
          e.status = 403;
          throw e;
    }
    return { user, profile };
}

export async function GET() {
    try {
          const supabase = await getSupabaseServer();
          await requireSuperadmin(supabase);
          const { data, error } = await supabase
            .from('users')
            .select('id, email, name, role, active, sees_all_students, created_at')
            .order('created_at');
          if (error) throw error;

      const { data: accessRows } = await supabase.from('user_country_access').select('user_id, country');
          const countriesByUser = {};
          for (const r of accessRows || []) {
                  (countriesByUser[r.user_id] = countriesByUser[r.user_id] || []).push(r.country);
          }
          const users = (data || []).map((u) => ({ ...u, countries: countriesByUser[u.id] || [] }));

      return ok({ users });
    } catch (err) {
          return handle(err);
    }
}

// POST { email, name } - invites a new member (always role='member'; promote
// to superadmin manually in Supabase if ever needed - kept out of the UI on purpose)
export async function POST(request) {
    try {
          const supabase = await getSupabaseServer();
          const { user } = await requireSuperadmin(supabase);
          const { email, name } = await request.json();
          if (!email) return handle({ message: 'email is required', status: 400 });

      const admin = getSupabaseAdmin();
          const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
          if (inviteErr) throw inviteErr;

      const { data: profile, error: profileErr } = await admin
            .from('users')
            .upsert({ id: invited.user.id, email, name: name || null, role: 'member', active: true }, { onConflict: 'id' })
            .select()
            .single();
          if (profileErr) throw profileErr;

      await logActivity(admin, {
              entityType: 'user', entityId: profile.id, action: 'created',
              performedBy: user.id, details: { email, role: 'member' },
      });

      return ok({ user: profile });
    } catch (err) {
          return handle(err);
    }
}

// PATCH { id, active?, sees_all_students?, countries? } - manage a member's
// active status, whether they're the Accounts POC who sees every student,
// and (for country POCs) which countries' students they're scoped to.
export async function PATCH(request) {
    try {
          const supabase = await getSupabaseServer();
          const { user } = await requireSuperadmin(supabase);
          const { id, active, sees_all_students, countries } = await request.json();
          if (!id) return handle({ message: 'id is required', status: 400 });

      const admin = getSupabaseAdmin();

      const patch = {};
          if (active !== undefined) patch.active = active;
          if (sees_all_students !== undefined) patch.sees_all_students = sees_all_students;

      let data = null;
          if (Object.keys(patch).length) {
                  const res = await admin.from('users').update(patch).eq('id', id).select().single();
                  if (res.error) throw res.error;
                  data = res.data;
          }

      if (Array.isArray(countries)) {
                  const { error: delErr } = await admin.from('user_country_access').delete().eq('user_id', id);
                  if (delErr) throw delErr;
                  if (countries.length) {
                            const { error: insErr } = await admin
                              .from('user_country_access')
                              .insert(countries.map((country) => ({ user_id: id, country })));
                            if (insErr) throw insErr;
                  }
          }

      if (!data) {
                  const res = await admin.from('users').select().eq('id', id).single();
                  data = res.data;
          }

      await logActivity(admin, {
              entityType: 'user', entityId: id,
              action: active !== undefined ? (active ? 'reactivated' : 'deactivated') : 'edited',
              performedBy: user.id, details: { active, sees_all_students, countries },
      });

      return ok({ user: data });
    } catch (err) {
          return handle(err);
    }
}
