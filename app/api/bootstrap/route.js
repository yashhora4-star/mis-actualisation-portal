import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getProfile } from '@/utils/roles';
import { ok, handle } from '@/utils/http';

export async function GET() {
    try {
          const supabase = await getSupabaseServer();
          const user = await requireUser(supabase);
          const profile = await getProfile(supabase, user.id);

      const [{ count: studentCount }, { data: months }] = await Promise.all([
              supabase.from('students').select('id', { count: 'exact', head: true }),
              supabase.from('mis_records').select('month').order('month'),
            ]);

      const distinctMonths = [...new Set((months || []).map((m) => m.month))];

      const { data: misRecords } = await supabase
            .from('mis_records')
            .select('student_id, month, reference_package_key')
            .not('reference_package_key', 'is', null);

      let pendingCount = 0;
          if (misRecords?.length) {
                  const packageKeys = [...new Set(misRecords.map((m) => m.reference_package_key))];
                  const { data: fixedServices } = await supabase
                    .from('reference_services')
                    .select('id, package_key')
                    .eq('cost_type', 'fixed')
                    .in('package_key', packageKeys);
                  const fixedCountByPkg = {};
                  for (const s of fixedServices || []) fixedCountByPkg[s.package_key] = (fixedCountByPkg[s.package_key] || 0) + 1;

            const { data: ticks } = await supabase
                    .from('student_services')
                    .select('student_id, month')
                    .eq('is_selected', true);
                  const tickedSet = new Set((ticks || []).map((t) => `${t.student_id}|${t.month}`));

            for (const rec of misRecords) {
                      const total = fixedCountByPkg[rec.reference_package_key] || 0;
                      const anyTicked = tickedSet.has(`${rec.student_id}|${rec.month}`);
                      if (total > 0 && !anyTicked) pendingCount += total;
            }
          }

      return ok({
              profile,
              studentCount: studentCount || 0,
              months: distinctMonths,
              pendingActualisation: {
                        cardTransactions: 0,
                        servicingLines: pendingCount,
              },
      });
    } catch (err) {
          return handle(err);
    }
}
