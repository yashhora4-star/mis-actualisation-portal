import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { ok, handle } from '@/utils/http';

// GET ?entity_type=student_service&entity_id=... OR ?student_id=... for a student's full history
export async function GET(request) {
    try {
          const supabase = await getSupabaseServer();
          await requireUser(supabase);
          const { searchParams } = new URL(request.url);
          const entityType = searchParams.get('entity_type');
          const entityId = searchParams.get('entity_id');
          const limit = Number(searchParams.get('limit') || 50);

      let query = supabase
            .from('activity_log')
            .select('id, entity_type, entity_id, action, details, performed_at, users(name, email)')
            .order('performed_at', { ascending: false })
            .limit(limit);

      if (entityType) query = query.eq('entity_type', entityType);
          if (entityId) query = query.eq('entity_id', entityId);

      const { data, error } = await query;
          if (error) throw error;
          return ok({ log: data });
    } catch (err) {
          return handle(err);
    }
}
