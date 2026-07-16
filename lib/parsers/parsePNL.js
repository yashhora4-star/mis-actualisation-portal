import * as XLSX from 'xlsx';
import { normalizeHeader, categoryCodeForHeader } from '@/lib/categories';

const HEADER_ROW = 4;

function buildHeaderIndex(headerRow) {
    const map = {};
    headerRow.forEach((h, i) => {
          const norm = normalizeHeader(h);
          if (norm && map[norm] === undefined) map[norm] = i;
    });
    return map;
}
function findExact(headerRow, targetNorm) {
    for (let i = 0; i < headerRow.length; i++) {
          if (normalizeHeader(headerRow[i]) === targetNorm) return i;
    }
    return -1;
}
function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {Uint8Array} fileBuffer
 * @param {string} month
 * @returns {{ student, pnl_record, servicingLines }[]}
 */
export function parsePNLWorkbook(fileBuffer, month) {
    const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
    const sheet = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const headerRow = rows[HEADER_ROW - 1];
    const idx = buildHeaderIndex(headerRow);

  const stripeIdx = findExact(headerRow, 'stripe consolidated amount');
    const pineLabsIdx = findExact(headerRow, 'pine labs consolidated amount');
    const service1Idx = findExact(headerRow, 'service 1');
    const totalCashFinalIdx = (() => {
          let last = -1;
          headerRow.forEach((h, i) => { if (normalizeHeader(h) === 'total cash in bank') last = i; });
          return last;
    })();

  const results = [];

  for (let r = HEADER_ROW; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row[idx['student name']]) continue;
        const stp = row[idx['stp codes']];
        if (!stp) continue;

      const student = {
              stp_code: String(stp).trim(),
              student_name: String(row[idx['student name']]).trim(),
              email: row[idx['student levergae email id']] || null,
              country: row[idx['country']] || null,
              package: row[idx['package']] || null,
      };

      const servicingLines = [];
        if (service1Idx !== -1) {
                for (let seq = 0; seq < 15; seq++) {
                          const svcCol = service1Idx + seq * 2;
                          const amtCol = svcCol + 1;
                          const svcName = row[svcCol];
                          const amount = row[amtCol];
                          if (!svcName || !amount) continue;
                          servicingLines.push({
                                      category_code: categoryCodeForHeader(svcName) || null,
                                      raw_label: svcName,
                                      amount: num(amount),
                          });
                }
        }

      results.push({
              student,
              pnl_record: {
                        month,
                        payout_amount: num(row[idx['payout amount']]),
                        payout_purpose: row[idx['payout purpose']] || null,
                        total_sale_amount: num(row[idx['total sale amount']]),
                        stripe_consolidated: num(row[stripeIdx]),
                        stripe_charges: num(row[stripeIdx + 1]),
                        stripe_net: num(row[stripeIdx + 2]),
                        pinelabs_consolidated: num(row[pineLabsIdx]),
                        pinelabs_charges: num(row[pineLabsIdx + 1]),
                        pinelabs_net: num(row[pineLabsIdx + 2]),
                        loan_amount: num(row[idx['loan amount (rs)']]),
                        loan_amount_after_subvention: num(row[idx['loan amount after deducting subvention (rs)']]),
                        indian_bank_transfer: num(row[idx['indian bank transfer (rs)']]),
                        gst: num(row[idx['gst (rs)']]),
                        net_amount_indian: num(row[idx['net amount in indian account (rs)']]),
                        stripe_gbp: num(row[idx['stripe - gbp']]),
                        pinelabs_gbp: num(row[idx['pine labs - gbp']]),
                        bank_transfer_gbp: num(row[idx['bank transfer - gbp']]),
                        net_amount_gbp: num(row[idx['net amount in gbp']]),
                        gbp_rate: num(row[idx['gbp rate']]),
                        net_amount_inr: num(row[idx['net amount in inr (rs)']]),
                        total_cash_in_bank: num(row[totalCashFinalIdx]),
                        approved: row[idx['approved']] ? String(row[idx['approved']]).toLowerCase().startsWith('y') : null,
                        approved_amount: num(row[idx['approved amount']]),
                        approved_by: row[idx['approved by']] || null,
                        notes: row[idx['notes']] || null,
                        tentative_cost_of_services: num(row[idx['tentative cost of the services']]),
                        margin: num(row[idx['margin']]),
                        margin_pct: num(row[idx['margin %']]),
              },
              servicingLines,
      });
  }

  return results;
}
