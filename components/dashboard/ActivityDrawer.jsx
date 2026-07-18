'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';

const ACTION_LABELS = {
  ticked: 'Marked as done',
  unticked: 'Marked as not done',
  updated: 'Details updated',
  overridden: 'Edited by superadmin',
  locked: 'Locked',
  proof_uploaded: 'Payment details added',
  created: 'Added',
  edited: 'Details edited',
  deleted: 'Deleted',
};

function fmtDate(d) {
  if (!d) return '';
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('en-IN');
}

// Turn the raw details JSON logged alongside each action into a plain,
// readable line instead of showing the stored payload as-is.
function describe(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'ticked':
      return `Ticked on${d.service_date ? ` ${fmtDate(d.service_date)}` : ' today'}.`;
    case 'unticked':
      return 'Unticked - no longer counted as done.';
    case 'updated':
      return d.service_date ? `Date changed to ${fmtDate(d.service_date)}.` : 'Entry updated.';
    case 'overridden':
      return 'Locked entry was edited by a superadmin.';
    case 'locked':
      return d.locked === false ? 'Unlocked for editing.' : 'Locked against further changes.';
    case 'proof_uploaded': {
      const parts = [];
      if (d.utr) parts.push(`UTR ${d.utr}`);
      if (d.payment_mode === 'card') parts.push(`paid by card (${d.card_owner || 'card'})`);
      else if (d.payment_mode === 'bank_transfer') parts.push('paid by bank transfer');
      if (d.actual_cost_inr != null) parts.push(`net amount Rs ${inr(d.actual_cost_inr)}`);
      if (d.file_name) parts.push(`proof uploaded (${d.file_name})`);
      return parts.length ? `${parts.join(', ')}.` : 'Payment proof uploaded.';
    }
    case 'created':
      return `${d.student_name || 'Student'} added${d.month ? ` for ${d.month}` : ''}${d.source ? ` (${d.source})` : ''}.`;
    case 'edited': {
      const changed = [
        ...Object.keys(d.student || {}),
        ...Object.keys(d.mis || {}),
      ];
      return changed.length ? `Changed: ${changed.join(', ')}.` : 'Record details edited.';
    }
    case 'deleted':
      return 'Record and its ticked services were removed.';
    default:
      return '';
  }
}

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
                                      <div className="card-title" style={{ marginBottom: 0 }}>Activity - {target.label}</div>
                                      <button className="btn" onClick={onClose}>Close</button>
                          </div>
                  {loading && <div>Loading...</div>}
                  {err && <div className="error-text">{err}</div>}
                  {!loading && !log.length && <div className="empty-state">No activity recorded yet.</div>}
                  {log.map((entry) => (
                    <div key={entry.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', fontSize: 13 }}>
                                <div style={{ fontWeight: 600 }}>{ACTION_LABELS[entry.action] || entry.action}</div>
                                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                                  {entry.users?.name || entry.users?.email || 'Unknown'} - {new Date(entry.performed_at).toLocaleString('en-IN')}
                                </div>
                      {describe(entry) && (
                                    <div style={{ fontSize: 13, marginTop: 4 }}>
                                      {describe(entry)}
                                    </div>
                                )}
                    </div>
                  ))}
                </div>
        </div>
      );
}
