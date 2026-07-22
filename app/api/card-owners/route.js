import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getProfile, getAccessScope } from '@/utils/roles';
import { ok, handle } from '@/utils/http';

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> per-card-owner totals AND the actual
// student-level attribution behind them.
//
// Previously this read from a standalone `card_transactions` table (populated
// by a separate bank-statement upload) that had no link at all to which
// student or service the money was actually for. Now it's built straight off
// `student_services` rows where payment_mode = 'card', which are the same
// rows the ProofModal writes when someone ticks a service and records how it
// was paid - so every rupee here is traceable to a student and a service.
export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    const scope = await getAccessScope(supabase, profile);
    // Card owner summary is a full-portfolio view - package-scoped POCs don't
    // get it (per "nothing else on the portal"), even if they hit the API
    // directly. (getAccessScope only ever returns allPackages/packages -
    // access is scoped by package, not country - so this used to check a
    // field, allCountries, that never existed and was always undefined,
    // locking out everyone including superadmin.)
    if (!scope.allPackages) {
      return handle({ message: 'Not authorized for this view', status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let query = supabase
      .from('student_services')
      .select('id, student_id, month, service_date, actual_cost_inr, card_owner, utr, reference_service_id, students(student_name, stp_code, country), reference_services(service_name)')
      .eq('payment_mode', 'card')
      .not('card_owner', 'is', null);
    if (from) query = query.gte('service_date', from);
    if (to) query = query.lte('service_date', to);
    const { data, error } = await query;
    if (error) throw error;

    const totals = {};
    for (const row of data || []) {
      const owner = row.card_owner || 'Unknown';
      if (!totals[owner]) totals[owner] = { card_owner: owner, total: 0, count: 0, students: [] };
      const amount = Number(row.actual_cost_inr || 0);
      totals[owner].total += amount;
      totals[owner].count += 1;
      totals[owner].students.push({
        student_id: row.student_id,
        student_name: row.students?.student_name || '-',
        stp_code: row.students?.stp_code || '-',
        country: row.students?.country || '-',
        month: row.month,
        service_name: row.reference_services?.service_name || '-',
        amount,
        service_date: row.service_date,
        utr: row.utr,
      });
    }

    for (const owner of Object.values(totals)) {
      owner.students.sort((a, b) => new Date(b.service_date || 0) - new Date(a.service_date || 0));
    }

    const summary = Object.values(totals).sort((a, b) => b.total - a.total);
    return ok({ summary });
  } catch (err) {
    return handle(err);
  }
}
