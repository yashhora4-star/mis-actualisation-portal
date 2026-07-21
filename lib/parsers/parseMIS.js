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

// A much simpler, 9-column layout shows up for month-by-month backfill
// exports - Sale Month / Student Name / Student Levergae Email ID / STP /
// Package / Total Sale amount / Collected / Outstanding / Net Received on
// row 1 - with no revenue/cost/payment-line breakdown at all. Different
// shape entirely from the full monthly MIS export below, so it gets its
// own header row and column names rather than reusing NAMED/HEADER_ROW.
const MIN_HEADER_ROW = 1;
const MIN_NAMED = {
  saleMonth: 'sale month',
  studentName: 'student name',
  email: 'student levergae email id',
  stp: 'stp',
  package: 'package',
  totalSale: 'total sale amount',
  collected: 'collected',
  outstanding: 'outstanding',
  netReceived: 'net received',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function buildHeaderIndex(headerRow) {
  const map = {};
  (headerRow || []).forEach((h, i) => {
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

function looksLikeMinimalBackfill(headerRow) {
  const idx = buildHeaderIndex(headerRow);
  return (
    idx[MIN_NAMED.saleMonth] !== undefined &&
    idx[MIN_NAMED.studentName] !== undefined &&
    idx[MIN_NAMED.stp] !== undefined &&
    idx[MIN_NAMED.totalSale] !== undefined
  );
}

function monthLabelFromDate(value) {
  if (value == null || value === '') return null;

  // CSV-sourced sheets (e.g. the live Google Sheet sync) render a date cell
  // as its *display* text rather than a real date/serial - a common display
  // format here is "June-26" (month name + 2-digit year). JS's native Date
  // parser misreads that as "June 26" (day 26) with a default year of 2001,
  // which would silently file every synced row under the wrong month AND
  // wrong year. Handle "<Month name><-/space><YY or YYYY>" explicitly before
  // falling through to generic parsing below.
  if (typeof value === 'string') {
    const m = value.trim().match(/^([A-Za-z]+)[\s-]+(\d{2,4})$/);
    if (m) {
      const wanted = m[1].toLowerCase();
      const monthIdx = MONTH_NAMES.findIndex((name) => {
        const n = name.toLowerCase();
        return n === wanted || n.startsWith(wanted) || wanted.startsWith(n.slice(0, 3));
      });
      if (monthIdx !== -1) {
        let year = Number(m[2]);
        if (year < 100) year += 2000;
        return `${MONTH_NAMES[monthIdx]} ${year}`;
      }
    }
  }

  let d = value;
  if (!(d instanceof Date)) {
    const n = Number(value);
    // Excel serial date fallback - shouldn't normally hit this since the
    // sheet is read with cellDates:true, but covers a raw-number cell.
    d = Number.isFinite(n) && n > 0 ? new Date(Math.round((n - 25569) * 86400 * 1000)) : new Date(value);
  }
  if (Number.isNaN(d.getTime())) return null;
  // xlsx's own serial-to-Date conversion has a known sub-day drift that
  // depends on the runtime's local timezone (observed several hours off
  // midnight on what should be an exact calendar day - reproduced here as
  // "April 1" landing as "2026-03-31T18:29:50Z"). Since that drift's size
  // and direction depends on wherever this code happens to run (dev sandbox
  // vs Cloudflare Workers can differ), reading UTC calendar fields straight
  // off the Date is unsafe. Nudging by 12h first keeps the result on the
  // correct day/month regardless of drift, as long as it stays under 12h -
  // true of every case seen so far.
  const nudged = new Date(d.getTime() + 12 * 60 * 60 * 1000);
  return `${MONTH_NAMES[nudged.getUTCMonth()]} ${nudged.getUTCFullYear()}`;
}

function parseMinimalBackfillWorkbook(rows) {
  const headerRow = rows[MIN_HEADER_ROW - 1];
  const idx = buildHeaderIndex(headerRow);
  const results = [];
  let skippedNoStp = 0;

  for (let r = MIN_HEADER_ROW; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[idx[MIN_NAMED.studentName]]) continue;

    let stp = row[idx[MIN_NAMED.stp]];
    // Some rows carry the literal text "#N/A" instead of a real STP code (an
    // unresolved VLOOKUP left over in the source sheet) - treat that exactly
    // like a genuinely missing STP rather than upserting every one of them
    // into a single "#N/A" student and silently merging unrelated students'
    // data together.
    if (stp != null && String(stp).trim().toUpperCase() === '#N/A') stp = null;
    if (!stp) { skippedNoStp++; continue; }

    // Each row carries its own Sale Month date - a single backfill file can
    // (and does) span several months in one sheet, so the month comes from
    // this column per-row rather than from the month picked in the upload
    // dropdown.
    const month = monthLabelFromDate(row[idx[MIN_NAMED.saleMonth]]);
    if (!month) { skippedNoStp++; continue; }

    const netReceived = num(row[idx[MIN_NAMED.netReceived]]);

    results.push({
      student: {
        stp_code: String(stp).trim(),
        student_name: String(row[idx[MIN_NAMED.studentName]]).trim(),
        email: row[idx[MIN_NAMED.email]] || null,
        country: null,
        package: row[idx[MIN_NAMED.package]] || null,
      },
      mis_record: {
        month,
        product_tag: null,
        total_sale_amount: num(row[idx[MIN_NAMED.totalSale]]),
        collected: num(row[idx[MIN_NAMED.collected]]),
        outstanding: num(row[idx[MIN_NAMED.outstanding]]),
        indian_bank_amount: null,
        uk_bank_amount: null,
        total_amount_received: netReceived,
        net_amount_after_deduction: netReceived,
        subvention: null,
        gst: null,
        total_margin_incl_gst: null,
        total_margin_excl_gst: null,
        total_margin_excl_subvention_gst: null,
      },
      revenueLines: [],
      costLines: [],
      paymentLines: [],
    });
  }

  results.skippedNoStp = skippedNoStp;
  return results;
}

/**
 * @param {Uint8Array} fileBuffer
 * @param {string} month - reporting month label, e.g. "June 2026" - only used
 *   as a fallback for the full monthly layout; the minimal backfill layout
 *   below derives its own month per row instead.
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

  if (looksLikeMinimalBackfill(rows[0] || [])) {
    return parseMinimalBackfillWorkbook(rows);
  }

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
  // CSV-sourced sheets (e.g. the live Google Sheet sync) render numbers with
  // thousands separators as plain text ("200,000.00") - Number() on that
  // string is NaN, which would silently turn every sale/collected/outstanding
  // amount into null. Real xlsx uploads hand this a genuine number already,
  // so stripping commas/whitespace here is a no-op for that path.
  const cleaned = typeof v === 'string' ? v.replace(/,/g, '').trim() : v;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
