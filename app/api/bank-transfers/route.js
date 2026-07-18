import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getProfile, getAccessScope } from '@/utils/roles';
import { ok, handle } from '@/utils/http';

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> every bank-transfer payment recorded
// against a student_services tick: student, date, UTR, and the proof link -
// same source data as Card owner summary, filtered to payment_mode = 'bank_transfer'.
export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    const scope = await getAccessScope(supabase, profile);
    if (!scope.allCountries) {
      return handle({ message: 'Not authorized for this view', status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let query = supabase
      .from('student_services')
      .select('id, student_id, month, service_date, actual_cost_inr, utr, proof_file_url, proof_file_name, reference_service_id, students(student_name, stp_code, country), reference_services(service_name)')
      .eq('payment_mode', 'bank_transfer');
    if (from) query = query.gte('service_date', from);
    if (to) query = query.lte('service_date', to);
    const { data, error } = await query.order('service_date', { ascending: false });
    if (error) throw error;

    const rows = (data || []).map((row) => ({
      id: row.id,
      student_id: row.student_id,
      student_name: row.students?.student_name || '-',
      stp_code: row.students?.stp_code || '-',
      country: row.students?.country || '-',
      month: row.month,
      service_name: row.reference_services?.service_name || '-',
      amount: Number(row.actual_cost_inr || 0),
      service_date: row.service_date,
      utr: row.utr,
      proof_file_url: row.proof_file_url,
      proof_file_name: row.proof_file_name,
    }));

    const total = rows.reduce((s, r) => s + r.amount, 0);
    return ok({ rows, total });
  } catch (err) {
    return handle(err);
  }
}
