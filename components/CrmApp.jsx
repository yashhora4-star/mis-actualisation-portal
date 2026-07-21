'use client';
import { useEffect, useState } from 'react';
import React from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { api } from '@/services/api';
import ActualisationSheet from '@/components/dashboard/ActualisationSheet';
import UploadPanel from '@/components/dashboard/UploadPanel';
import TeamPanel from '@/components/dashboard/TeamPanel';
import CardOwnerSummary from '@/components/dashboard/CardOwnerSummary';
import BankTransferSummary from '@/components/dashboard/BankTransferSummary';

export default function CrmApp() {
      const [boot, setBoot] = useState(null);
      const [active, setActive] = useState('sheet');
      const [month, setMonth] = useState('');
      const [loading, setLoading] = useState(true);
      const [err, setErr] = useState('');
      const [activePackage, setActivePackage] = useState('All');

  async function loadBootstrap() {
          try {
                    const data = await api('/api/bootstrap');
                    setBoot(data);
          } catch (e) {
                    setErr(e.message);
          } finally {
                    setLoading(false);
          }
  }

  useEffect(() => { loadBootstrap(); }, []);

  const role = boot?.profile?.role;
      const seesAllStudents = !!boot?.profile?.sees_all_students;
      const isMisPoc = !!boot?.profile?.is_mis_poc;
      const allPackages = !!boot?.accessScope?.allPackages;
      const myPackages = boot?.accessScope?.packages || [];

  // Default the active package tab once we know who's signed in: full
  // package access starts on "All packages", a package-scoped person starts
  // on the first (and, usually, only) package assigned to them in Team
  // access - there's no "All" option for them to land on instead.
  useEffect(() => {
        if (!boot) return;
        if (allPackages) setActivePackage('All');
        else if (myPackages.length) setActivePackage(myPackages[0]);
      }, [boot]);

  if (loading) return React.createElement('div', { className: 'content' }, 'Loading...');
      if (err) return React.createElement('div', { className: 'content error-text' }, err);

      // Superadmin always has full MIS write access; a regular member only gets it
      // if flagged as an MIS POC (add/edit/delete students, record payments).
      // Servicing (ticking services) stays available to every active member,
      // except an Accounts POC (sees_all_students) - that role is view-only:
      // full visibility across every student and package, but no ticking.
      const canWrite = role === 'superadmin' || isMisPoc;
      const canTickServices = role === 'superadmin' || !seesAllStudents;
      const pendingCount = (boot?.pendingActualisation?.cardTransactions || 0) + (boot?.pendingActualisation?.servicingLines || 0);

  return React.createElement('div', { className: 'app' },
                                 React.createElement(Sidebar, {
                                       active, onChange: setActive, role, pendingCount, seesAllStudents,
                                       allPackages, myPackages, activePackage, onPackageChange: setActivePackage,
                                 }),
                                 React.createElement('div', { className: 'main' },
                                                           React.createElement(Topbar, { active, month, onMonthChange: setMonth, months: boot?.months }),
                                                           React.createElement('div', { className: 'content' },
                                                                                       active === 'sheet' && React.createElement(ActualisationSheet, { month, role, canWrite, canTickServices, activePackage }),
                                                                                       active === 'cardowners' && (role === 'superadmin' || seesAllStudents) && React.createElement(CardOwnerSummary),
                                                                                       active === 'banktransfers' && (role === 'superadmin' || seesAllStudents) && React.createElement(BankTransferSummary),
                                                                                       active === 'upload' && role === 'superadmin' && React.createElement(UploadPanel, { onUploaded: loadBootstrap }),
                                                                                       active === 'team' && role === 'superadmin' && React.createElement(TeamPanel)
                                                                                     )
                                                         )
                               );
}
