'use client';
import React from 'react';

const NAV = [
  { key: 'sheet', label: 'Actualisation Sheet' },
  { key: 'upload', label: 'Upload sheets', superadminOnly: true },
  { key: 'team', label: 'Team access', superadminOnly: true },
  ];

export default function Sidebar({ active, onChange, role, pendingCount }) {
    const items = NAV.filter((n) => !n.superadminOnly || role === 'superadmin').map((item, i) =>
          React.createElement('div', {
                  key: item.key,
                  className: 'nav-item ' + (active === item.key ? 'active' : ''),
                  onClick: () => onChange(item.key),
          },
                                    React.createElement('span', { className: 'num' }, String(i + 1).padStart(2, '0')),
                                    React.createElement('span', null, item.label),
                                    item.key === 'sheet' && pendingCount > 0
                                      ? React.createElement('span', { className: 'badge' }, pendingCount)
                                      : null
                                  )
                                                                                      );

  return React.createElement('aside', { className: 'sidebar' },
                                 React.createElement('div', { className: 'sb-brand' },
                                                           React.createElement('div', { className: 'name' }, 'MIS PORTAL'),
                                                           React.createElement('div', { className: 'sub' }, 'Accounts tracking')
                                                         ),
                                 React.createElement('nav', { className: 'nav' }, items),
                                 React.createElement('div', { className: 'sb-footer' },
                                                           'Signed in as',
                                                           React.createElement('div', { className: 'role-pill' }, role === 'superadmin' ? 'Superadmin' : 'Team member')
                                                         )
                               );
}
