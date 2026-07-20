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
      .select('id, email, name, role, active, sees_all_students, is_mis_poc, created_at')
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

// POST { email, name, password } - creates a new member directly, with the
// password the superadmin just chose (share it with them out of band - Slack,
// WhatsApp, in person). Always role='member'; promote to superadmin manually
// in Supabase if ever needed - kept out of the UI on purpose.
//
// Deliberately NOT using Supabase's inviteUserByEmail here - that depends on
// Supabase's own email sending (rate-limited, and blocked entirely until a
// verified sending domain is set up). Creating the account with a password
// already set means a new member can sign in immediately, with zero
// dependency on any email ever arriving.
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireSuperadmin(supabase);
    const { email, name, password } = await request.json();
    if (!email) return handle({ message: 'email is required', status: 400 });
    if (!password || password.length < 8) {
      return handle({ message: 'A temporary password (min 8 characters) is required - you\'ll share it with them directly.', status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr) throw createErr;

    const { data: profile, error: profileErr } = await admin
      .from('users')
      .upsert({ id: created.user.id, email, name: name || null, role: 'member', active: true }, { onConflict: 'id' })
      .select()
      .single();
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id); // rollback the auth user
      throw profileErr;
    }

    await logActivity(admin, {
      entityType: 'user', entityId: profile.id, action: 'created',
      performedBy: user.id, details: { email, role: 'member' },
    });

    return ok({ user: profile });
  } catch (err) {
    return handle(err);
  }
}

// PATCH { id, active?, sees_all_students?, is_mis_poc?, countries?, password? }
// - manage a member's active status, whether they're the Accounts POC who
// sees every student, whether they're an MIS POC who can add/edit students
// and record payments, (for country POCs) which countries' students they're
// scoped to, and/or set a brand-new password directly (no email sent -
// share the new password with them yourself).
export async function PATCH(request) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireSuperadmin(supabase);
    const { id, active, sees_all_students, is_mis_poc, countries, password } = await request.json();
    if (!id) return handle({ message: 'id is required', status: 400 });

    const admin = getSupabaseAdmin();

    if (password !== undefined) {
      if (!password || password.length < 8) {
        return handle({ message: 'Password must be at least 8 characters', status: 400 });
      }
      const { error: pwErr } = await admin.auth.admin.updateUserById(id, { password });
      if (pwErr) throw pwErr;
      await logActivity(admin, {
        entityType: 'user', entityId: id, action: 'password_reset',
        performedBy: user.id, details: {},
      });
    }

    const patch = {};
    if (active !== undefined) patch.active = active;
    if (sees_all_students !== undefined) patch.sees_all_students = sees_all_students;
    if (is_mis_poc !== undefined) patch.is_mis_poc = is_mis_poc;

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

    if (active !== undefined || sees_all_students !== undefined || is_mis_poc !== undefined || Array.isArray(countries)) {
      await logActivity(admin, {
        entityType: 'user', entityId: id,
        action: active !== undefined ? (active ? 'reactivated' : 'deactivated') : 'edited',
        performedBy: user.id, details: { active, sees_all_students, is_mis_poc, countries },
      });
    }

    return ok({ user: data });
  } catch (err) {
    return handle(err);
  }
}

// DELETE { id } - permanently removes a member: their country-access rows,
// their profile row, and their Supabase Auth account. Superadmin only.
// Can't delete yourself or another superadmin through this route - guardrails
// against locking everyone out or nuking the wrong account by mistake.
export async function DELETE(request) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireSuperadmin(supabase);
    const { id } = await request.json();
    if (!id) return handle({ message: 'id is required', status: 400 });
    if (id === user.id) return handle({ message: "You can't delete your own account", status: 400 });

    const admin = getSupabaseAdmin();

    const { data: target } = await admin.from('users').select('email, role').eq('id', id).single();
    if (target?.role === 'superadmin') {
      return handle({ message: "Can't delete a superadmin", status: 400 });
    }

    await admin.from('user_country_access').delete().eq('user_id', id);
    await admin.from('users').delete().eq('id', id);

    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr) throw authErr;

    await logActivity(admin, {
      entityType: 'user', entityId: id, action: 'deleted',
      performedBy: user.id, details: { email: target?.email },
    });

    return ok({ deleted: true });
  } catch (err) {
    return handle(err);
  }
}
