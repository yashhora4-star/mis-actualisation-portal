import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireMisWrite } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { logActivity } from '@/lib/activity';

// POST { mis_record_id, amount, pay_date, note? } - records a payment against
// a student's outstanding balance. Writes a dated row to mis_payment_lines
// (the same table sheet uploads populate, so "last collection date" picks
// this up too) and moves the money from outstanding into collected on the
// mis_records row. Restricted to superadmin / MIS POC, same as add/edit/delete.
export async function POST(request) {
  try {
    const supabase = await getSupabaseServer();
    const user = await requireUser(supabase);
    const profile = await getProfile(supabase, user.id);
    requireMisWrite(profile);

    const body = await request.json();
    const misRecordId = body.mis_record_id;
    const amount = Number(body.amount);
    const payDate = body.pay_date;
    const note = body.note ? String(body.note).trim() : null;

    if (!misRecordId) return handle({ message: 'mis_record_id is required', status: 400 });
    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      return handle({ message: 'amount must be a positive number', status: 400 });
    }
    if (!payDate) return handle({ message: 'pay_date is required', status: 400 });

    const admin = getSupabaseAdmin();

    const { data: misRecord, error: fetchErr } = await admin
      .from('mis_records')
      .select('id, student_id, month, collected, outstanding')
      .eq('id', misRecordId)
      .single();
    if (fetchErr) throw fetchErr;

    const { data: seqRows } = await admin
      .from('mis_payment_lines')
      .select('seq')
      .eq('mis_record_id', misRecordId)
      .order('seq', { ascending: false })
      .limit(1);
    const nextSeq = (seqRows?.[0]?.seq || 0) + 1;

    const { error: insErr } = await admin.from('mis_payment_lines').insert({
      mis_record_id: misRecordId,
      seq: nextSeq,
      amount,
      pay_date: payDate,
      pay_ref: note,
      mode: 'manual',
    });
    if (insErr) throw insErr;

    const newCollected = (Number(misRecord.collected) || 0) + amount;
    // Don't let a payment larger than the recorded outstanding push it negative -
    // clamp at 0 and let the difference show up as an over-collection to sort out
    // via Edit, rather than a confusing negative outstanding figure.
    const newOutstanding = Math.max((Number(misRecord.outstanding) || 0) - amount, 0);

    const { data: updatedMis, error: updErr } = await admin
      .from('mis_records')
      .update({ collected: newCollected, outstanding: newOutstanding })
      .eq('id', misRecordId)
      .select()
      .single();
    if (updErr) throw updErr;

    await logActivity(admin, {
      entityType: 'mis_record',
      entityId: misRecordId,
      action: 'payment_recorded',
      performedBy: user.id,
      details: { amount, pay_date: payDate, note },
    });

    return ok({ mis_record: updatedMis });
  } catch (err) {
    return handle(err);
  }
}
