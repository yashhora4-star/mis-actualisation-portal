import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

const BUCKET = 'service-proofs';

// POST multipart/form-data { student_service_id, utr?, file? }
// Saves the UTR and/or uploads the payment proof for one ticked service,
// and logs it to the activity feed so it shows up in that service's history.
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    if (!profile?.active) return handle({ message: 'Account not active', status: 403 });

    const form = await request.formData();
    const studentServiceId = form.get('student_service_id');
    const utrRaw = form.get('utr');
    const utr = utrRaw ? String(utrRaw).trim() : '';
    const file = form.get('file');
    if (!studentServiceId) return handle({ message: 'student_service_id is required', status: 400 });

    const admin = getSupabaseAdmin();
    const patch = {};

    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0) {
      const safeName = String(file.name || 'proof').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const path = `${studentServiceId}/${Date.now()}-${safeName}`;
      const arrayBuffer = await file.arrayBuffer();
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, arrayBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      patch.proof_file_url = pub.publicUrl;
      patch.proof_file_name = file.name || safeName;
      patch.proof_uploaded_at = new Date().toISOString();
    }

    if (utr) patch.utr = utr;

    if (!Object.keys(patch).length) {
      return handle({ message: 'Nothing to save - provide a UTR or a proof file', status: 400 });
    }

    const { data: saved, error } = await admin
      .from('student_services')
      .update(patch)
      .eq('id', studentServiceId)
      .select()
      .single();
    if (error) throw error;

    await logActivity(admin, {
      entityType: 'student_service',
      entityId: studentServiceId,
      action: 'proof_uploaded',
      performedBy: user.id,
      details: { utr: patch.utr || null, file_name: patch.proof_file_name || null },
    });

    return ok({ tick: saved });
  } catch (err) {
    return handle(err);
  }
}
