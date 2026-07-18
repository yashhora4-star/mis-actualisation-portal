'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';

export default function ServiceChecklist({ studentId, month, role, onChanged }) {
  const [checklist, setChecklist] = useState([]);
  const [packageKey, setPackageKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingId, setSavingId] = useState(null);

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
            <th></th><th>Service</th><th>Type</th><th className="num-cell">Reference cost</th><th>Date</th><th>Notes</th><th>Locked</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
