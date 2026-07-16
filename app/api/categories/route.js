import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { ok, handle } from '@/utils/http';

export async function GET() {
    try {
          const supabase = await getSupabaseServer();
          await requireUser(supabase);
          const { data, error } = await supabase
            .from('service_categories')
            .select('id, code, label, p_and_l_group')
            .order('sort_order');
          if (error) throw error;
          return ok({ categories: data });
    } catch (err) {
          return handle(err);
    }
}
