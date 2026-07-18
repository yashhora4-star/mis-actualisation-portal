import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

const BUCKET = 'service-proofs';
const CARD_OWNERS = ['Tanisha Kalra (HSBC)', 'Manish Singh (HSBC)', 'Manish Singh (RBL)'];

// POST multipart/form-data { student_service_id, utr, file, payment_mode, card_owner?, actual_cost_inr? }
// UTR, a proof file, and a payment mode are all mandatory - this is the one place
// a tick's payment gets recorded, so we don't allow a half-finished submission.
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    if (!profile?.active) return handle({ message: 'Account not active', status: 403 });

    const form = await request.formData();
    const studentServiceId = form.get('student_service_id');
    const utr = String(form.get('utr') || '').trim();
    const file = form.get('file');
    const paymentMode = String(form.get('payment_mode') || '').trim();
    const cardOwner = String(form.get('card_owner') || '').trim();
    const actualCostRaw = form.get('actual_cost_inr');
    const actualCost = actualCostRaw !== null && actualCostRaw !== '' ? Number(actualCostRaw) : null;

    if (!studentServiceId) return handle({ message: 'student_service_id is required', status: 400 });
    if (!utr) return handle({ message: 'UTR is required', status: 400 });
    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return handle({ message: 'Proof of payment is required', status: 400 });
    }
    if (paymentMode !== 'card' && paymentMode !== 'bank_transfer') {
      return handle({ message: 'Select a payment mode', status: 400 });
    }
    if (paymentMode === 'card' && !CARD_OWNERS.includes(cardOwner)) {
      return handle({ message: 'Select which card was used', status: 400 });
    }

    const admin = getSupabaseAdmin();

    const safeName = String(file.name || 'proof').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const path = `${studentServiceId}/${Date.now()}-${safeName}`;
    const arrayBuffer = await file.arrayBuffer();
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });
    if (upErr) throw upErr;
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    const patch = {
      utr,
      proof_file_url: pub.publicUrl,
      proof_file_name: file.name || safeName,
      proof_uploaded_at: new Date().toISOString(),
      payment_mode: paymentMode,
      card_owner: paymentMode === 'card' ? cardOwner : null,
    };
    if (actualCost != null && Number.isFinite(actualCost)) patch.actual_cost_inr = actualCost;

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
      details: {
        utr,
        file_name: patch.proof_file_name,
        payment_mode: paymentMode,
        card_owner: patch.card_owner,
        actual_cost_inr: patch.actual_cost_inr ?? null,
      },
    });

    return ok({ tick: saved });
  } catch (err) {
    return handle(err);
  }
}
