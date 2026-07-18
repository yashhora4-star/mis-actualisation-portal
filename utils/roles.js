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
    .from('users').select('id, role, name, active, sees_all_students').eq('id', userId).single();
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

// Country-based access scope for POC members. Superadmins and anyone flagged
// sees_all_students (the Accounts POC) see every student on the portal;
// everyone else is limited to the countries explicitly assigned to them in
// Team access, and sees nothing if none are assigned yet.
export async function getAccessScope(supabase, profile) {
  if (!profile) return { allCountries: false, countries: [] };
  if (profile.role === 'superadmin' || profile.sees_all_students) {
    return { allCountries: true, countries: [] };
  }
  const { data } = await supabase
    .from('user_country_access')
    .select('country')
    .eq('user_id', profile.id);
  return { allCountries: false, countries: (data || []).map((r) => r.country) };
}

export function isAllowedCountry(scope, country) {
  if (!scope) return false;
  if (scope.allCountries) return true;
  return !!country && scope.countries.includes(country);
}
