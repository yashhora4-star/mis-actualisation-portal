import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE, getAccessScope, isAllowedCountry } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';
import { resolvePackageKey } from '@/lib/reference-services';

export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    const scope = await getAccessScope(supabase, profile);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    let misQuery = supabase
      .from('mis_records')
      .select('id, month, product_tag, reference_package_key, total_sale_amount, collected, outstanding, outstanding_updated_at, net_amount_after_deduction, total_amount_received, subvention, gst, total_margin_incl_gst, total_margin_excl_gst, total_margin_excl_subvention_gst, students ( id, stp_code, student_name, email, country, package, created_at )')
      .order('month', { ascending: false });
    if (month) misQuery = misQuery.eq('month', month);

    const { data: misRowsRaw, error: misErr } = await misQuery;
    if (misErr) throw misErr;

    // POC members are scoped to the countries assigned to them in Team access
    // (superadmin and the Accounts POC see everyone) - filtered here so every
    // downstream calculation (stats, totals) only reflects what they can see.
    const misRows = scope.allCountries
      ? misRowsRaw
      : misRowsRaw.filter((r) => isAllowedCountry(scope, r.students?.country));

    const studentIds = misRows.map((r) => r.students?.id).filter(Boolean);
    const misRecordIds = misRows.map((r) => r.id).filter(Boolean);

    let pnlRows = [];
    if (studentIds.length) {
      let pnlQuery = supabase
        .from('pnl_records')
        .select('student_id, month, margin, margin_pct, total_cash_in_bank')
        .in('student_id', studentIds);
      if (month) pnlQuery = pnlQuery.eq('month', month);
      const { data, error: pnlErr } = await pnlQuery;
      if (pnlErr) throw pnlErr;
      pnlRows = data || [];
    }

    const pnlByStudentMonth = {};
    for (const p of pnlRows || []) pnlByStudentMonth[p.student_id + '|' + p.month] = p;

    let svcRows = [];
    if (studentIds.length) {
      let svcQuery = supabase
        .from('student_services')
        .select('student_id, month, is_selected, reference_cost_inr, actual_cost_inr, service_date')
        .in('student_id', studentIds);
      if (month) svcQuery = svcQuery.eq('month', month);
      const { data } = await svcQuery;
      svcRows = data || [];
    }

    const svcByStudentMonth = {};
    for (const s of svcRows || []) {
      if (!s.is_selected) continue;
      const key = s.student_id + '|' + s.month;
      if (!svcByStudentMonth[key]) svcByStudentMonth[key] = { total: 0, lastDate: null, tickedCount: 0 };
      svcByStudentMonth[key].total += Number(s.actual_cost_inr ?? s.reference_cost_inr ?? 0);
      svcByStudentMonth[key].tickedCount += 1;
      if (s.service_date && (!svcByStudentMonth[key].lastDate || s.service_date > svcByStudentMonth[key].lastDate)) {
        svcByStudentMonth[key].lastDate = s.service_date;
      }
    }

    // Total amount that can be used per student for servicing - the sum of
    // reference_services costs defined for their package - so we can show
    // what's still left to use (balance) and flag the record "Closed" once
    // every billable service on the checklist has been ticked.
    const packageKeys = [...new Set(misRows.map((r) => r.reference_package_key).filter(Boolean))];
    // Only "fixed" cost_type services count toward the servicing total and
    // the Closed/In-progress threshold - "variable" ones are the student's own
    // actual spend (no fixed reference cost, never ticked by the accounts team)
    // and "in_house" ones are free, so counting them made every record look
    // permanently "In progress" even once every billable item was ticked.
    let refSvcRows = [];
    if (packageKeys.length) {
      const { data } = await supabase
        .from('reference_services')
        .select('package_key, reference_cost_inr')
        .eq('cost_type', 'fixed')
        .in('package_key', packageKeys);
      refSvcRows = data || [];
    }
    const refByPkg = {};
    for (const s of refSvcRows || []) {
      if (!refByPkg[s.package_key]) refByPkg[s.package_key] = { count: 0, total: 0 };
      refByPkg[s.package_key].count += 1;
      refByPkg[s.package_key].total += Number(s.reference_cost_inr || 0);
    }

    // Last date any collection landed against this MIS record - pulled from
    // the individual payment lines parsed off the MIS sheet, not just the
    // single "collected" total, so a payment against an outstanding balance
    // shows a date the same way the first collection does.
    let payRows = [];
    if (misRecordIds.length) {
      const { data } = await supabase
        .from('mis_payment_lines')
        .select('mis_record_id, pay_date')
        .in('mis_record_id', misRecordIds)
        .not('pay_date', 'is', null);
      payRows = data || [];
    }
    const lastPayByMis = {};
    for (const p of payRows || []) {
      if (!lastPayByMis[p.mis_record_id] || p.pay_date > lastPayByMis[p.mis_record_id]) {
        lastPayByMis[p.mis_record_id] = p.pay_date;
      }
    }

    // Card-owner spend per student (Tanisha Kalra / Manish Singh etc, keyed
    // by card_holder + which bank's card it was), from the card statements
    // already uploaded and matched to a student.
    let cardRows = [];
    if (studentIds.length) {
      const { data } = await supabase
        .from('card_transactions')
        .select('student_id, card_holder, source_bank, amount')
        .in('student_id', studentIds);
      cardRows = data || [];
    }
    const cardByStudent = {};
    for (const c of cardRows || []) {
      if (!c.student_id) continue;
      if (!cardByStudent[c.student_id]) cardByStudent[c.student_id] = {};
      const ownerKey = `${c.card_holder || 'Unknown'} (${c.source_bank || '-'})`;
      cardByStudent[c.student_id][ownerKey] = (cardByStudent[c.student_id][ownerKey] || 0) + Number(c.amount || 0);
    }

    const rows = misRows.map((r) => {
      const key = (r.students?.id) + '|' + r.month;
      const svc = svcByStudentMonth[key];
      const actualisedCost = svc?.total ?? 0;
      const actualisedMarginPct = r.total_sale_amount
        ? ((r.total_sale_amount - actualisedCost) / r.total_sale_amount) * 100
        : null;
      const pkgInfo = refByPkg[r.reference_package_key] || { count: 0, total: 0 };
      const servicingBalance = pkgInfo.total - actualisedCost;
      const isClosed = pkgInfo.count > 0 && (svc?.tickedCount || 0) >= pkgInfo.count;
      const netAfterCharges = (Number(r.collected) || 0) - (Number(r.subvention) || 0) - (Number(r.gst) || 0);
      return Object.assign({}, r, {
        pnl: pnlByStudentMonth[key] || null,
        actualised_cost: actualisedCost,
        actualised_margin_pct: actualisedMarginPct,
        last_service_date: svc?.lastDate || null,
        servicing_total: pkgInfo.total,
        servicing_balance: servicingBalance,
        status: pkgInfo.count > 0 ? (isClosed ? 'Closed' : 'In progress') : '-',
        net_after_charges: netAfterCharges,
        last_collection_date: lastPayByMis[r.id] || null,
        card_owners: cardByStudent[r.students?.id] || {},
      });
    });

    return ok({ rows });
  } catch (err) {
    return handle(err);
  }
}

