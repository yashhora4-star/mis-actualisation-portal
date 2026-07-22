import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireMisWrite, getAccessScope, isAllowedPackage } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';
import { resolvePackageKey } from '@/lib/reference-services';

// Postgres/PostgREST rejects a single request once an `.in(column, ids)`
// list gets long enough - as the dataset grew past a few thousand
// mis_records, the plain single-shot queries below started failing outright
// with a generic "Bad Request" (no useful detail, just the whole page
// breaking). `makeQuery` must return a *fresh*, not-yet-filtered query
// builder each call, since a Supabase query builder can only be used once -
// chunking re-uses the same base query shape across several smaller requests
// run in parallel instead of one giant one.
const IN_CHUNK_SIZE = 150;
async function fetchInChunks(makeQuery, column, ids, chunkSize = IN_CHUNK_SIZE) {
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await makeQuery().in(column, chunk);
    if (error) throw error;
    return data || [];
  }));
  return results.flat();
}

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

    // POC members are scoped to the packages assigned to them in Team access
    // (superadmin and the Accounts POC see everyone) - filtered here so every
    // downstream calculation (stats, totals) only reflects what they can see.
    const misRows = scope.allPackages
      ? misRowsRaw
      : misRowsRaw.filter((r) => isAllowedPackage(scope, r.students?.package));

    const studentIds = misRows.map((r) => r.students?.id).filter(Boolean);
    const misRecordIds = misRows.map((r) => r.id).filter(Boolean);

    let pnlRows = [];
    if (studentIds.length) {
      pnlRows = await fetchInChunks(
        () => {
          let q = supabase.from('pnl_records').select('student_id, month, margin, margin_pct, total_cash_in_bank');
          if (month) q = q.eq('month', month);
          return q;
        },
        'student_id',
        studentIds
      );
    }

    const pnlByStudentMonth = {};
    for (const p of pnlRows || []) pnlByStudentMonth[p.student_id + '|' + p.month] = p;

    let svcRows = [];
    if (studentIds.length) {
      svcRows = await fetchInChunks(
        () => {
          let q = supabase.from('student_services').select('student_id, month, is_selected, reference_cost_inr, actual_cost_inr, service_date');
          if (month) q = q.eq('month', month);
          return q;
        },
        'student_id',
        studentIds
      );
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
      refSvcRows = await fetchInChunks(
        () => supabase.from('reference_services').select('package_key, reference_cost_inr').eq('cost_type', 'fixed'),
        'package_key',
        packageKeys
      );
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
      payRows = await fetchInChunks(
        () => supabase.from('mis_payment_lines').select('mis_record_id, pay_date').not('pay_date', 'is', null),
        'mis_record_id',
        misRecordIds
      );
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
      cardRows = await fetchInChunks(
        () => supabase.from('card_transactions').select('student_id, card_holder, source_bank, amount'),
        'student_id',
        studentIds
      );
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
      // "Net amount after deduction" (the uploaded/entered figure, after
      // bank/gateway deduction) is the single net-amount source of truth -
      // there used to be a second, separately-computed "net after
      // subvention/GST" number living alongside it, which was confusing and
      // redundant. Margin is now measured against this one figure instead.
      const netAmount = r.net_amount_after_deduction != null ? Number(r.net_amount_after_deduction) : null;
      const actualisedMarginPct = netAmount
        ? ((netAmount - actualisedCost) / netAmount) * 100
        : null;
      const pkgInfo = refByPkg[r.reference_package_key] || { count: 0, total: 0 };
      const servicingBalance = pkgInfo.total - actualisedCost;
      const isClosed = pkgInfo.count > 0 && (svc?.tickedCount || 0) >= pkgInfo.count;
      return Object.assign({}, r, {
        pnl: pnlByStudentMonth[key] || null,
        actualised_cost: actualisedCost,
        actualised_margin_pct: actualisedMarginPct,
        last_service_date: svc?.lastDate || null,
        servicing_total: pkgInfo.total,
        servicing_balance: servicingBalance,
        status: pkgInfo.count > 0 ? (isClosed ? 'Closed' : 'In progress') : '-',
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
    requireMisWrite(profile);

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
    requireMisWrite(profile);

    const body = await request.json();
    const misRecordId = body.mis_record_id;
    if (!misRecordId) return handle({ message: 'mis_record_id is required', status: 400 });

    const admin = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await admin
      .from('mis_records')
      .select('id, student_id, month, total_sale_amount, reference_package_key')
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
    if (body.reference_package_key !== undefined) {
      // Caller explicitly picked a catalog - trust it as-is.
      misPatch.reference_package_key = body.reference_package_key;
    } else if (body.package !== undefined) {
      // Package was changed via Edit but nobody told us which catalog to use -
      // recompute it the same way an upload would, instead of leaving the
      // checklist pinned to whatever package was resolved at upload/creation
      // time. This is exactly the bug that let a student's Package say "VAS"
      // while their checklist kept showing Germany/E2E services from before
      // the correction.
      const saleForMatch = body.total_sale_amount !== undefined ? body.total_sale_amount : existing.total_sale_amount;
      misPatch.reference_package_key = resolvePackageKey(body.package, saleForMatch);
    }
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
    requireMisWrite(profile);

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
