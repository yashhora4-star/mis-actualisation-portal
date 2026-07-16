'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';

export default function ActivityDrawer({ target, onClose }) {
    const [log, setLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

  useEffect(() => {
        api(`/api/activity-log?entity_type=${target.type}&entity_id=${target.id}`)
          .then((res) => setLog(res.log || []))
          .catch((e) => setErr(e.message))
          .finally(() => setLoading(false));
  }, [target]);

  return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 }}>
                <div style={{ width: 420, background: 'var(--surface)', height: '100%', padding: 20, overflowY: 'auto' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                      <div className="card-title" style={{ marginBottom: 0 }}>Activity - {target.label}</div>div>
                                      <button className="btn" onClick={onClose}>Close</button>button>
                          </div>div>
                  {loading && <div>Loading...</div>div>}
                  {err && <div className="error-text">{err}</div>div>}
                  {!loading && !log.length && <div className="empty-state">No activity recorded yet.</div>div>}
                  {log.map((entry) => (
                    <div key={entry.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', fontSize: 13 }}>
                                <div style={{ fontWeight: 600 }}>{entry.action}</div>div>
                                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                                  {entry.users?.name || entry.users?.email || 'Unknown'} - {new Date(entry.performed_at).toLocaleString('en-IN')}
                                </div>div>
                      {entry.details && (
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                                      {JSON.stringify(entry.details)}
                                    </div>div>
                                )}
                    </div>div>
                  ))}
                </div>div>
        </div>div>
      );
}
</div>
