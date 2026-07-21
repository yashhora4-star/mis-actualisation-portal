import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, getAccessScope, isAllowedPackage } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

// GET ?student_id=...&month=... -> full checklist for that student/month,
// merging the reference_services catalog with whatever's already ticked.
export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');
    const month = searchParams.get('month');
    if (!studentId || !month) return handle({ message: 'student_id and month are required', status: 400 });

    const profile = await getProfile(supabase, user.id);
    const scope = await getAccessScope(supabase, profile);
    if (!scope.allPackages) {
      const { data: studentRow } = await supabase.from('students').select('package').eq('id', studentId).maybeSingle();
      if (!isAllowedPackage(scope, studentRow?.package)) {
        return handle({ message: 'Not authorized for this student', status: 403 });
      }
    }

    const { data: misRecord } = await supabase
      .from('mis_records')
      .select('reference_package_key')
      .eq('student_id', studentId)
      .eq('month', month)
      .maybeSingle();

    const packageKey = misRecord?.reference_package_key;
    let refServices = [];
    if (packageKey) {
      const { data, error } = await supabase
        .from('reference_services')
        .select('*')
        .eq('package_key', packageKey)
        .order('sort_order');
      if (error) throw error;
      refServices = data;
    }

    const { data: ticks, error: tickErr } = await supabase
      .from('student_services')
      .select('*')
      .eq('student_id', studentId)
      .eq('month', month);
    if (tickErr) throw tickErr;
    const tickByRefId = Object.fromEntries((ticks || []).map((t) => [t.reference_service_id, t]));

    const checklist = refServices.map((svc) => {
      const tick = tickByRefId[svc.id];
      return {
        id: tick?.id || null,
        reference_service_id: svc.id,
        service_name: svc.service_name,
        cost_type: svc.cost_type,
        // Some services (VAS Accommodation, for one) don't have one fixed
        // cost across every student - the real cost varies per booking, so
        // there's nothing sensible to seed in the reference_services catalog
        // for them. A manually-entered per-student cost saved on this
        // student's own tick row takes priority over the catalog default;
        // only fall back to the catalog value when nothing's been entered yet.
        reference_cost_inr: tick?.reference_cost_inr ?? svc.reference_cost_inr,
        // Raw catalog value, unmerged with any per-student override - lets the
        // UI tell "this fixed service has no seeded catalog cost at all" (show
        // an editable input) apart from "a value has already been entered"
        // (still show the input, but not because reference_cost_inr is null).
        catalog_reference_cost_inr: svc.reference_cost_inr,
        notes: svc.notes,
        is_selected: tick?.is_selected || false,
        actual_cost_inr: tick?.actual_cost_inr ?? null,
        service_date: tick?.service_date || null,
        locked: tick?.locked || false,
        selected_by: tick?.selected_by || null,
        selected_at: tick?.selected_at || null,
        utr: tick?.utr || null,
        proof_file_url: tick?.proof_file_url || null,
        proof_file_name: tick?.proof_file_name || null,
        proof_uploaded_at: tick?.proof_uploaded_at || null,
        payment_mode: tick?.payment_mode || null,
        card_owner: tick?.card_owner || null,
      };
    });

    return ok({ package_key: packageKey, checklist });
  } catch (err) {
    return handle(err);
  }
}

