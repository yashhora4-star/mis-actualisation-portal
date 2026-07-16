'use client';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const TITLES = {
    sheet: 'Actualisation sheet',
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

  return (
        <div className="topbar">
              <h1>{TITLES[active] || 'Dashboard'}</h1>h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <select className="cat-select" value={month || ''} onChange={(e) => onMonthChange(e.target.value)}>
                                <option value="">All months</option>option>
                        {(months || []).map((m) => (
                      <option key={m} value={m}>{m}</option>option>
                    ))}
                      </select>select>
                      <span className="meta">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>span>
                      <button className="btn" onClick={signOut}>Sign out</button>button>
              </div>div>
        </div>div>
      );
}
</div>
