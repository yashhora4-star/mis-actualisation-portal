'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { api } from '@/services/api';
import ActualisationSheet from '@/components/dashboard/ActualisationSheet';
import UploadPanel from '@/components/dashboard/UploadPanel';
import TeamPanel from '@/components/dashboard/TeamPanel';

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

  if (loading) return <div className="content">Loading...</div>div>;
    if (err) return <div className="content error-text">{err}</div>div>;
  
    const role = boot?.profile?.role;
    const pendingCount = (boot?.pendingActualisation?.cardTransactions || 0) + (boot?.pendingActualisation?.servicingLines || 0);
  
    return (
          <div className="app">
                <Sidebar active={active} onChange={setActive} role={role} pendingCount={pendingCount} />
                <div className="main">
                        <Topbar active={active} month={month} onMonthChange={setMonth} months={boot?.months} />
                        <div className="content">
                          {active === 'sheet' && <ActualisationSheet month={month} role={role} />}
                          {active === 'upload' && role === 'superadmin' && <UploadPanel onUploaded={loadBootstrap} />}
                          {active === 'team' && role === 'superadmin' && <TeamPanel />}
                        </div>div>
                </div>div>
          </div>div>
        );
}
</div>
