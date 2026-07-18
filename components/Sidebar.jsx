'use client';
import React, { useState } from 'react';

// `fullAccessOnly` = superadmin or the Accounts POC (sees_all_students) - a
// country-scoped POC only ever gets the Actualisation Sheet, per the
// "nothing else on the portal" requirement for country-level access.
const NAV = [
  { key: 'sheet', label: 'Actualisation Sheet' },
  { key: 'cardowners', label: 'Card owner summary', fullAccessOnly: true },
  { key: 'banktransfers', label: 'Bank transfer summary', fullAccessOnly: true },
  { key: 'upload', label: 'Upload sheets', superadminOnly: true },
  { key: 'team', label: 'Team access', superadminOnly: true },
  ];

export default function Sidebar({ active, onChange, role, pendingCount, seesAllStudents }) {
    const [collapsed, setCollapsed] = useState(false);
    const fullAccess = role === 'superadmin' || !!seesAllStudents;

  const items = NAV
        .filter((n) => !n.superadminOnly || role === 'superadmin')
        .filter((n) => !n.fullAccessOnly || fullAccess)
        .map((item, i) =>
        React.createElement('div', {
                key: item.key,
                className: 'nav-item ' + (active === item.key ? 'active' : ''),
                title: item.label,
                onClick: () => onChange(item.key),
        },
                                  React.createElement('span', { className: 'num' }, String(i + 1).padStart(2, '0')),
                                  !collapsed && React.createElement('span', null, item.label),
                                  item.key === 'sheet' && pendingCount > 0
                                    ? React.createElement('span', { className: 'badge' }, pendingCount)
                                    : null
                               )
                                                                                    );

  return React.createElement('aside', { className: 'sidebar', style: collapsed ? { width: 64 } : undefined },
                                 React.createElement('div', {
                                       className: 'sb-brand',
                                       style: { display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' },
                                 },
                                       !collapsed && React.createElement('div', null,
                                                                                 React.createElement('div', { className: 'name' }, 'MIS PORTAL'),
                                                                                 React.createElement('div', { className: 'sub' }, 'Accounts tracking')
                                                                               ),
                                       React.createElement('button', {
                                             onClick: () => setCollapsed((c) => !c),
                                             title: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
                                             style: {
                                                     background: 'rgba(255,255,255,.08)', border: 'none', color: '#c7ccd6', borderRadius: 4,
                                                     width: 24, height: 24, cursor: 'pointer', fontSize: 12, lineHeight: '24px', flexShrink: 0,
                                             },
                                       }, collapsed ? String.fromCharCode(187) : String.fromCharCode(171))
                                 ),
                                 React.createElement('nav', { className: 'nav' }, items),
                                 React.createElement('div', { className: 'sb-footer' },
                                                           !collapsed && 'Signed in as',
                                                           React.createElement('div', { className: 'role-pill' }, role === 'superadmin' ? 'Superadmin' : (seesAllStudents ? 'Accounts POC' : 'Team member'))
                                                         )
                               );
}
