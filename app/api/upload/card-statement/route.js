import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getProfile, requireRole, CAN_WRITE } from '@/utils/roles';
import { ok, handle } from '@/utils/http';
import { parseCardStatementWorkbook } from '@/lib/parsers/parseCardStatement';
import { getCategoryIdMap } from '@/lib/db-helpers';

export async function POST(request) {
    try {
          const supabase = await getSupabaseServer();
          const user = await requireUser(supabase);
          const profile = await getProfile(supabase, user.id);
          requireRole(profile, CAN_WRITE);

      const form = await request.formData();
          const file = form.get('file');
          if (!file) return handle({ message: 'file is required', status: 400 });

      const buffer = new Uint8Array(await file.arrayBuffer());
          const { transactions } = parseCardStatementWorkbook(buffer);

      const admin = getSupabaseAdmin();
          const categoryMap = await getCategoryIdMap(admin);

      const stpCodes = [...new Set(transactions.map((t) => t.stp_code).filter(Boolean))];
          const { data: students } = await admin
            .from('students')
            .select('id, stp_code')
            .in('stp_code', stpCodes.length ? stpCodes : ['__none__']);
          const stpToStudentId = Object.fromEntries((students || []).map((s) => [s.stp_code, s.id]));

      const rowsToInsert = transactions.map((t) => ({
              bank_reference: t.bank_reference,
              card_holder: t.card_holder,
              transaction_date: t.transaction_date,
              posting_date: t.posting_date,
              merchant_name: t.merchant_name,
              student_id: stpToStudentId[t.stp_code] || null,
              stp_code: t.stp_code,
              sale_month: t.sale_month,
              purpose: t.purpose,
              package: t.package,
              product_tag: t.product_tag,
              category_id: categoryMap[t.category_id_hint] || null,
              net_amount: t.net_amount,
              tax_amount: t.tax_amount,
              amount: t.amount,
              currency: t.currency,
              source_bank: t.source_bank,
              statement_date: t.statement_date,
              uploaded_by: user.id,
      }));

      const { error: insErr } = await admin
            .from('card_transactions')
            .upsert(rowsToInsert, { onConflict: 'bank_reference' });
          if (insErr) throw insErr;

      await admin.from('upload_batches').insert({
              sheet_type: 'card_statement',
              file_name: file.name,
              row_count: rowsToInsert.length,
              uploaded_by: user.id,
      });

      const unmatched = rowsToInsert.filter((r) => !r.student_id).length;
          return ok({ inserted: rowsToInsert.length, unmatchedToStudent: unmatched });
    } catch (err) {
          return handle(err);
    }
}
