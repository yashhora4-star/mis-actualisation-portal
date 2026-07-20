import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { parseMISWorkbook } from '@/lib/parsers/parseMIS';
import { getCategoryIdMap } from '@/lib/db-helpers';
import { resolvePackageKey } from '@/lib/reference-services';
import { logActivity } from '@/lib/activity';

// Bulk version - processes the whole sheet in a handful of round trips instead
// of one await per student, which is what was timing out (Cloudflare Workers
// have a CPU-time budget per request; ~450 sequential awaits blew past it).
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    requireRole(profile, CAN_WRITE);

    const form = await request.formData();
    const file = form.get('file');
    const month = form.get('month');
    if (!file || !month) return handle({ message: 'file and month are required', status: 400 });

    const buffer = new Uint8Array(await file.arrayBuffer());
    const rawParsedRows = parseMISWorkbook(buffer, month);
    const skippedNoStp = rawParsedRows.skippedNoStp || 0;

    // De-dupe by student+month (last occurrence in the file wins) before any
    // upsert. A single upload - especially a multi-month backfill sheet - can
    // list the same student/month combo more than once, and Postgres rejects
    // an upsert batch that would touch the same conflict-key row twice
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
    const rowByStpMonth = new Map();
    for (const r of rawParsedRows) {
      rowByStpMonth.set(`${r.student.stp_code}|${r.mis_record.month}`, r);
    }
    const parsedRows = [...rowByStpMonth.values()];

    const admin = getSupabaseAdmin();
    const categoryMap = await getCategoryIdMap(admin);

    if (!parsedRows.length) {
      return ok({ inserted: 0, skippedNoStp });
    }

    // 1) Bulk upsert students, keyed by stp_code. De-duped separately (and
    // only by stp_code, not stp_code+month) because the same student can
    // legitimately appear under several different months in one file - each
    // of those is still one mis_records row, but only one students row.
    const studentRowByStp = new Map();
    for (const r of parsedRows) {
      studentRowByStp.set(r.student.stp_code, {
        stp_code: r.student.stp_code,
        student_name: r.student.student_name,
        email: r.student.email,
        country: r.student.country,
        package: r.student.package,
        source: 'upload',
        added_by: user.id,
      });
    }
    const studentRows = [...studentRowByStp.values()];
    const { data: upsertedStudents, error: studErr } = await admin
      .from('students')
      .upsert(studentRows, { onConflict: 'stp_code' })
      .select('id, stp_code');
    if (studErr) throw studErr;
    const stpToStudentId = Object.fromEntries(upsertedStudents.map((s) => [s.stp_code, s.id]));

    // 2) Bulk upsert mis_records, keyed by (student_id, month).
    const misRows = parsedRows.map((r) => {
      const studentId = stpToStudentId[r.student.stp_code];
      const packageKey = resolvePackageKey(r.student.package, r.mis_record.total_sale_amount);
      return {
        student_id: studentId,
        reference_package_key: packageKey,
        uploaded_by: user.id,
        source: 'upload',
        ...r.mis_record,
      };
    });
    const { data: upsertedMis, error: misErr } = await admin
      .from('mis_records')
      .upsert(misRows, { onConflict: 'student_id,month' })
      .select('id, student_id, month');
    if (misErr) throw misErr;
    // Keyed by student_id + month, not just student_id - a single upload can
    // contain the same student across more than one month (backfill sheets
    // span several months in one file), and keying by student_id alone would
    // collapse those into one id, misattributing every line item below to
    // whichever month's row happened to come back last.
    const misIdByStudentMonth = Object.fromEntries(upsertedMis.map((m) => [m.student_id + '|' + m.month, m.id]));

    const misRecordIds = upsertedMis.map((m) => m.id);

    // 3) Clear old line items for these records (bulk), then bulk insert new ones.
    await admin.from('mis_payment_lines').delete().in('mis_record_id', misRecordIds);
    await admin.from('mis_revenue_lines').delete().in('mis_record_id', misRecordIds);
    await admin.from('mis_cost_lines').delete().in('mis_record_id', misRecordIds);

    const paymentInserts = [];
    const revenueInserts = [];
    const costInserts = [];

    for (const r of parsedRows) {
      const studentId = stpToStudentId[r.student.stp_code];
      const misId = misIdByStudentMonth[studentId + '|' + r.mis_record.month];
      if (!misId) continue;
      for (const l of r.paymentLines) paymentInserts.push({ mis_record_id: misId, ...l });
      for (const l of r.revenueLines) revenueInserts.push({ mis_record_id: misId, category_id: categoryMap[l.category_code] || null, amount: l.amount });
      for (const l of r.costLines) costInserts.push({ mis_record_id: misId, category_id: categoryMap[l.category_code] || null, amount: l.amount });
    }

    if (paymentInserts.length) await admin.from('mis_payment_lines').insert(paymentInserts);
    if (revenueInserts.length) await admin.from('mis_revenue_lines').insert(revenueInserts);
    if (costInserts.length) await admin.from('mis_cost_lines').insert(costInserts);

    await admin.from('upload_batches').insert({
      sheet_type: 'mis',
      month,
      file_name: file.name,
      row_count: parsedRows.length,
      uploaded_by: user.id,
    });

    await logActivity(admin, {
      entityType: 'upload_batch', entityId: misRecordIds[0] || null, action: 'uploaded',
      performedBy: user.id, details: { month, file: file.name, rows: parsedRows.length },
    });

    return ok({ inserted: parsedRows.length, skippedNoStp });
  } catch (err) {
    return handle(err);
  }
}
