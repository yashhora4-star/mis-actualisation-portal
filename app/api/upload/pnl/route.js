import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { parsePNLWorkbook } from '@/lib/parsers/parsePNL';
import { getCategoryIdMap, upsertStudent } from '@/lib/db-helpers';

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
          const parsedRows = parsePNLWorkbook(buffer, month);

      const admin = getSupabaseAdmin();
          const categoryMap = await getCategoryIdMap(admin);

      let inserted = 0;
          for (const row of parsedRows) {
                  const studentId = await upsertStudent(admin, row.student);

            const { data: pnlRecord, error: pnlErr } = await admin
                    .from('pnl_records')
                    .upsert(
                      { student_id: studentId, ...row.pnl_record, uploaded_by: user.id, source: 'upload' },
                      { onConflict: 'student_id,month' }
                              )
                    .select('id')
                    .single();
                  if (pnlErr) throw pnlErr;

            await admin.from('pnl_servicing_lines').delete().eq('pnl_record_id', pnlRecord.id);
                  if (row.servicingLines.length) {
                            await admin.from('pnl_servicing_lines').insert(
                                        row.servicingLines.map((l) => ({
                                                      pnl_record_id: pnlRecord.id,
                                                      category_id: l.category_code ? categoryMap[l.category_code] || null : null,
                                                      raw_label: l.raw_label,
                                                      amount: l.amount,
                                        }))
                                      );
                  }
                  inserted++;
          }

      await admin.from('upload_batches').insert({
              sheet_type: 'pnl',
              month,
              file_name: file.name,
              row_count: inserted,
              uploaded_by: user.id,
      });

      return ok({ inserted });
    } catch (err) {
          return handle(err);
    }
}
