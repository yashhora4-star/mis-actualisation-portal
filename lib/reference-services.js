/**
 * Best-effort guess of which reference_services package_key applies to a
 * student - drives which service checklist shows up for them. Superadmin
 * can always correct this per-student in the UI; this just picks a sane
 * starting point so nobody has to set it manually for every row.
 *
 * The package_key IS the package name itself, exactly as it should appear as
 * a row's package_key in reference_services - no separate invented codes
 * like "AC_ITALY". L1E2E is the one exception: the sheet's Package column
 * just says "L1E2E" for every tier, so that still needs a synthetic
 * per-tier key resolved from the sale amount.
 */

// The display names shown across the app (package dropdown on Add/Edit
// student, Team access package-scoping checkboxes, and the sidebar's
// Actualisation Sheet tabs) - kept in one place so all three stay in sync.
// These are also, now, the literal package_key values reference_services
// rows should be keyed by (Italy, Germany, MBBS, VAS, Ausbildung, OEC, IVY,
// France) - see the note above.
export const PACKAGE_OPTIONS = ['L1E2E', 'Italy', 'Germany', 'MBBS', 'VAS', 'Ausbildung', 'OEC', 'IVY', 'France'];

// E2E tiers, keyed by their approximate MSP (total sale amount) from the
// Package_Cost_-_AC-E2E.xlsx sheet. Used to guess which of the 11 tiers a
// given L1E2E student is on when the sheet's Package column just says "L1E2E".
const E2E_TIER_MSP = [
  { key: 'E2E_1', msp: 465000 },
  { key: 'E2E_2', msp: 520000 },
  { key: 'E2E_3', msp: 605000 },
  { key: 'E2E_4', msp: 695000 },
  { key: 'E2E_5', msp: 750000 },
  { key: 'E2E_6', msp: 830000 },
  { key: 'E2E_7', msp: 630000 },
  { key: 'E2E_8', msp: 700000 },
  { key: 'E2E_9', msp: 360000 },
  { key: 'E2E_10', msp: 450000 },
  { key: 'E2E_11', msp: 21500 },
];
const E2E_TIER_MATCH_TOLERANCE = 0.08;

export function resolvePackageKey(packageField, totalSaleAmount) {
  const pkg = String(packageField || '').trim();
  if (!pkg) return null;
  const lower = pkg.toLowerCase();

  if (lower.includes('l1e2e') || lower.includes('leverage one') || lower === 'e2e') {
    if (totalSaleAmount) {
      for (const tier of E2E_TIER_MSP) {
        const diff = Math.abs(totalSaleAmount - tier.msp) / tier.msp;
        if (diff <= E2E_TIER_MATCH_TOLERANCE) return tier.key;
      }
    }
    return 'E2E_CUSTOM';
  }

  // Normalize to the canonical spelling used everywhere else in the app if
  // this matches a known package case-insensitively (e.g. sheet says
  // "germany" or "Germany " -> canonical "Germany"); otherwise trust the
  // sheet's own text as the key untouched, rather than inventing anything.
  const known = PACKAGE_OPTIONS.find((opt) => opt.toLowerCase() === lower);
  return known || pkg;
}

export const ALL_PACKAGE_KEYS = [
  ...PACKAGE_OPTIONS.filter((p) => p !== 'L1E2E'),
  'E2E_1', 'E2E_2', 'E2E_3', 'E2E_4', 'E2E_5', 'E2E_6', 'E2E_7', 'E2E_8', 'E2E_9', 'E2E_10', 'E2E_11',
  'E2E_CUSTOM',
];

// Packages where a student's service checklist is a hand-picked subset of the
// catalog (set via the Add/Edit student allocation picker) rather than every
// fixed-cost catalog row automatically applying. Explicitly scoped to
// Germany, Italy, every E2E tier, France, OEC, and Ausbildung - VAS
// (accommodation/application fee vary per booking) and MBBS/IVY stay on the
// original "every catalog service counts" behavior.
const ALLOCATION_ENABLED_PACKAGE_PREFIXES = ['E2E'];
const ALLOCATION_ENABLED_PACKAGES = ['Germany', 'Italy', 'France', 'OEC', 'Ausbildung'];

export function usesServiceAllocation(packageKey) {
  if (!packageKey) return false;
  if (ALLOCATION_ENABLED_PACKAGE_PREFIXES.some((prefix) => packageKey.startsWith(prefix))) return true;
  return ALLOCATION_ENABLED_PACKAGES.includes(packageKey);
}
