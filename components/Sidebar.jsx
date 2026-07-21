'use client';
import React, { useState } from 'react';
import { PACKAGE_OPTIONS } from '@/lib/reference-services';

// `fullAccessOnly` = superadmin or the Accounts POC (sees_all_students) - a
// package-scoped POC/service-team member only ever gets the Actualisation
// Sheet, per the "nothing else on the portal" requirement for package-level
// access.
const NAV = [
  { key: 'sheet', label: 'Actualisation Sheet' },
  { key: 'cardowners', label: 'Card owner summary', fullAccessOnly: true },
  { key: 'banktransfers', label: 'Bank transfer summary', fullAccessOnly: true },
  { key: 'upload', label: 'Upload sheets', superadminOnly: true },
  { key: 'team', label: 'Team access', superadminOnly: true },
  ];

export default function Sidebar({ active, onChange, role, pendingCount, seesAllStudents, allPackages, myPackages, activePackage, onPackageChange }) {
    const [collapsed, setCollapsed] = useState(false);
    const [sheetExpanded, setSheetExpanded] = useState(true);
    // Card owner / Bank transfer summary stay gated to superadmin and the
    // Accounts POC specifically - an MIS POC gets unrestricted student data
    // (see allPackages below) but not those two extra nav items.
    const fullAccess = role === 'superadmin' || !!seesAllStudents;

  // Full package visibility (superadmin, Accounts POC, or an MIS POC) gets
  // "All packages" plus every individual package tab to drill into. A scoped
  // person only gets tabs for the package(s) actually assigned to them in
  // Team access - and if that's just one package, there's nothing to switch
  // between, so no tabs at all; their Actualisation Sheet is just quietly
  // filtered to that one package.
  const packageTabs = allPackages
        ? ['All', ...PACKAGE_OPTIONS]
        : (myPackages || []);
  const showPackageTabs = packageTabs.length > 1;

  const items = NAV
        .filter((n) => !n.superadminOnly || role === 'superadmin')
        .filter((n) => !n.fullAccessOnly || fullAccess)
        .map((item, i) => {
              const isSheet = item.key === 'sheet';
              return React.createElement('div', { key: item.key },
                    React.createElement('div', {
                          className: 'nav-item ' + (active === item.key ? 'active' : ''),
                          title: item.label,
                          onClick: () => {
                                onChange(item.key);
                                if (isSheet && showPackageTabs) setSheetExpanded((v) => !v);
                          },
                    },
                          React.createElement('span', { className: 'num' }, String(i + 1).padStart(2, '0')),
                          !collapsed && React.createElement('span', { style: { flex: 1 } }, item.label),
                          !collapsed && isSheet && pendingCount > 0
                            ? React.createElement('span', { className: 'badge' }, pendingCount)
                            : null,
                          !collapsed && isSheet && showPackageTabs
                            ? React.createElement('span', {
                                    style: { fontSize: 11, opacity: 0.6, marginLeft: 6 },
                              }, sheetExpanded ? String.fromCharCode(9662) : String.fromCharCode(9656))
                            : null
                    ),
                    !collapsed && isSheet && showPackageTabs && sheetExpanded
                      ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', margin: '4px 0 4px 26px', gap: 1 } },
                              packageTabs.map((pkg) => React.createElement('div', {
                                    key: pkg,
                                    onClick: () => { onChange('sheet'); onPackageChange(pkg); },
                                    style: {
                                          padding: '6px 8px',
                                          borderRadius: 6,
                                          fontSize: '12.5px',
                                          cursor: 'pointer',
                                          background: activePackage === pkg ? 'rgba(255,255,255,0.12)' : 'transparent',
                                          color: activePackage === pkg ? '#fff' : '#c7ccd6',
                                    },
                              }, pkg === 'All' ? 'All packages' : pkg))
                            )
                      : null
              );
        });

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
