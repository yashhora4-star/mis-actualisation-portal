import * as XLSX from 'xlsx';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { parseMISWorkbook } from '@/lib/parsers/parseMIS';
import { parsePNLWorkbook } from '@/lib/parsers/parsePNL';
import { getCategoryIdMap, upsertStudent } from '@/lib/db-helpers';
import { resolvePackageKey } from '@/lib/reference-services';

async function fetchSheetAsWorkbookBuffer(sheetId, tabName) {
    const url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tabName);
    const res = await fetch(url);
    if (!res.ok) {
          throw new Error('Could not read the sheet (HTTP ' + res.status + '). Check it is shared as Anyone with the link - Viewer.');
    }
    const csvText = await res.text();
    const wb = XLSX.read(csvText, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const outWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outWb, ws, tabName === 'MIS' ? 'MIS' : 'Sheet1');
    return new Uint8Array(XLSX.write(outWb, { type: 'array', bookType: 'xlsx' }));
}

export async function POST(request) {
    try {
      const admin = getSupabaseAdmin();

          // Two ways in: a logged-in superadmin clicking "Sync now" in Upload
          // sheets, or a shared secret from the automatic/scheduled sync -
          // which has no browser session to log in with. Both need a
          // `user.id` to attribute the synced records to; the secret path
          // attributes to whichever active superadmin was created first,
          // since there's no logged-in person to credit it to.
          const cronSecret = request.headers.get('x-sync-secret');
          let user;
          if (cronSecret && process.env.SHEET_SYNC_SECRET && cronSecret === process.env.SHEET_SYNC_SECRET) {
                const { data: sysUser, error: sysErr } = await admin
                  .from('users')
                  .select('id')
                  .eq('role', 'superadmin')
                  .eq('active', true)
                  .order('created_at', { ascending: true })
                  .limit(1)
                  .single();
                if (sysErr || !sysUser) {
                      return handle({ message: 'No active superadmin found to attribute the automated sync to', status: 500 });
                }
                user = { id: sysUser.id };
          } else {
                const supabase = await getSupabaseServer();
                user = await requireUser(supabase);
                const profile = await getProfile(supabase, user.id);
                requireRole(profile, CAN_WRITE);
          }

      const body = await request.json();
          const sheetType = body.sheetType;
          const month = body.month;
          if (!sheetType || !month) return handle({ message: 'sheetType and month are required', status: 400 });

          const { data: config, error: cfgErr } = await admin
            .from('sheet_sync_config')
            .select('*')
            .eq('sheet_type', sheetType)
            .single();
          if (cfgErr || !config) {
                  return handle({ message: 'No sheet_sync_config row for sheetType=' + sheetType + ' - add one via SQL (see README)', status: 400 });
          }

      const buffer = await fetchSheetAsWorkbookBuffer(config.sheet_id, config.tab_name);
          const categoryMap = await getCategoryIdMap(admin);
          let inserted = 0;

      if (sheetType === 'mis') {
              const parsedRows = parseMISWorkbook(buffer, month);
              for (const row of parsedRows) {
                        const studentId = await upsertStudent(admin, row.student);
                        const packageKey = resolvePackageKey(row.student.package, row.mis_record.total_sale_amount);
                        const { data: misRecord, error } = await admin
                          .from('mis_records')
                          .upsert({ student_id: studentId, ...row.mis_record, reference_package_key: packageKey, uploaded_by: user.id, source: 'sheet_sync' }, { onConflict: 'student_id,month' })
                          .select('id').single();
                        if (error) throw error;
                        await admin.from('mis_payment_lines').delete().eq('mis_record_id', misRecord.id);
                        await admin.from('mis_revenue_lines').delete().eq('mis_record_id', misRecord.id);
                        await admin.from('mis_cost_lines').delete().eq('mis_record_id', misRecord.id);
                        if (row.paymentLines.length) await admin.from('mis_payment_lines').insert(row.paymentLines.map((l) => ({ mis_record_id: misRecord.id, ...l })));
                        if (row.revenueLines.length) await admin.from('mis_revenue_lines').insert(row.revenueLines.map((l) => ({ mis_record_id: misRecord.id, category_id: categoryMap[l.category_code] || null, amount: l.amount })));
                        if (row.costLines.length) await admin.from('mis_cost_lines').insert(row.costLines.map((l) => ({ mis_record_id: misRecord.id, category_id: categoryMap[l.category_code] || null, amount: l.amount })));
                        inserted++;
              }
      } else if (sheetType === 'pnl') {
              const parsedRows = parsePNLWorkbook(buffer, month);
              for (const row of parsedRows) {
                        const studentId = await upsertStudent(admin, row.student);
                        const { data: pnlRecord, error } = await admin
                          .from('pnl_records')
                          .upsert({ student_id: studentId, ...row.pnl_record, uploaded_by: user.id, source: 'sheet_sync' }, { onConflict: 'student_id,month' })
                          .select('id').single();
                        if (error) throw error;
                        await admin.from('pnl_servicing_lines').delete().eq('pnl_record_id', pnlRecord.id);
                        if (row.servicingLines.length) await admin.from('pnl_servicing_lines').insert(row.servicingLines.map((l) => ({ pnl_record_id: pnlRecord.id, category_id: l.category_code ? categoryMap[l.category_code] || null : null, raw_label: l.raw_label, amount: l.amount })));
                        inserted++;
              }
      } else {
              return handle({ message: 'sheetType must be mis or pnl', status: 400 });
      }

      await admin.from('sheet_sync_config').update({ last_synced_at: new Date().toISOString() }).eq('id', config.id);

      return ok({ inserted });
    } catch (err) {
          return handle(err);
    }
}
