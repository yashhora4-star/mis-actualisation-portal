'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const TITLES = {
      sheet: 'Actualisation sheet',
      cardowners: 'Card owner summary',
      upload: 'Upload monthly sheets',
      team: 'Team access',
};

export default function Topbar({ active, month, onMonthChange, months }) {
      const router = useRouter();

  async function signOut() {
          const supabase = getSupabaseBrowser();
          await supabase.auth.signOut();
          router.push('/login');
          router.refresh();
  }

  const monthOptions = [
          React.createElement('option', { key: 'all', value: '' }, 'All months'),
          ...(months || []).map((m) => React.createElement('option', { key: m, value: m }, m)),
        ];

  return React.createElement('div', { className: 'topbar' },
                                 React.createElement('h1', null, TITLES[active] || 'Dashboard'),
                                 React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
                                                           React.createElement('select', {
                                                                       className: 'cat-select',
                                                                       value: month || '',
                                                                       onChange: (e) => onMonthChange(e.target.value),
                                                           }, monthOptions),
                                                           React.createElement('span', { className: 'meta' },
                                                                                       new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                                                     ),
                                                           React.createElement('button', { className: 'btn', onClick: signOut }, 'Sign out')
                                                         )
                               );
}
