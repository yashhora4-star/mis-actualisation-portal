/** Writes one row to activity_log. Call with the service-role admin client. */
export async function logActivity(admin, { entityType, entityId, action, performedBy, details }) {
    await admin.from('activity_log').insert({
          entity_type: entityType,
          entity_id: entityId,
          action,
          performed_by: performedBy || null,
          details: details || null,
    });
}