// POST { student_id, month, reference_service_id, is_selected, service_date, actual_cost_inr?, reference_cost_inr? }
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    if (!profile?.active) return handle({ message: 'Account not active', status: 403 });

    const body = await request.json();
    const { student_id, month, reference_service_id, is_selected, service_date, actual_cost_inr, reference_cost_inr, skip_lock } = body;
    if (!student_id || !month || !reference_service_id) {
      return handle({ message: 'student_id, month, reference_service_id are required', status: 400 });
    }

    const scope = await getAccessScope(supabase, profile);
    if (!scope.allPackages) {
      const { data: studentRow } = await supabase.from('students').select('package').eq('id', student_id).maybeSingle();
      if (!isAllowedPackage(scope, studentRow?.package)) {
        return handle({ message: 'Not authorized for this student', status: 403 });
      }
    }

    const admin = getSupabaseAdmin();
    const isSuperadmin = profile.role === 'superadmin';

    const { data: existing } = await admin
      .from('student_services')
      .select('*')
      .eq('student_id', student_id)
      .eq('month', month)
      .eq('reference_service_id', reference_service_id)
      .maybeSingle();

    if (existing?.locked && !isSuperadmin) {
      return handle({ message: 'This entry is locked - ask the superadmin to change it', status: 403 });
    }

    const { data: refService } = await admin
      .from('reference_services')
      .select('reference_cost_inr')
      .eq('id', reference_service_id)
      .single();

    // A caller-supplied reference_cost_inr is a manual per-student entry
    // (e.g. VAS Accommodation, where the catalog has no single fixed cost
    // for everyone) - it wins over the catalog value. Only fall back to the
    // catalog's reference_cost_inr when the caller didn't send one at all,
    // which keeps existing tick/date-only saves behaving exactly as before.
    const resolvedReferenceCost = reference_cost_inr !== undefined
      ? reference_cost_inr
      : (refService?.reference_cost_inr ?? null);

    // A plain cost-estimate save (skip_lock) shouldn't lock a service that
    // hasn't actually been ticked yet - locking on every save is right for a
    // real tick/untick action (forces a superadmin to touch it again), but
    // would otherwise trap a member's own not-yet-selected row behind a
    // superadmin unlock just for typing in an expected cost.
    const resolvedLocked = skip_lock ? (existing?.locked || false) : true;

    const row = {
      student_id,
      month,
      reference_service_id,
      is_selected: !!is_selected,
      reference_cost_inr: resolvedReferenceCost,
      actual_cost_inr: actual_cost_inr ?? null,
      service_date: service_date || null,
      locked: resolvedLocked,
      selected_by: existing?.selected_by || user.id,
      selected_at: existing?.selected_at || new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await admin
      .from('student_services')
      .upsert(row, { onConflict: 'student_id,month,reference_service_id' })
      .select()
      .single();
    if (error) throw error;

    const action = existing ? (isSuperadmin ? 'overridden' : 'updated') : (is_selected ? 'ticked' : 'unticked');
    const details = { student_id, month, reference_service_id, is_selected, service_date, reference_cost_inr: resolvedReferenceCost };

    await logActivity(admin, {
      entityType: 'student_service',
      entityId: saved.id,
      action,
      performedBy: user.id,
      details,
    });

    // Also log against the student's MIS record for this month, so a tick
    // made from the service checklist (by anyone, member or superadmin)
    // shows up in that row's own Activity History, not just the per-service one.
    const { data: misRow } = await admin
      .from('mis_records')
      .select('id')
      .eq('student_id', student_id)
      .eq('month', month)
      .maybeSingle();
    if (misRow?.id) {
      await logActivity(admin, {
        entityType: 'mis_record',
        entityId: misRow.id,
        action,
        performedBy: user.id,
        details,
      });
    }

    return ok({ tick: saved });
  } catch (err) {
    return handle(err);
  }
}

// PATCH { id, locked } - superadmin-only unlock/relock without changing the tick itself
export async function PATCH(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    if (profile?.role !== 'superadmin') return handle({ message: 'Superadmin only', status: 403 });

    const { id, locked } = await request.json();
    if (!id || locked === undefined) return handle({ message: 'id and locked are required', status: 400 });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('student_services')
      .update({ locked, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    await logActivity(admin, {
      entityType: 'student_service', entityId: id,
      action: locked ? 'locked' : 'overridden',
      performedBy: user.id, details: { locked },
    });

    return ok({ tick: data });
  } catch (err) {
    return handle(err);
  }
}
