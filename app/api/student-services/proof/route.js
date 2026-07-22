import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

const BUCKET = 'service-proofs';
// "Personal card" plus the three named individuals cover payments fronted on
// someone's own card rather than a company card - kept in this same list
// (not a separate payment mode) since the UI's Card dropdown is the one
// place this gets picked. Must stay in sync with the same list in
// components/dashboard/ServiceChecklist.jsx.
const CARD_OWNERS = [
  'Tanisha Kalra (HSBC)', 'Manish Singh (HSBC)', 'Manish Singh (RBL)',
  'Aditya Arora', 'Personal card', 'Sumit Arora', 'Bharti',
];

// POST multipart/form-data { student_service_id, utr, file?, payment_mode, card_owner?, actual_cost_inr? }
// UTR and payment mode are mandatory - this is the one place a tick's payment
// gets recorded. The proof file itself is optional: it can be added now or
// on a later "Update" once it's actually on hand, without blocking the tick.
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
    if (paymentMode !== 'card' && paymentMode !== 'bank_transfer') {
      return handle({ message: 'Select a payment mode', status: 400 });
    }
    if (paymentMode === 'card' && !CARD_OWNERS.includes(cardOwner)) {
      return handle({ message: 'Select which card was used', status: 400 });
    }

    const admin = getSupabaseAdmin();

    const hasFile = file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0;

    const patch = {
      utr,
      payment_mode: paymentMode,
      card_owner: paymentMode === 'card' ? cardOwner : null,
    };
    if (actualCost != null && Number.isFinite(actualCost)) patch.actual_cost_inr = actualCost;

    // File is optional - only touch the proof_* columns (and only overwrite an
    // existing proof) when one was actually sent this time.
    if (hasFile) {
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
        file_name: patch.proof_file_name ?? null,
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
