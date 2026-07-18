'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr, pct } from '@/lib/format';
import AddStudentModal from '@/components/dashboard/AddStudentModal';
import ActivityDrawer from '@/components/dashboard/ActivityDrawer';
import ServiceChecklist from '@/components/dashboard/ServiceChecklist';
import CardOwnerSummary from '@/components/dashboard/CardOwnerSummary';

export default function ActualisationSheet({ month, role }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api(`/api/students${month ? `?month=${encodeURIComponent(month)}` : ''}`);
      setRows(res.rows || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [month]);

  async function deleteRow(r) {
    if (!window.confirm(`Delete ${r.students?.student_name} - ${r.month}? This removes their MIS record, P&L record, and ticked services for this month.`)) return;
    try {
      await api(`/api/students?mis_record_id=${r.id}`, { method: 'DELETE' });
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
  const colSpan = role === 'superadmin' ? 17 : 16;

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
          <div className="value">{totalSale ? pct(((totalSale - totalActualised) / totalSale) * 100) : '-'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>Students</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by STP code or Leverage email"
              style={{ padding: '6px 10px', border: '1px solid var(--border-2)', borderRadius: 6, minWidth: 260 }}
            />
            <button className="btn" onClick={downloadXlsx}>Download sheet</button>
            {role === 'superadmin' && (
              <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add student</button>
            )}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Month</th>
              <th>Student</th>
              <th>STP</th>
              <th>Package</th>
              <th>Added</th>
              <th className="num-cell">Sale amount</th>
              <th className="num-cell">Collected</th>
              <th>Last collection date</th>
              <th className="num-cell">Outstanding</th>
              <th className="num-cell">Net after charges</th>
              <th className="num-cell">Servicing balance</th>
              <th>Status</th>
              <th className="num-cell">Margin %</th>
              <th>Card owner</th>
              <th>Activity</th>
              {role === 'superadmin' && <th>Manage</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                    <td>{isOpen ? 'v' : '>'}</td>
                    <td>{r.month}</td>
                    <td>{r.students?.student_name}</td>
                    <td className="tag">{r.students?.stp_code}</td>
                    <td>{r.students?.package || '-'}{r.reference_package_key ? <span className="tag" style={{ marginLeft: 6 }}>{r.reference_package_key}</span> : null}</td>
                    <td>{r.students?.created_at ? new Date(r.students.created_at).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="num-cell">Rs {inr(r.total_sale_amount)}</td>
                    <td className="num-cell">Rs {inr(r.collected)}</td>
                    <td>{r.last_collection_date ? new Date(r.last_collection_date).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="num-cell">Rs {inr(r.outstanding)}</td>
                    <td className="num-cell">Rs {inr(r.net_after_charges)}</td>
                    <td className="num-cell">Rs {inr(r.servicing_balance)}</td>
                    <td><span className={`tag ${r.status === 'Closed' ? 'ac' : ''}`}>{r.status}</span></td>
                    <td className="num-cell">{pct(r.actualised_margin_pct)}</td>
                    <td style={{ fontSize: 12 }}>
                      {Object.keys(r.card_owners || {}).length
                        ? Object.entries(r.card_owners).map(([owner, amt]) => (
                            <div key={owner}>{owner}: Rs {inr(amt)}</div>
                          ))
                        : '-'}
                    </td>
                    <td>
                      <button className="btn" onClick={(e) => { e.stopPropagation(); setHistoryFor({ type: 'mis_record', id: r.id, label: r.students?.student_name }); }}>
                        History
                      </button>
                    </td>
                    {role === 'superadmin' && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn" onClick={() => setEditRow({
                            mis_record_id: r.id,
                            stp_code: r.students?.stp_code,
                            student_name: r.students?.student_name,
                            email: r.students?.email,
                            country: r.students?.country,
                            package: r.students?.package,
                            month: r.month,
                            total_sale_amount: r.total_sale_amount,
                            collected: r.collected,
                            outstanding: r.outstanding,
                          })}>Edit</button>
                          <button className="btn" style={{ color: 'var(--red)' }} onClick={() => deleteRow(r)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={colSpan} style={{ background: 'var(--surface-2)', padding: 0 }}>
                        <ServiceChecklist
                          studentId={r.students?.id}
                          month={r.month}
                          role={role}
                          onChanged={load}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!filteredRows.length && (
              <tr><td colSpan={colSpan} className="empty-state">{needle ? 'No students match that search.' : 'No students for this month yet.'}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <CardOwnerSummary />

      {showAdd && (
        <AddStudentModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />
      )}
      {editRow && (
        <AddStudentModal student={editRow} onClose={() => setEditRow(null)} onAdded={() => { setEditRow(null); load(); }} />
      )}
      {historyFor && (
        <ActivityDrawer target={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </>
  );
}
