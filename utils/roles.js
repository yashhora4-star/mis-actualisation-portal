/** Role constants used by API-route authorization checks. */
export const ROLES = {
  SUPERADMIN: 'superadmin',
  MEMBER: 'member',
};

/** Roles allowed to upload sheets / add students / write structural records. */
export const CAN_WRITE = new Set(['superadmin']);

/** Roles allowed to unlock or change an already-locked service tick. */
export const CAN_OVERRIDE_LOCK = new Set(['superadmin']);

export async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('users').select('id, role, name, active, sees_all_students, is_mis_poc').eq('id', userId).single();
  if (error || !data) return null;
  return data;
}

export function requireRole(profile, allowedSet) {
  if (!profile || !profile.active || !allowedSet.has(profile.role)) {
    const e = new Error('Not authorized for this action');
    e.status = 403;
    throw e;
  }
}

// Two independent things determine what a member can do:
// - servicing: every active member can tick services on the checklist (no flag needed),
//   except an Accounts POC (sees_all_students) - that role is view-only across the board.
// - MIS write access: adding/editing/deleting students, editing sale/collected/outstanding,
//   and recording payments - superadmin always has this, and a member can be flagged as
//   an "MIS POC" to get it too, without being handed the superadmin-only stuff
//   (sheet upload, team management).
export function canWriteMis(profile) {
  return !!profile && !!profile.active && (profile.role === 'superadmin' || !!profile.is_mis_poc);
}

export function requireMisWrite(profile) {
  if (!canWriteMis(profile)) {
    const e = new Error('Not authorized for this action');
    e.status = 403;
    throw e;
  }
}

// Access is scoped by package, not country - a student's `package` field
// (Italy, Germany, Ausbildung, L1E2E, etc) is what's actually populated on
// every real record, whereas `country` has never been filled in, so scoping
// by country left every restricted member unable to see anyone at all.
export async function getAccessScope(supabase, profile) {
  if (!profile) return { allPackages: false, packages: [] };
  // MIS POCs can already add/edit/delete students and record payments in any
  // package - requireMisWrite has no package check - so restricting what they
  // could *see* by package left them unable to find their own newly-added
  // students unless a superadmin separately whitelisted that exact package.
  // Read access now matches the write access they already have.
  if (profile.role === 'superadmin' || profile.sees_all_students || profile.is_mis_poc) {
    return { allPackages: true, packages: [] };
  }
  const { data } = await supabase.from('user_package_access').select('package').eq('user_id', profile.id);
  return { allPackages: false, packages: (data || []).map((r) => r.package) };
}

export function isAllowedPackage(scope, pkg) {
  if (!scope) return false;
  if (scope.allPackages) return true;
  return !!pkg && scope.packages.includes(pkg);
}
