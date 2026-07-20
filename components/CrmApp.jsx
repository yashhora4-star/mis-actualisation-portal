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

  if (loading) return React.createElement('div', { className: 'content' }, 'Loading...');
      if (err) return React.createElement('div', { className: 'content error-text' }, err);

  const role = boot?.profile?.role;
      const seesAllStudents = !!boot?.profile?.sees_all_students;
      // Superadmin always has full MIS write access; a regular member only gets it
      // if flagged as an MIS POC (add/edit/delete students, record payments).
      // Servicing (ticking services) stays available to every active member,
      // except an Accounts POC (sees_all_students) - that role is view-only:
      // full visibility across every student and country, but no ticking.
      const canWrite = role === 'superadmin' || !!boot?.profile?.is_mis_poc;
      const canTickServices = role === 'superadmin' || !seesAllStudents;
      const pendingCount = (boot?.pendingActualisation?.cardTransactions || 0) + (boot?.pendingActualisation?.servicingLines || 0);

  return React.createElement('div', { className: 'app' },
                                 React.createElement(Sidebar, { active, onChange: setActive, role, pendingCount, seesAllStudents }),
                                 React.createElement('div', { className: 'main' },
                                                           React.createElement(Topbar, { active, month, onMonthChange: setMonth, months: boot?.months }),
                                                           React.createElement('div', { className: 'content' },
                                                                                       active === 'sheet' && React.createElement(ActualisationSheet, { month, role, canWrite, canTickServices }),
                                                                                       active === 'cardowners' && (role === 'superadmin' || seesAllStudents) && React.createElement(CardOwnerSummary),
                                                                                       active === 'banktransfers' && (role === 'superadmin' || seesAllStudents) && React.createElement(BankTransferSummary),
                                                                                       active === 'upload' && role === 'superadmin' && React.createElement(UploadPanel, { onUploaded: loadBootstrap }),
                                                                                       active === 'team' && role === 'superadmin' && React.createElement(TeamPanel)
                                                                                     )
                                                         )
                               );
}
