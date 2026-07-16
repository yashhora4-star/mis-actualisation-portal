/** Shared helpers used by every upload/sheet-sync route (service-role client). */

export async function getCategoryIdMap(admin) {
    const { data, error } = await admin.from('service_categories').select('id, code');
    if (error) throw error;
    const map = {};
    for (const row of data) map[row.code] = row.id;
    return map;
}

/** Upserts a student by stp_code (natural key across MIS/P&L/card sheets). */
export async function upsertStudent(admin, student) {
    const { data, error } = await admin
      .from('students')
      .upsert(
        {
                  stp_code: student.stp_code,
                  student_name: student.student_name,
                  email: student.email,
                  country: student.country,
                  package: student.package,
        },
        { onConflict: 'stp_code', ignoreDuplicates: false }
            )
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
}
