import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { ok, handle } from '@/utils/http';

// GET ?package_key=AC_ITALY
export async function GET(request) {
    try {
          const supabase = await getSupabaseServer();
          await requireUser(supabase);
          const { searchParams } = new URL(request.url);
          const packageKey = searchParams.get('package_key');

      let query = supabase.from('reference_services').select('*').order('sort_order');
          if (packageKey) query = query.eq('package_key', packageKey);

      const { data, error } = await query;
          if (error) throw error;
          return ok({ services: data });
    } catch (err) {
          return handle(err);
    }
}
