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

export async function getAccessScope(supabase, profile) {
  if (!profile) return { allCountries: false, countries: [] };
  // MIS POCs can already add/edit/delete students and record payments in any
  // country - requireMisWrite has no country check - so restricting what they
  // could *see* by country left them unable to find their own newly-added
  // students unless a superadmin separately whitelisted that exact country.
  // Read access now matches the write access they already have.
  if (profile.role === 'superadmin' || profile.sees_all_students || profile.is_mis_poc) {
    return { allCountries: true, countries: [] };
  }
  const { data } = await supabase.from('user_country_access').select('country').eq('user_id', profile.id);
  return { allCountries: false, countries: (data || []).map((r) => r.country) };
}

export function isAllowedCountry(scope, country) {
  if (!scope) return false;
  if (scope.allCountries) return true;
  return !!country && scope.countries.includes(country);
}
