'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';
import ActivityDrawer from '@/components/dashboard/ActivityDrawer';

const CARD_OWNERS = ['Tanisha Kalra (HSBC)', 'Manish Singh (HSBC)', 'Manish Singh (RBL)'];

export default function ServiceChecklist({ studentId, month, role, onChanged, canTick = true }) {
  const [checklist, setChecklist] = useState([]);
  const [packageKey, setPackageKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [proofFor, setProofFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  // Local draft text for the manual reference-cost input, keyed by
  // reference_service_id - kept separate from `checklist` so typing doesn't
  // fire a save on every keystroke; it only saves on blur/Enter.
  const [costDraft, setCostDraft] = useState({});

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
      // Once a service gets ticked on, require the UTR + payment mode + proof
      // for it before it counts as done - Cancel below reverts the tick rather
      // than leaving it half-finished.
      if (checked) {
        setProofFor({
          id: res.tick.id,
          reference_service_id: refId,
          service_name: item.service_name,
          reference_cost_inr: item.reference_cost_inr,
        });
      }
    } catch (e) {
      setErr(e.message);
      load(true);
    } finally {
      setSavingId(null);
    }
  }

  // Some services (VAS Accommodation, for one) don't have one fixed cost
  // across every student - the real booking cost varies student to student,
  // so there's nothing sensible to seed once in the reference_services
  // catalog. This lets it be typed in per student instead; it's saved onto
  // this student's own tick row and read back from there, ahead of whatever
  // (if anything) the catalog has.
  async function saveReferenceCost(item, value) {
    const refId = item.reference_service_id;
    const numValue = value === '' ? null : Number(value);
    setSavingId(refId);
    setChecklist((prev) => prev.map((c) => c.reference_service_id === refId ? { ...c, reference_cost_inr: numValue } : c));
    try {
      const res = await api('/api/student-services', {
        method: 'POST',
        body: {
          student_id: studentId,
          month,
          reference_service_id: refId,
          is_selected: item.is_selected,
          service_date: item.service_date,
          reference_cost_inr: numValue,
          skip_lock: true,
        },
      });
      setChecklist((prev) => prev.map((c) => c.reference_service_id === refId
        ? { ...c, id: res.tick.id, reference_cost_inr: res.tick.reference_cost_inr, locked: res.tick.locked }
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

  // Cancel (in the payment details modal) only reverses a tick that this
  // account is actually allowed to undo - once locked, only a superadmin can
  // untick it. This closes the loophole where opening "Update" on an already
  // locked, fully-processed entry and hitting Cancel would silently untick it.
  async function cancelTick(refId) {
    const current = checklist.find((c) => c.reference_service_id === refId);
    if (!current) return;
    if (current.locked && role !== 'superadmin') {
      throw new Error('This entry is locked - ask the superadmin to change it before it can be unticked.');
    }
    await toggle(current, false);
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
            <th></th><th>Service</th><th>Type</th><th className="num-cell">Reference cost</th><th>Date</th><th>Notes</th><th>Locked</th><th>Payment</th><th>History</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map((item) => (
            <tr key={item.reference_service_id} style={{ opacity: savingId === item.reference_service_id ? 0.6 : 1 }}>
              <td>
                <input
                  type="checkbox"
                  checked={item.is_selected}
                  disabled={(item.locked && role !== 'superadmin') || !canTick}
                  onChange={(e) => toggle(item, e.target.checked)}
                />
              </td>
              <td>{item.service_name}</td>
              <td><span className={`tag ${item.cost_type === 'fixed' ? 'ac' : item.cost_type === 'variable' ? 'vas-other' : ''}`}>{item.cost_type}</span></td>
              <td className="num-cell">
                <input
                  type="number"
                  value={costDraft[item.reference_service_id] ?? (item.reference_cost_inr != null ? item.reference_cost_inr : '')}
                  disabled={(item.locked && role !== 'superadmin') || !canTick}
                  placeholder="Enter cost"
                  onChange={(e) => setCostDraft((prev) => ({ ...prev, [item.reference_service_id]: e.target.value }))}
                  onBlur={(e) => {
                    setCostDraft((prev) => { const next = { ...prev }; delete next[item.reference_service_id]; return next; });
                    if (Number(e.target.value || 0) !== Number(item.reference_cost_inr || 0)) saveReferenceCost(item, e.target.value);
                  }}
                  style={{ width: 100, fontFamily: 'var(--mono)', fontSize: 12, border: '1px solid var(--border-2)', borderRadius: 4, padding: '2px 4px', textAlign: 'right' }}
                />
              </td>
              <td>
                {item.is_selected ? (
                  <input
                    type="date"
                    value={item.service_date || ''}
                    disabled={(item.locked && role !== 'superadmin') || !canTick}
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
                    {item.payment_mode && (
                      <span style={{ color: 'var(--muted)' }}>
                        {item.payment_mode === 'card' ? `Card - ${item.card_owner || ''}` : 'Bank transfer'}
                      </span>
                    )}
                    {item.actual_cost_inr != null && <span>Net: Rs {inr(item.actual_cost_inr)}</span>}
                    {item.proof_file_url && (
                      <a href={item.proof_file_url} target="_blank" rel="noreferrer">View proof</a>
                    )}
                    {canTick && (
                      <button className="btn" onClick={() => setProofFor({
                        id: item.id,
                        reference_service_id: item.reference_service_id,
                        service_name: item.service_name,
                        utr: item.utr,
                        payment_mode: item.payment_mode,
                        card_owner: item.card_owner,
                        actual_cost_inr: item.actual_cost_inr,
                        reference_cost_inr: item.reference_cost_inr,
                      })}>
                        {item.utr || item.proof_file_url ? 'Update' : 'Add payment details'}
                      </button>
                    )}
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
          onCancelTick={() => cancelTick(proofFor.reference_service_id)}
          onSaved={() => { setProofFor(null); load(true); }}
        />
      )}
      {historyFor && (
        <ActivityDrawer target={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function ProofModal({ target, onClose, onCancelTick, onSaved }) {
  const [utr, setUtr] = useState(target.utr || '');
  const [file, setFile] = useState(null);
  const [paymentMode, setPaymentMode] = useState(target.payment_mode || '');
  const [cardOwner, setCardOwner] = useState(target.card_owner || '');
  const [actualCost, setActualCost] = useState(
    target.actual_cost_inr != null ? String(target.actual_cost_inr)
      : target.reference_cost_inr != null ? String(target.reference_cost_inr) : ''
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canSave = utr.trim() && file && paymentMode && (paymentMode !== 'card' || cardOwner);

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('student_service_id', target.id);
      form.append('utr', utr.trim());
      form.append('file', file);
      form.append('payment_mode', paymentMode);
      if (paymentMode === 'card') form.append('card_owner', cardOwner);
      if (actualCost !== '') form.append('actual_cost_inr', actualCost);
      await api('/api/student-services/proof', { method: 'POST', form });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      await onCancelTick();
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ width: 420, background: 'var(--surface)', borderRadius: 8, padding: 20 }}>
        <div className="card-title">Payment details - {target.service_name}</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
          UTR, payment mode, and proof of payment are all required before this service counts as done. Cancel reverses the tick if the details aren't on hand yet.
        </p>
        {err && <div className="error-text" style={{ marginBottom: 8 }}>{err}</div>}

        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>UTR *</label>
        <input
          type="text"
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          placeholder="UTR / transaction reference"
          style={{ width: '100%', marginBottom: 12, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 4 }}
        />

        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Net amount after deduction</label>
        <input
          type="number"
          value={actualCost}
          onChange={(e) => setActualCost(e.target.value)}
          placeholder="Actual amount paid, after charges"
          style={{ width: '100%', marginBottom: 12, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 4 }}
        />

        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Payment mode *</label>
        <select
          value={paymentMode}
          onChange={(e) => { setPaymentMode(e.target.value); if (e.target.value !== 'card') setCardOwner(''); }}
          style={{ width: '100%', marginBottom: 12, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 4 }}
        >
          <option value="">Select...</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
        </select>

        {paymentMode === 'card' && (
          <>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Which card *</label>
            <select
              value={cardOwner}
              onChange={(e) => setCardOwner(e.target.value)}
              style={{ width: '100%', marginBottom: 12, padding: '6px 8px', border: '1px solid var(--border-2)', borderRadius: 4 }}
            >
              <option value="">Select...</option>
              {CARD_OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </>
        )}

        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Proof of payment *</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginBottom: 16 }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={cancel} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy || !canSave}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
