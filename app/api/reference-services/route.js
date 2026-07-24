import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { ok, handle } from '@/utils/http';

// GET ?package_key=Italy -> fixed-cost catalog services for a package, in
// sort order. Used by the Add/Edit student "which services does this student
// actually get" allocation picker, before any student_services ticks exist
// yet - so it reads straight from the catalog, not from a particular
// student's record. Only "fixed" cost_type rows are offered here, same
// restriction /api/students already applies when it counts what's billable
// toward the servicing total - "variable" (student's own spend) and
// "in_house" (free) services were never part of that count.
export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    await requireUser(supabase);
    const { searchParams } = new URL(request.url);
    const packageKey = searchParams.get('package_key');
    if (!packageKey) return handle({ message: 'package_key is required', status: 400 });

    const { data, error } = await supabase
      .from('reference_services')
      .select('id, service_name, reference_cost_inr, cost_type, sort_order')
      .eq('package_key', packageKey)
      .eq('cost_type', 'fixed')
      .order('sort_order');
    if (error) throw error;

    return ok({ services: data || [] });
  } catch (err) {
    return handle(err);
  }
}