export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    requireRole(profile, CAN_WRITE);

    const body = await request.json();
    const stp_code = body.stp_code;
    const student_name = body.student_name;
    const email = body.email;
    const country = body.country;
    const pkg = body.package;
    const month = body.month;
    const total_sale_amount = body.total_sale_amount;
    const collected = body.collected;
    const outstanding = body.outstanding;
    const net_amount_after_deduction = body.net_amount_after_deduction;
    if (!stp_code || !student_name || !month) {
      return handle({ message: 'stp_code, student_name, and month are required', status: 400 });
    }

    const admin = getSupabaseAdmin();

    const studentResult = await admin
      .from('students')
      .upsert(
        { stp_code: stp_code, student_name: student_name, email: email, country: country, package: pkg, source: 'manual', added_by: user.id },
        { onConflict: 'stp_code' }
      )
      .select('id')
      .single();
    if (studentResult.error) throw studentResult.error;
    const student = studentResult.data;

    const packageKey = resolvePackageKey(pkg, total_sale_amount);

    const misResult = await admin
      .from('mis_records')
      .upsert(
        {
          student_id: student.id,
          month: month,
          total_sale_amount: total_sale_amount != null ? total_sale_amount : null,
          collected: collected != null ? collected : null,
          outstanding: outstanding != null ? outstanding : null,
          net_amount_after_deduction: net_amount_after_deduction != null ? net_amount_after_deduction : null,
          reference_package_key: packageKey,
          source: 'manual',
          uploaded_by: user.id,
        },
        { onConflict: 'student_id,month' }
      )
      .select('id')
      .single();
    if (misResult.error) throw misResult.error;
    const misRecord = misResult.data;

    await logActivity(admin, {
      entityType: 'student', entityId: student.id, action: 'created',
      performedBy: user.id, details: { student_name: student_name, month: month, source: 'manual' },
    });

    return ok({ student_id: student.id, mis_record_id: misRecord.id });
  } catch (err) {
    return handle(err);
  }
}

