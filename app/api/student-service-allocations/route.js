import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, getAccessScope, isAllowedPackage } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

// Which catalog services a given student's package actually includes - not
// every "fixed" service in reference_services gets given to every student on
// that package (a coach may skip one, or it depends on the student's own
// situation), so Servicing Total/Balance and the Closed check need to know
// which ones actually apply to THIS student, distinct from
// student_services.is_selected (which tracks whether an allocated service has
// actually been given/paid yet). No row here at all means "nobody has set an
// allocation for this student yet" - callers fall back to the full catalog,
// exactly today's behavior, until someone actively picks services for them.

// GET ?student_id=... -> reference_service_ids currently allocated.
export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    await requireUser(supabase);
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');
    if (!studentId) return handle({ message: 'student_id is required', status: 400 });

    const { data, error } = await supabase
      .from('student_service_allocations')
      .select('reference_service_id')
      .eq('student_id', studentId);
    if (error) throw error;

    return ok({ reference_service_ids: (data || []).map((r) => r.reference_service_id) });
  } catch (err) {
    return handle(err);
  }
}

// POST { student_id, reference_service_ids: [] } -> replace this student's
// full allocation with the given set. Full replace rather than a diff - the
// picker always sends its complete current selection, so this is simplest
// and always correct.
//
// Safety rule: any service that's already ticked as given (student_services
// row with is_selected = true, any month) is kept allocated no matter what -
// a coach or MIS teammate un-checking it here (by mistake, or because a bulk
// sheet just didn't list it) must never make an already-paid service vanish
// from the checklist and silently drop its cost out of the servicing total.
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    if (!profile?.active) return handle({ message: 'Account not active', status: 403 });

    const body = await request.json();
    const { student_id, reference_service_ids } = body;
    if (!student_id || !Array.isArray(reference_service_ids)) {
      return handle({ message: 'student_id and reference_service_ids[] are required', status: 400 });
    }

    const scope = await getAccessScope(supabase, profile);
    if (!scope.allPackages) {
      const { data: studentRow } = await supabase.from('students').select('package').eq('id', student_id).maybeSingle();
      if (!isAllowedPackage(scope, studentRow?.package)) {
        return handle({ message: 'Not authorized for this student', status: 403 });
      }
    }

    const admin = getSupabaseAdmin();

    const { data: givenRows, error: givenErr } = await admin
      .from('student_services')
      .select('reference_service_id')
      .eq('student_id', student_id)
      .eq('is_selected', true);
    if (givenErr) throw givenErr;

    const finalIds = new Set(reference_service_ids);
    for (const r of givenRows || []) {
      if (r.reference_service_id) finalIds.add(r.reference_service_id);
    }
    const finalIdList = [...finalIds];

    const { error: delErr } = await admin.from('student_service_allocations').delete().eq('student_id', student_id);
    if (delErr) throw delErr;

    if (finalIdList.length) {
      const rows = finalIdList.map((id) => ({ student_id, reference_service_id: id, allocated_by: user.id }));
      const { error: insErr } = await admin.from('student_service_allocations').insert(rows);
      if (insErr) throw insErr;
    }

    await logActivity(admin, {
      entityType: 'student', entityId: student_id, action: 'services_allocated',
      performedBy: user.id, details: { reference_service_ids: finalIdList, requested: reference_service_ids },
    });

    return ok({ reference_service_ids: finalIdList });
  } catch (err) {
    return handle(err);
  }
}
