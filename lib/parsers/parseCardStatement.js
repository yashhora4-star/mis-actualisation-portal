import * as XLSX from 'xlsx';
import { normalizeHeader, categoryCodeForHeader } from '@/lib/categories';

function buildHeaderIndex(headerRow) {
    const map = {};
    headerRow.forEach((h, i) => {
          const norm = normalizeHeader(h);
          if (norm && map[norm] === undefined) map[norm] = i;
    });
    return map;
}
function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function toDateStr(v) {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return v;
}

/**
 * Parses every tab in the workbook (one tab per card/account - "HSBC ...",
 * "RBL ..."). Tabs may have different column sets; anything missing is
 * stored as null rather than failing the whole import. source_bank is
 * derived from the first word of the tab name.
 *
 * @param {Uint8Array} fileBuffer
 * @returns {{ transactions: [] }}
 */
export function parseCardStatementWorkbook(fileBuffer) {
    const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
    const transactions = [];

  for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
        if (!rows.length) continue;
        const headerRow = rows[0];
        const idx = buildHeaderIndex(headerRow);
        const sourceBank = sheetName.trim().split(/\s+/)[0].toUpperCase();

      for (let r = 1; r < rows.length; r++) {
              const row = rows[r];
              if (!row) continue;
              const studentName = row[idx['student name']];
              const stp = row[idx['stp']];
              if (!studentName && !stp) continue;

          const bankRef = row[idx['bank reference']] || `${sourceBank}-${sheetName}-${r}`;
              const purpose = row[idx['purpose']] || null;

          transactions.push({
                    bank_reference: String(bankRef).trim(),
                    card_holder: row[idx['first name']] || null,
                    transaction_date: toDateStr(row[idx['transaction date']]),
                    posting_date: toDateStr(row[idx['posting date']]),
                    merchant_name: row[idx['merchant name']] || null,
                    stp_code: stp ? String(stp).trim() : null,
                    student_name: studentName ? String(studentName).trim() : null,
                    email: row[idx['leverage mail']] || null,
                    sale_month: toDateStr(row[idx['sale month']]),
                    purpose,
                    package: row[idx['package']] || null,
                    product_tag: row[idx['product - ac / vas']] || null,
                    category_id_hint: purpose ? categoryCodeForHeader(purpose) : null,
                    net_amount: num(row[idx['net amount']]),
                    tax_amount: num(row[idx['tax amount']]),
                    amount: num(row[idx['amount']]),
                    currency: row[idx['currency']] || null,
                    source_bank: sourceBank,
                    statement_date: toDateStr(row[idx['statement date']]),
          });
      }
  }

  return { transactions };
}