export async function PATCH(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    requireRole(profile, CAN_WRITE);

    const body = await request.json();
    const misRecordId = body.mis_record_id;
    if (!misRecordId) return handle({ message: 'mis_record_id is required', status: 400 });

    const admin = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await admin
      .from('mis_records')
      .select('id, student_id, month')
      .eq('id', misRecordId)
      .single();
    if (fetchErr) throw fetchErr;

    const studentPatch = {};
    if (body.student_name !== undefined) studentPatch.student_name = body.student_name;
    if (body.email !== undefined) studentPatch.email = body.email;
    if (body.country !== undefined) studentPatch.country = body.country;
    if (body.package !== undefined) studentPatch.package = body.package;
    if (Object.keys(studentPatch).length) {
      const { error } = await admin.from('students').update(studentPatch).eq('id', existing.student_id);
      if (error) throw error;
    }

    const misPatch = {};
    if (body.total_sale_amount !== undefined) misPatch.total_sale_amount = body.total_sale_amount;
    if (body.collected !== undefined) misPatch.collected = body.collected;
    if (body.outstanding !== undefined) misPatch.outstanding = body.outstanding;
    if (body.net_amount_after_deduction !== undefined) misPatch.net_amount_after_deduction = body.net_amount_after_deduction;
    if (body.reference_package_key !== undefined) misPatch.reference_package_key = body.reference_package_key;
    let updatedMis = null;
    if (Object.keys(misPatch).length) {
      const { data, error } = await admin.from('mis_records').update(misPatch).eq('id', misRecordId).select().single();
      if (error) throw error;
      updatedMis = data;
    }

    await logActivity(admin, {
      entityType: 'mis_record', entityId: misRecordId, action: 'edited',
      performedBy: user.id, details: { student: studentPatch, mis: misPatch },
    });

    return ok({ mis_record: updatedMis });
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    requireRole(profile, CAN_WRITE);

    const { searchParams } = new URL(request.url);
    const misRecordId = searchParams.get('mis_record_id');
    if (!misRecordId) return handle({ message: 'mis_record_id is required', status: 400 });

    const admin = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await admin
      .from('mis_records')
      .select('id, student_id, month')
      .eq('id', misRecordId)
      .single();
    if (fetchErr) throw fetchErr;

    await admin.from('student_services').delete().eq('student_id', existing.student_id).eq('month', existing.month);
    await admin.from('pnl_records').delete().eq('student_id', existing.student_id).eq('month', existing.month);
    const { error: delErr } = await admin.from('mis_records').delete().eq('id', misRecordId);
    if (delErr) throw delErr;

    await logActivity(admin, {
      entityType: 'mis_record', entityId: misRecordId, action: 'deleted',
      performedBy: user.id, details: { student_id: existing.student_id, month: existing.month },
    });

    return ok({ deleted: true });
  } catch (err) {
    return handle(err);
  }
}
