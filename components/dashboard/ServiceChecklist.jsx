'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';
import ActivityDrawer from '@/components/dashboard/ActivityDrawer';

export default function ServiceChecklist({ studentId, month, role, onChanged }) {
  const [checklist, setChecklist] = useState([]);
  const [packageKey, setPackageKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [proofFor, setProofFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  async function load(silent) {
    if (!silent) setLoading(true);
    try {
      const res = await api(`/api/student-services?student_id=${studentId}&month=${encodeURIComponent(month)}`);
      setChecklist(res.checklist || []);
      setPackageKey(res.package_key);
    } catch (e) {
      setErr(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (studentId && month) load(false); }, [studentId, month]);
  // Let the parent table refresh its totals once, when this checklist unmounts
  // (i.e. the row is collapsed) instead of after every single click - that
  // full-table reload on every tick was what made ticking feel like it hung.
  useEffect(() => () => { onChanged && onChanged(); }, []);

  async function toggle(item, checked) {
    const refId = item.reference_service_id;
    setSavingId(refId);
    const today = new Date().toISOString().slice(0, 10);
    // Optimistic update - no full reload, no spinner flash.
    setChecklist((prev) => prev.map((c) => c.reference_service_id === refId
      ? { ...c, is_selected: checked, service_date: checked ? (c.service_date || today) : c.service_date, locked: true }
      : c));
    try {
      const res = await api('/api/student-services', {
        method: 'POST',
        body: {
          student_id: studentId,
          month,
          reference_service_id: refId,
          is_selected: checked,
          service_date: today,
        },
      });
      setChecklist((prev) => prev.map((c) => c.reference_service_id === refId
        ? { ...c, id: res.tick.id, is_selected: res.tick.is_selected, service_date: res.tick.service_date, locked: res.tick.locked }
        : c));
      // Once a service gets ticked on, prompt for the UTR + payment proof
      // for it. Skippable - we don't want to block the workflow if the
      // details aren't on hand yet, they can add it later from this row.
      if (checked) {
        setProofFor({ id: res.tick.id, service_name: item.service_name });
      }
    } catch (e) {
      setErr(e.message);
      load(true);
    } finally {
      setSavingId(null);
    }
  }

  async function changeDate(item, dateStr) {
    if (!item.id) return;
    setSavingId(item.reference_service_id);
    setChecklist((prev) => prev.map((c) => c.reference_service_id === item.reference_service_id ? { ...c, service_date: dateStr } : c));
    try {
      await api('/api/student-services', {
        method: 'POST',
        body: {
          student_id: studentId,
          month,
          reference_service_id: item.reference_service_id,
          is_selected: item.is_selected,
          service_date: dateStr,
        },
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function unlock(item) {
    if (!item.id) return;
    try {
      await api('/api/student-services', { method: 'PATCH', body: { id: item.id, locked: false } });
      load(true);
    } catch (e) {
      setErr(e.message);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading checklist...</div>;
  if (!packageKey) {
    return (
      <div style={{ padding: 16, color: 'var(--muted)' }}>
        No package matched for this student - {role === 'superadmin' ? 'set reference_package_key on the MIS record to enable the checklist.' : 'ask the superadmin to map this student to a package.'}
      </div>
    );
  }
  if (err) return <div style={{ padding: 16 }} className="error-text">{err}</div>;

  return (
    <div style={{ padding: '12px 20px' }}>
      <table>
        <thead>
          <tr>
            <th></th><th>Service</th><th>Type</th><th className="num-cell">Reference cost</th><th>Date</th><th>Notes</th><th>Locked</th><th>UTR / proof</th><th>History</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map((item) => (
            <tr key={item.reference_service_id} style={{ opacity: savingId === item.reference_service_id ? 0.6 : 1 }}>
              <td>
                <input
                  type="checkbox"
                  checked={item.is_selected}
                  disabled={item.locked && role !== 'superadmin'}
                  onChange={(e) => toggle(item, e.target.checked)}
                />
              </td>
              <td>{item.service_name}</td>
              <td><span className={`tag ${item.cost_type === 'fixed' ? 'ac' : item.cost_type === 'variable' ? 'vas-other' : ''}`}>{item.cost_type}</span></td>
              <td className="num-cell">{item.reference_cost_inr != null ? `Rs ${inr(item.reference_cost_inr)}` : '-'}</td>
              <td>
                {item.is_selected ? (
                  <input
                    type="date"
                    value={item.service_date || ''}
                    disabled={item.locked && role !== 'superadmin'}
                    onChange={(e) => changeDate(item, e.target.value)}
                    style={{ fontFamily: 'var(--mono)', fontSize: 12, border: '1px solid var(--border-2)', borderRadius: 4, padding: '2px 4px' }}
                  />
                ) : '-'}
              </td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.notes || ''}</td>
              <td>
                {item.locked ? (
                  role === 'superadmin' ? (
                    <button className="btn" onClick={() => unlock(item)}>Unlock</button>
                  ) : (
                    <span className="tag unmarked">Locked</span>
                  )
                ) : '-'}
              </td>
              <td style={{ fontSize: 12 }}>
                {item.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                    {item.utr && <span style={{ fontFamily: 'var(--mono)' }}>{item.utr}</span>}
                    {item.proof_file_url && (
                      <a href={item.proof_file_url} target="_blank" rel="noreferrer">View proof</a>
                    )}
                    <button className="btn" onClick={() => setProofFor({ id: item.id, service_name: item.service_name, utr: item.utr })}>
                      {item.utr || item.proof_file_url ? 'Update' : 'Add UTR / proof'}
                    </button>
                  </div>
                ) : '-'}
              </td>
              <td>
                {item.id ? (
                  <button className="btn" onClick={() => setHistoryFor({ type: 'student_service', id: item.id, label: item.service_name })}>History</button>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {proofFor && (
        <ProofModal
          target={proofFor}
          onClose={() => setProofFor(null)}
          onSaved={() => { setProofFor(null); load(true); }}
        />
      )}
      {historyFor && (
        <ActivityDrawer target={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function ProofModal({ target, onClose, onSaved }) {
  const [utr, setUtr] = useState(target.utr || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('student_service_id', target.id);
      if (utr) form.append('utr', utr);
      if (file) form.append('file', file);
      await api('/api/student-services/proof', { method: 'POST', form });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ width: 380, background: 'var(--surface)', borderRadius: 8, padding: 20 }}>
        <div className="card-title">Payment details - {target.service_name}</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
          Add the UTR for this service and upload proof of payment. Saved to a shared folder - anyone with the link can view it, and it's re-openable from this row.
        </p>
        {err && <div className="error-text" style={{ marginBottom: 8 }}>{err}</div>}
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>UTR</label>
        <input
          type="text"
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          placeholder="UTR / transaction reference"
          style={{ width: '100%', marginBottom: 12, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 4 }}
        />
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Proof of payment</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Skip for now</button>
          <button className="btn primary" onClick={save} disabled={busy || (!utr && !file)}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
