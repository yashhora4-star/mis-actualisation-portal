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
            .select('id, email, name, role, active, created_at')
            .order('created_at');
          if (error) throw error;
          return ok({ users: data });
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

// PATCH { id, active } - deactivate/reactivate a member (superadmin only)
export async function PATCH(request) {
    try {
          const supabase = await getSupabaseServer();
          const { user } = await requireSuperadmin(supabase);
          const { id, active } = await request.json();
          if (!id || active === undefined) return handle({ message: 'id and active are required', status: 400 });

      const admin = getSupabaseAdmin();
          const { data, error } = await admin
            .from('users')
            .update({ active })
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;

      await logActivity(admin, {
              entityType: 'user', entityId: id, action: active ? 'reactivated' : 'deactivated',
              performedBy: user.id,
      });

      return ok({ user: data });
    } catch (err) {
          return handle(err);
    }
}
