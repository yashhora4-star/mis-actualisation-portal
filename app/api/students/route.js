import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';
import { resolvePackageKey } from '@/lib/reference-services';

export async function GET(request) {
    try {
          const supabase = await getSupabaseServer();
          await requireUser(supabase);
          const { searchParams } = new URL(request.url);
          const month = searchParams.get('month');

      let misQuery = supabase
            .from('mis_records')
            .select('id, month, product_tag, reference_package_key, total_sale_amount, collected, outstanding, total_amount_received, subvention, gst, total_margin_incl_gst, total_margin_excl_gst, total_margin_excl_subvention_gst, students ( id, stp_code, student_name, country, package, created_at )')
            .order('month', { ascending: false });
          if (month) misQuery = misQuery.eq('month', month);

      const { data: misRows, error: misErr } = await misQuery;
          if (misErr) throw misErr;

      const studentIds = misRows.map((r) => r.students?.id).filter(Boolean);
          let pnlQuery = supabase
            .from('pnl_records')
            .select('student_id, month, margin, margin_pct, total_cash_in_bank')
            .in('student_id', studentIds.length ? studentIds : ['__none__']);
          if (month) pnlQuery = pnlQuery.eq('month', month);
          const { data: pnlRows, error: pnlErr } = await pnlQuery;
          if (pnlErr) throw pnlErr;

      const pnlByStudentMonth = {};
          for (const p of pnlRows || []) pnlByStudentMonth[p.student_id + '|' + p.month] = p;

      let svcQuery = supabase
            .from('student_services')
            .select('student_id, month, is_selected, reference_cost_inr, actual_cost_inr, service_date')
            .in('student_id', studentIds.length ? studentIds : ['__none__']);
          if (month) svcQuery = svcQuery.eq('month', month);
          const { data: svcRows } = await svcQuery;

      const svcByStudentMonth = {};
          for (const s of svcRows || []) {
                  if (!s.is_selected) continue;
                  const key = s.student_id + '|' + s.month;
                  if (!svcByStudentMonth[key]) svcByStudentMonth[key] = { total: 0, lastDate: null };
                  svcByStudentMonth[key].total += Number(s.actual_cost_inr ?? s.reference_cost_inr ?? 0);
                  if (s.service_date && (!svcByStudentMonth[key].lastDate || s.service_date > svcByStudentMonth[key].lastDate)) {
                            svcByStudentMonth[key].lastDate = s.service_date;
                  }
          }

      const rows = misRows.map((r) => {
              const key = (r.students?.id) + '|' + r.month;
              const svc = svcByStudentMonth[key];
              const actualisedCost = svc?.total ?? 0;
              const actualisedMarginPct = r.total_sale_amount
                ? ((r.total_sale_amount - actualisedCost) / r.total_sale_amount) * 100
                        : null;
              return Object.assign({}, r, {
                        pnl: pnlByStudentMonth[key] || null,
                        actualised_cost: actualisedCost,
                        actualised_margin_pct: actualisedMarginPct,
                        last_service_date: svc?.lastDate || null,
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
