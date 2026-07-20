import * as XLSX from 'xlsx';
import { normalizeHeader, categoryCodeForHeader, isSubtotalHeader } from '@/lib/categories';

const HEADER_ROW = 4; // 1-based row in the sheet ("Month", "Student Name", ...)
const NAMED = {
  studentName: 'student name',
  email: 'student levergae email id',
  stp: 'stp codes',
  country: 'country',
  package: 'package',
  productTag: 'product - ac / vas',
  totalSale: 'total sale amount',
  collected: 'collected',
  outstanding: 'outstanding',
  indianBank: 'indian bank amount',
  ukBank: 'uk bank amount',
  gbpAnchor: 'gbp amount',
  totalRevenueAnchor: 'total revenue',
  totalReceivedExact: 'total amount received',
  totalCostOfServices: 'total cost of the services',
  subvention: 'subvention',
  gst: 'gst',
  marginInclGst: 'total margin inclusive gst',
  marginExclGst: 'total margin exclusive gst',
  marginExclSubventionGst: 'total margin excluding subvention & gst',
  pay1Amount: 'pay id 1 amount',
};

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

// The MIS tab's exact name drifts between workbooks - sometimes "MIS",
// sometimes "MIS Sheet", "MIS Data", "April MIS", etc, and sometimes the
// month/backfill file only has a single sheet with an entirely different
// name. Rather than require an exact "MIS" match, prefer that exact name
// if present, otherwise any sheet whose name contains "mis", otherwise -
// if the workbook only has one sheet at all - just use that one.
function findMisSheetName(workbook) {
  const names = workbook.SheetNames || [];
  const exact = names.find((n) => n.trim().toLowerCase() === 'mis');
  if (exact) return exact;
  const contains = names.find((n) => n.toLowerCase().includes('mis'));
  if (contains) return contains;
  if (names.length === 1) return names[0];
  return null;
}

/**
 * @param {Uint8Array} fileBuffer
 * @param {string} month - reporting month label, e.g. "June 2026"
 * @returns {{ students: [], misRecords: [] }}
 */
export function parseMISWorkbook(fileBuffer, month) {
  const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const sheetName = findMisSheetName(wb);
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new Error(
      `Sheet named "MIS" not found in workbook (available sheets: ${(wb.SheetNames || []).join(', ') || 'none'})`
    );
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRow = rows[HEADER_ROW - 1];
  const idx = buildHeaderIndex(headerRow);

  // The GBP/Stripe anchor column is sometimes labelled "GBP amount" and
  // sometimes "Stripe GBP" depending on the month, but it always sits
  // immediately after the (misspelled) "Total Amount Recived" running-total
  // column and immediately before the revenue-breakdown columns start.
  // Rather than hardcode every alias that shows up, locate it positionally
  // so a future rename doesn't break the upload again.
  let gbpIdx = idx[NAMED.gbpAnchor];
  if (gbpIdx === undefined) {
    const preGbpIdx = findExact(headerRow, 'total amount recived');
    if (preGbpIdx !== -1) gbpIdx = preGbpIdx + 1;
  }
  const totalRevenueIdx = findExact(headerRow, NAMED.totalRevenueAnchor);
  const totalReceivedIdx = findExact(headerRow, NAMED.totalReceivedExact);
  const pay1Idx = idx[NAMED.pay1Amount];
  const loanPartnerIdx = findExact(headerRow, 'loan partner');

  if (gbpIdx === undefined || totalRevenueIdx === -1 || totalReceivedIdx === -1) {
    throw new Error('MIS sheet layout has changed - anchor columns (GBP amount / Total Revenue / Total Amount Received) not found');
  }

  const results = [];
  let skippedNoStp = 0;

  for (let r = HEADER_ROW; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[idx[NAMED.studentName]]) continue;

    const stp = row[idx[NAMED.stp]];
    if (!stp) { skippedNoStp++; continue; }

    const student = {
      stp_code: String(stp).trim(),
      student_name: String(row[idx[NAMED.studentName]]).trim(),
      email: row[idx[NAMED.email]] || null,
      country: row[idx[NAMED.country]] || null,
      package: row[idx[NAMED.package]] || null,
    };

    const productTag = row[idx[NAMED.productTag]] || null;

    const revenueLines = [];
    for (let c = gbpIdx + 1; c < totalRevenueIdx; c++) {
      const header = headerRow[c];
      const amount = row[c];
      if (amount == null || amount === '' || isSubtotalHeader(header)) continue;
      const numAmount = Number(amount);
      if (!numAmount) continue;
      const code = categoryCodeForHeader(header) || 'other_costs';
      revenueLines.push({ category_code: code, amount: numAmount, raw_header: header });
    }

    const costLines = [];
    for (let c = totalRevenueIdx + 1; c < totalReceivedIdx; c++) {
      const header = headerRow[c];
      const amount = row[c];
      if (amount == null || amount === '' || isSubtotalHeader(header)) continue;
      const numAmount = Number(amount);
      if (!numAmount) continue;
      const code = categoryCodeForHeader(header) || 'other_costs';
      costLines.push({ category_code: code, amount: numAmount, raw_header: header });
    }

    const paymentLines = [];
    if (pay1Idx !== undefined) {
      // Number of Pay ID blocks varies by month (7 in April, 8 in May, 12
      // in June/July). Stop once we'd read past the Loan Partner columns,
      // otherwise loan data gets misread as extra payment lines.
      const paymentEndIdx = loanPartnerIdx !== -1 ? loanPartnerIdx : headerRow.length;
      for (let seq = 1; seq <= 12; seq++) {
        const base = pay1Idx + (seq - 1) * 4;
        if (base >= paymentEndIdx) break;
        const amount = row[base];
        if (!amount) continue;
        paymentLines.push({
          seq,
          amount: Number(amount),
          pay_ref: row[base + 1] || null,
          pay_date: row[base + 2] || null,
          mode: row[base + 3] || null,
        });
      }
    }

    results.push({
      student,
      mis_record: {
        month,
        product_tag: productTag,
        total_sale_amount: num(row[idx[NAMED.totalSale]]),
        collected: num(row[idx[NAMED.collected]]),
        outstanding: num(row[idx[NAMED.outstanding]]),
        indian_bank_amount: num(row[idx[NAMED.indianBank]]),
        uk_bank_amount: num(row[idx[NAMED.ukBank]]),
        total_amount_received: num(row[totalReceivedIdx]),
        subvention: num(row[idx[NAMED.subvention]]),
        gst: num(row[idx[NAMED.gst]]),
        total_margin_incl_gst: num(row[idx[NAMED.marginInclGst]]),
        total_margin_excl_gst: num(row[idx[NAMED.marginExclGst]]),
        total_margin_excl_subvention_gst: num(row[idx[NAMED.marginExclSubventionGst]]),
      },
      revenueLines,
      costLines,
      paymentLines,
    });
  }

  // Rows with a student name but no STP code can't be matched/upserted
  // (stp_code is the unique key), so they're silently dropped above. Surface
  // the count so uploads don't look like they "lost" students - stash it as
  // a property on the array rather than changing the return shape, since
  // both callers (upload/mis and sheet-sync routes) treat this as a plain array.
  results.skippedNoStp = skippedNoStp;
  return results;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
