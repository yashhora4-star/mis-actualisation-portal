/**
 * Best-effort guess of which reference_services package_key applies to a
 * student â drives which service checklist shows up for them. Superadmin
 * can always correct this per-student in the UI; this just picks a sane
 * starting point so nobody has to set it manually for every row.
 */

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
  const pkg = String(packageField || '').trim().toLowerCase();

  if (pkg.includes('italy')) return 'AC_ITALY';
  if (pkg.includes('germany')) return 'AC_GERMANY';
  if (pkg.includes('mbbs')) return 'AC_MBBS';
  if (pkg.includes('vas')) return 'VAS';
  if (pkg.includes('oec')) return 'AC_OEC';
  if (pkg.includes('ausbildung')) return 'AC_AUSBILDUNG';
  if (pkg.includes('france')) return 'AC_FRANCE';

  if (pkg.includes('l1e2e') || pkg.includes('leverage one') || pkg.includes('e2e')) {
    if (totalSaleAmount) {
      for (const tier of E2E_TIER_MSP) {
        const diff = Math.abs(totalSaleAmount - tier.msp) / tier.msp;
        if (diff <= E2E_TIER_MATCH_TOLERANCE) return tier.key;
      }
    }
    return 'E2E_CUSTOM';
  }

  return null;
}

export const ALL_PACKAGE_KEYS = [
  'AC_ITALY', 'AC_GERMANY', 'AC_MBBS', 'VAS', 'AC_OEC', 'AC_AUSBILDUNG', 'AC_FRANCE',
  'E2E_1', 'E2E_2', 'E2E_3', 'E2E_4', 'E2E_5', 'E2E_6', 'E2E_7', 'E2E_8', 'E2E_9', 'E2E_10', 'E2E_11',
  'E2E_CUSTOM',
];

// The display names shown across the app (package dropdown on Add/Edit
// student, Team access package-scoping checkboxes, and the sidebar's
// Actualisation Sheet tabs) - kept in one place so all three stay in sync.
export const PACKAGE_OPTIONS = ['L1E2E', 'Italy', 'Germany', 'MBBS', 'VAS', 'Ausbildung', 'OEC', 'IVY', 'France'];
