import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { CATEGORY_GROUP_LABELS } from '@/lib/categories';
import { ok, handle } from '@/utils/http';

/**
 * The core "what was received vs what was actually realised" view, broken
 * down by real product group (AC / VAS-Accommodation / VAS-Tuition Fee /
 * VAS-Other) instead of the old blanket AC/VAS split.
 */
export async function GET(request) {
    try {
          const supabase = await getSupabaseServer();
          await requireUser(supabase);
          const { searchParams } = new URL(request.url);
          const month = searchParams.get('month');

      const groups = Object.keys(CATEGORY_GROUP_LABELS);
          const totals = Object.fromEntries(groups.map((g) => [g, { receivable: 0, payableActual: 0, unmarkedPayable: 0 }]));

      let misIds = null;
          if (month) {
                  const { data: recs } = await supabase.from('mis_records').select('id').eq('month', month);
                  misIds = (recs || []).map((r) => r.id);
          }
          let revQuery = supabase
            .from('mis_revenue_lines')
            .select('amount, mis_record_id, service_categories(p_and_l_group)');
          if (misIds) revQuery = revQuery.in('mis_record_id', misIds.length ? misIds : ['__none__']);
          const { data: revLines, error: revErr } = await revQuery;
          if (revErr) throw revErr;
          for (const line of revLines || []) {
                  const group = line.service_categories?.p_and_l_group;
                  if (group && totals[group]) totals[group].receivable += Number(line.amount) || 0;
          }

      let cardQuery = supabase
            .from('card_transactions')
            .select('amount, category_id, sale_month, service_categories(p_and_l_group)');
          const { data: cardRows, error: cardErr } = await cardQuery;
          if (cardErr) throw cardErr;
          for (const row of cardRows || []) {
                  const group = row.service_categories?.p_and_l_group;
                  if (!row.category_id) {
                            continue;
                  }
                  if (group && totals[group]) totals[group].payableActual += Number(row.amount) || 0;
          }
          const unmarkedCardTotal = (cardRows || [])
            .filter((r) => !r.category_id)
            .reduce((s, r) => s + (Number(r.amount) || 0), 0);

      let pnlIds = null;
          if (month) {
                  const { data: recs } = await supabase.from('pnl_records').select('id').eq('month', month);
                  pnlIds = (recs || []).map((r) => r.id);
          }
          let svcQuery = supabase
            .from('pnl_servicing_lines')
            .select('amount, category_id, pnl_record_id, service_categories(p_and_l_group)');
          if (pnlIds) svcQuery = svcQuery.in('pnl_record_id', pnlIds.length ? pnlIds : ['__none__']);
          const { data: svcRows, error: svcErr } = await svcQuery;
          if (svcErr) throw svcErr;
          let unmarkedServicingTotal = 0;
          for (const row of svcRows || []) {
                  const group = row.service_categories?.p_and_l_group;
                  if (!row.category_id) {
                            unmarkedServicingTotal += Number(row.amount) || 0;
                            continue;
                  }
                  if (group && totals[group]) totals[group].payableActual += Number(row.amount) || 0;
          }

      const byGroup = groups.map((g) => ({
              group: g,
              label: CATEGORY_GROUP_LABELS[g],
              receivable: totals[g].receivable,
              payableActual: totals[g].payableActual,
              variance: totals[g].receivable - totals[g].payableActual,
      }));

      return ok({
              byGroup,
              unattributed: {
                        cardSpend: unmarkedCardTotal,
                        servicingSpend: unmarkedServicingTotal,
              },
      });
    } catch (err) {
          return handle(err);
    }
}
