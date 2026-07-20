'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr, pct } from '@/lib/format';
import AddStudentModal from '@/components/dashboard/AddStudentModal';
import ActivityDrawer from '@/components/dashboard/ActivityDrawer';
import ServiceChecklist from '@/components/dashboard/ServiceChecklist';

function fmtDate(d) {
  if (!d) return '-';
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('en-IN');
}

// A single label/value pair in the detail panel.
function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{children}</div>
    </div>
  );
}

// Records a single incremental payment against a student's outstanding
// balance - a dated line item (so "last collection date" and history stay
// accurate), rather than the blunt overwrite-the-numbers Edit modal, which
// left no trace of when or how much came in.
function RecordPaymentModal({ row, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (!payDate) { setErr('Pick a payment date.'); return; }
    setSaving(true);
    try {
      await api('/api/students/payments', {
        method: 'POST',
        body: { mis_record_id: row.id, amount: amt, pay_date: payDate, note: note.trim() || undefined },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width: 380, maxWidth: '90vw' }}>
        <div className="card-title">Record payment</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          {row.students?.student_name} - {row.students?.stp_code} - {row.month}
          <br />Currently outstanding: Rs {inr(row.outstanding)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Amount received
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-2)', borderRadius: 6, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Payment date
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-2)', borderRadius: 6, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Note / reference (optional)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="UTR, cheque no., etc."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-2)', borderRadius: 6, marginTop: 4 }}
            />
          </label>
          {err && <div className="error-text">{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save payment'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Master-detail layout: a simple left-hand list of student names, and a
// detail panel on the right for whichever student is selected - replacing
// the old dense, expandable multi-column table which got unwieldy once
// there were more than a handful of fields per student.
export default function ActualisationSheet({ month, role, canWrite, canTickServices = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [q, setQ] = useState('');
  const [payingRow, setPayingRow] = useState(null);

  // `silent` skips the loading-spinner state - used when a child (the service
  // checklist) refreshes this list after a tick/cost save. Without it, every
  // tick/untick set `loading` true, which hit the `if (loading) return
  // <div>Loading...</div>` guard below and unmounted the entire master-detail
  // view (list + detail panel + checklist) mid-interaction - most visibly
  // breaking the payment-details popup, which never got a chance to render
  // before its own component unmounted.
  async function load(silent) {
    if (!silent) setLoading(true);
    try {
      const res = await api(`/api/students${month ? `?month=${encodeURIComponent(month)}` : ''}`);
      setRows(res.rows || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { load(); }, [month]);

  async function deleteRow(r) {
    if (!window.confirm(`Delete ${r.students?.student_name} - ${r.month}? This removes their MIS record, P&L record, and ticked services for this month.`)) return;
    try {
      await api(`/api/students?mis_record_id=${r.id}`, { method: 'DELETE' });
      if (selectedId === r.id) setSelectedId(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  function downloadXlsx() {
    import('xlsx').then((XLSX) => {
      const data = filteredRows.map((r) => ({
        Month: r.month,
        Student: r.students?.student_name || '',
        STP: r.students?.stp_code || '',
        Email: r.students?.email || '',
        Country: r.students?.country || '',
        Package: r.students?.package || '',
        'Reference Package Key': r.reference_package_key || '',
        Added: r.students?.created_at ? new Date(r.students.created_at).toLocaleDateString('en-IN') : '',
        'Sale Amount': r.total_sale_amount ?? '',
        'Collected': r.collected ?? '',
        'Last Collection Date': r.last_collection_date || '',
        'Outstanding': r.outstanding ?? '',
        'Outstanding Picked Date': r.outstanding_updated_at ? new Date(r.outstanding_updated_at).toLocaleDateString('en-IN') : '',
        'Net Amount After Deduction': r.net_amount_after_deduction ?? '',
        'Net After Subvention/GST': r.net_after_charges ?? '',
        'Actualised Cost': r.actualised_cost ?? '',
        'Servicing Balance': r.servicing_balance ?? '',
        'Status': r.status || '',
        'Margin %': r.actualised_margin_pct != null ? Number(r.actualised_margin_pct).toFixed(1) : '',
        'Last Service Date': r.last_service_date || '',
        'Card Owners': Object.entries(r.card_owners || {}).map(([k, v]) => `${k}: Rs ${inr(v)}`).join('; '),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Actualisation');
      const label = month ? month.replace(/\s+/g, '_') : 'all_months';
      XLSX.writeFile(wb, `actualisation_${label}.xlsx`);
    });
  }

  if (loading) return <div>Loading...</div>;
  if (err) return <div className="error-text">{err}</div>;

  const needle = q.trim().toLowerCase();
  const filteredRows = needle
    ? rows.filter((r) =>
        (r.students?.stp_code || '').toLowerCase().includes(needle) ||
        (r.students?.email || '').toLowerCase().includes(needle) ||
        (r.students?.student_name || '').toLowerCase().includes(needle))
    : rows;

  const totalSale = filteredRows.reduce((s, r) => s + (Number(r.total_sale_amount) || 0), 0);
  const totalCollected = filteredRows.reduce((s, r) => s + (Number(r.collected) || 0), 0);
  const totalActualised = filteredRows.reduce((s, r) => s + (Number(r.actualised_cost) || 0), 0);
  const totalNetAfterCharges = filteredRows.reduce((s, r) => s + (Number(r.net_after_charges) || 0), 0);

  const selected = filteredRows.find((r) => r.id === selectedId) || null;

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Students (this view)</div>
          <div className="value">{filteredRows.length}</div>
        </div>
        <div className="stat">
          <div className="label">Total sale amount</div>
          <div className="value">Rs {inr(totalSale)}</div>
        </div>
        <div className="stat">
          <div className="label">Total collected amount</div>
          <div className="value">Rs {inr(totalCollected)}</div>
        </div>
        <div className="stat">
          <div className="label">Net after subvention/GST</div>
          <div className="value">Rs {inr(totalNetAfterCharges)}</div>
        </div>
        <div className="stat">
          <div className="label">Actualised cost so far</div>
          <div className="value">Rs {inr(totalActualised)}</div>
        </div>
        <div className="stat">
          <div className="label">Blended margin</div>
          {/* Margin against what actually landed net of subvention/GST, not the gross
              sale amount - matches the per-student Margin % fix below. */}
          <div className="value">{totalNetAfterCharges ? pct(((totalNetAfterCharges - totalActualised) / totalNetAfterCharges) * 100) : '-'}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', minHeight: 480 }}>
          <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by STP code, name or email"
                style={{ padding: '6px 10px', border: '1px solid var(--border-2)', borderRadius: 6, width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={downloadXlsx} style={{ flex: 1 }}>Download sheet</button>
                {canWrite && (
                  <button className="btn primary" onClick={() => setShowAdd(true)} style={{ flex: 1 }}>+ Add</button>
                )}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredRows.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedId === r.id ? 'var(--surface-2)' : 'transparent',
                    borderLeft: selectedId === r.id ? '3px solid var(--accent, #4f7cff)' : '3px solid transparent',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.students?.student_name || 'Unnamed'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span>{r.students?.stp_code} - {r.month}</span>
                    <span className={`tag ${r.status === 'Closed' ? 'ac' : ''}`} style={{ fontSize: 11 }}>{r.status}</span>
                  </div>
                </div>
              ))}
              {!filteredRows.length && (
                <div className="empty-state">{needle ? 'No students match that search.' : 'No students for this month yet.'}</div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {!selected && (
              <div className="empty-state">Select a student from the list to see their details.</div>
            )}
            {selected && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.students?.student_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                      {selected.students?.stp_code} - {selected.students?.email || 'no email'} - {selected.students?.country || '-'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                      {selected.month}
                      {' - '}
                      {selected.students?.package || '-'}
                      {selected.reference_package_key ? <span className="tag" style={{ marginLeft: 6 }}>{selected.reference_package_key}</span> : null}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setHistoryFor({ type: 'mis_record', id: selected.id, label: selected.students?.student_name })}>
                      History
                    </button>
                    {canWrite && (
                      <>
                        <button className="btn primary" onClick={() => setPayingRow(selected)}>Record payment</button>
                        <button className="btn" onClick={() => setEditRow({
                          mis_record_id: selected.id,
                          stp_code: selected.students?.stp_code,
                          student_name: selected.students?.student_name,
                          email: selected.students?.email,
                          country: selected.students?.country,
                          package: selected.students?.package,
                          month: selected.month,
                          total_sale_amount: selected.total_sale_amount,
                          collected: selected.collected,
                          outstanding: selected.outstanding,
                          net_amount_after_deduction: selected.net_amount_after_deduction,
                        })}>Edit</button>
                        <button className="btn" style={{ color: 'var(--red)' }} onClick={() => deleteRow(selected)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, background: 'var(--surface-2)', padding: 14, borderRadius: 8, marginBottom: 20 }}>
                  <Field label="Sale amount">Rs {inr(selected.total_sale_amount)}</Field>
                  <Field label="Collected">Rs {inr(selected.collected)}</Field>
                  <Field label="Last collection date">{fmtDate(selected.last_collection_date)}</Field>
                  <Field label="Outstanding">Rs {inr(selected.outstanding)}</Field>
                  <Field label="Outstanding picked on">{fmtDate(selected.outstanding_updated_at)}</Field>
                  <Field label="Net amount after deduction">{selected.net_amount_after_deduction != null ? `Rs ${inr(selected.net_amount_after_deduction)}` : '-'}</Field>
                  <Field label="Net after subvention/GST">Rs {inr(selected.net_after_charges)}</Field>
                  <Field label="Servicing balance">Rs {inr(selected.servicing_balance)}</Field>
                  <Field label="Margin %">{pct(selected.actualised_margin_pct)}</Field>
                  <Field label="Status"><span className={`tag ${selected.status === 'Closed' ? 'ac' : ''}`}>{selected.status}</span></Field>
                  <Field label="Card owner">
                    {Object.keys(selected.card_owners || {}).length
                      ? Object.entries(selected.card_owners).map(([owner, amt]) => (
                          <div key={owner}>{owner}: Rs {inr(amt)}</div>
                        ))
                      : '-'}
                  </Field>
                </div>

                <ServiceChecklist
                  studentId={selected.students?.id}
                  month={selected.month}
                  role={role}
                  onChanged={() => load(true)}
                  canTick={canTickServices}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <AddStudentModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />
      )}
      {editRow && (
        <AddStudentModal student={editRow} onClose={() => setEditRow(null)} onAdded={() => { setEditRow(null); load(); }} />
      )}
      {historyFor && (
        <ActivityDrawer target={historyFor} onClose={() => setHistoryFor(null)} />
      )}
      {payingRow && (
        <RecordPaymentModal
          row={payingRow}
          onClose={() => setPayingRow(null)}
          onSaved={() => { setPayingRow(null); load(); }}
        />
      )}
    </>
  );
}
