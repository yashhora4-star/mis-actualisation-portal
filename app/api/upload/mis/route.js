import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { parseMISWorkbook } from '@/lib/parsers/parseMIS';
import { getCategoryIdMap, upsertStudent } from '@/lib/db-helpers';
import { resolvePackageKey } from '@/lib/reference-services';
import { logActivity } from '@/lib/activity';

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
          const parsedRows = parseMISWorkbook(buffer, month);

      const admin = getSupabaseAdmin();
          const categoryMap = await getCategoryIdMap(admin);

      let inserted = 0;
          for (const row of parsedRows) {
                  const studentId = await upsertStudent(admin, row.student);
                  const packageKey = resolvePackageKey(row.student.package, row.mis_record.total_sale_amount);

            const { data: misRecord, error: misErr } = await admin
                    .from('mis_records')
                    .upsert(
                      { student_id: studentId, ...row.mis_record, reference_package_key: packageKey, uploaded_by: user.id, source: 'upload' },
                      { onConflict: 'student_id,month' }
                              )
                    .select('id')
                    .single();
                  if (misErr) throw misErr;

            await logActivity(admin, {
                      entityType: 'mis_record', entityId: misRecord.id, action: 'uploaded',
                      performedBy: user.id, details: { month, file: file.name },
            });

            await admin.from('mis_payment_lines').delete().eq('mis_record_id', misRecord.id);
                  await admin.from('mis_revenue_lines').delete().eq('mis_record_id', misRecord.id);
                  await admin.from('mis_cost_lines').delete().eq('mis_record_id', misRecord.id);

            if (row.paymentLines.length) {
                      await admin.from('mis_payment_lines').insert(
                                  row.paymentLines.map((l) => ({ mis_record_id: misRecord.id, ...l }))
                                );
            }
                  if (row.revenueLines.length) {
                            await admin.from('mis_revenue_lines').insert(
                                        row.revenueLines.map((l) => ({
                                                      mis_record_id: misRecord.id,
                                                      category_id: categoryMap[l.category_code] || null,
                                                      amount: l.amount,
                                        }))
                                      );
                  }
                  if (row.costLines.length) {
                            await admin.from('mis_cost_lines').insert(
                                        row.costLines.map((l) => ({
                                                      mis_record_id: misRecord.id,
                                                      category_id: categoryMap[l.category_code] || null,
                                                      amount: l.amount,
                                        }))
                                      );
                  }
                  inserted++;
          }

      await admin.from('upload_batches').insert({
              sheet_type: 'mis',
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
