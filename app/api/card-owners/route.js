import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { ok, handle } from '@/utils/http';

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> total amount used per card owner
// (Tanisha Kalra / Manish Singh etc, split by which bank's card it was)
// across that date range. Omit from/to for an all-time total.
export async function GET(request) {
  try {
    const supabase = await getSupabaseServer();
    await requireUser(supabase);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let query = supabase.from('card_transactions').select('card_holder, source_bank, amount, transaction_date');
    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);
    const { data, error } = await query;
    if (error) throw error;

    const totals = {};
    for (const row of data || []) {
      const key = `${row.card_holder || 'Unknown'}|${row.source_bank || '-'}`;
      if (!totals[key]) totals[key] = { card_holder: row.card_holder || 'Unknown', source_bank: row.source_bank || '-', total: 0, count: 0 };
      totals[key].total += Number(row.amount || 0);
      totals[key].count += 1;
    }

    const summary = Object.values(totals).sort((a, b) => b.total - a.total);
    return ok({ summary });
  } catch (err) {
    return handle(err);
  }
}
