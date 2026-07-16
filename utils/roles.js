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
      .from('users').select('id, role, name, active').eq('id', userId).single();
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
