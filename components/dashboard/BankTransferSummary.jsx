'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';

// Every bank-transfer payment recorded against a service tick: student,
// date, UTR, and a link to the uploaded proof - so this can be reconciled
// against bank statements without digging into each student's row.
// Same fix as the student list: with no cap, this table just kept growing
// with every bank-transfer tick ever recorded (in the 90s and counting),
// turning the page into one long endless scroll. Pagination keeps each page
// short regardless of how many rows exist in total.
const PAGE_SIZE = 15;

export default function BankTransferSummary() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api(`/api/bank-transfers${params.toString() ? `?${params.toString()}` : ''}`);
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setPage(1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>Bank transfer summary</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border-2)', borderRadius: 4 }} />
          <span style={{ color: 'var(--muted)' }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border-2)', borderRadius: 4 }} />
          <button className="btn" onClick={load}>Apply</button>
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}
      {loading ? (
        <div style={{ padding: 12 }}>Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>STP code</th>
              <th>Student</th>
              <th>Country</th>
              <th>Month</th>
              <th>Service</th>
              <th>Date</th>
              <th>UTR</th>
              <th className="num-cell">Amount</th>
              <th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r) => (
              <tr key={r.id}>
                <td>{r.stp_code}</td>
                <td>{r.student_name}</td>
                <td>{r.country}</td>
                <td>{r.month}</td>
                <td>{r.service_name}</td>
                <td>{r.service_date || '-'}</td>
                <td>{r.utr || '-'}</td>
                <td className="num-cell">Rs {inr(r.amount)}</td>
                <td>
                  {r.proof_file_url ? (
                    <a href={r.proof_file_url} target="_blank" rel="noreferrer">{r.proof_file_name || 'View'}</a>
                  ) : '-'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} className="empty-state">No bank transfer payments in this range.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={7} style={{ fontWeight: 600 }}>Total ({rows.length} transactions)</td>
                <td className="num-cell" style={{ fontWeight: 600 }}>Rs {inr(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
      {!loading && rows.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>Prev</button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Page {safePage} of {totalPages}</span>
          <button className="btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Next</button>
        </div>
      )}
    </div>
  );
}
