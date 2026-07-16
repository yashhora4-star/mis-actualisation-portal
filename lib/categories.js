/**
 * Single source of truth for classifying a revenue/cost line, a card
 * transaction, or a "Servicing Column" entry into a real product group -
 * AC (core admission-consulting services), VAS_ACCOMMODATION, VAS_TUITION_FEE,
 * or VAS_OTHER - instead of the old blanket rule that showed every VAS line
 * as AC because AC carried the better margin.
 *
 * Keys are normalized header/purpose text (lowercase, trimmed, collapsed
 * whitespace, currency symbols stripped). Add new aliases here as new sheet
 * headers show up; nothing else in the codebase needs to change.
 */
export function normalizeHeader(text) {
      return String(text || '')
        .toLowerCase()
        .replace(/\u20b9/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// header/purpose text -> category code (must match supabase/seed-categories.sql)
export const HEADER_TO_CATEGORY = {
      'ihs(1-2 year)': 'ihs_1_2yr',
      'ihs(3-4 year)': 'ihs_3_4yr',
      'ihs': 'ihs_1_2yr',
      'visa fee': 'visa_fee',
      'visa fees': 'visa_fee',
      'priority visa': 'priority_visa',
      'superpriority visa': 'superpriority_visa',
      'superpriority': 'superpriority_visa',
      'premium': 'premium',
      'visa slot': 'visa_slot',
      'aps': 'aps',
      'ielts': 'ielts',
      'ielts test fee': 'ielts_test_fee',
      'ielts classes': 'ielts_classes',
      'ilets class': 'ielts_classes',
      'testas': 'testas',
      'university application': 'university_app',
      'oec - application fees': 'oec_app_fee',
      'oec commissions': 'oec_commission',
      'apostile': 'apostille',
      'apostille': 'apostille',
      'apostile and translation': 'apostille_translation',
      'apostille and translation': 'apostille_translation',
      'hrd': 'hrd',
      'dov': 'dov',
      'insurance': 'insurance',
      'imat fees': 'imat_fees',
      'imat registeration': 'imat_registration',
      'imat registration': 'imat_registration',
      'mbbs otc to vendor ( usd )': 'mbbs_otc_vendor',
      'mbbs otc to vendor (usd)': 'mbbs_otc_vendor',
      'mbbs otc commission ( usd )': 'mbbs_otc_commission',
      'mbbs otc commission (usd)': 'mbbs_otc_commission',
      'mbbs commission': 'mbbs_commission',
      'application fees': 'application_fees',
      'tb test fee': 'tb_test_fee',

      'accomodation': 'accommodation',
      'accommodation': 'accommodation',

      'installment 1': 'installment_1',
      'installment 2': 'installment_2',
      'italy installment 1': 'italy_installment_1',
      'italy installment 2': 'italy_installment_2',
      'italy installment 3': 'italy_installment_3',
      'italy installment3': 'italy_installment_3',

      'flight': 'flight',
      'one way flight': 'one_way_flight',
      'bedding kit': 'bedding_kit',
      'luggage set': 'luggage_set',
      'sim card': 'sim_card',
      'career': 'career',
      'airport cab': 'airport_cab',
      'goethe a1': 'goethe_a1',
      'a1-a2 classes': 'a1_a2_classes',
      'vas': 'vas_generic',
      'other costs': 'other_costs',
      'other cost': 'other_costs',
};

export const CATEGORY_GROUP_LABELS = {
      AC: 'Admission Consulting',
      VAS_ACCOMMODATION: 'VAS - Accommodation',
      VAS_TUITION_FEE: 'VAS - Tuition Fee',
      VAS_OTHER: 'VAS - Other',
};

/** Headers that are subtotals - never insert these as line items. */
export function isSubtotalHeader(header) {
      const h = normalizeHeader(header);
      return h.startsWith('total ') || h === 'cost of the services';
}

export function categoryCodeForHeader(header) {
      const h = normalizeHeader(header);
      return HEADER_TO_CATEGORY[h] || null;
}
