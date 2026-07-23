'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';

// Summary panel: how much was spent through each card owner (Tanisha Kalra
// on HSBC, Manish Singh on HSBC, Manish Singh on RBL, etc) within a chosen
// date range - now built straight from student_services ticks paid by card,
// so each total can be expanded into exactly which students it came from.
// Same fix as the student list and bank transfer summary: an expanded card
// owner's transaction list had no cap, so a heavily-used card (120+
// transactions) turned expanding it into one long endless scroll.
const PAGE_SIZE = 15;

export default function CardOwnerSummary() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [detailPage, setDetailPage] = useState(1);

  function toggleExpanded(owner) {
    setExpanded((cur) => (cur === owner ? null : owner));
    setDetailPage(1);
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api(`/api/card-owners${params.toString() ? `?${params.toString()}` : ''}`);
      setSummary(res.summary || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const total = summary.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>Card owner summary</span>
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
              <th></th>
              <th>Card owner</th>
              <th className="num-cell">Transactions</th>
              <th className="num-cell">Amount used</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => {
              const isExpanded = expanded === row.card_owner;
              const detailTotalPages = Math.max(1, Math.ceil(row.students.length / PAGE_SIZE));
              const safeDetailPage = Math.min(detailPage, detailTotalPages);
              const pagedStudents = isExpanded
                ? row.students.slice((safeDetailPage - 1) * PAGE_SIZE, safeDetailPage * PAGE_SIZE)
                : [];
              return (
                <Fragment key={row.card_owner}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpanded(row.card_owner)}>
                    <td style={{ width: 20, color: 'var(--muted)' }}>{isExpanded ? 'â¾' : 'â¸'}</td>
                    <td>{row.card_owner}</td>
                    <td className="num-cell">{row.count}</td>
                    <td className="num-cell">Rs {inr(row.total)}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <table style={{ width: '100%' }}>
                          <thead>
                            <tr>
                              <th>STP code</th>
                              <th>Student</th>
                              <th>Country</th>
                              <th>Month</th>
                              <th>Service</th>
                              <th>Date</th>
                              <th className="num-cell">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedStudents.map((s, i) => (
                              <tr key={`${s.student_id}-${i}`}>
                                <td>{s.stp_code}</td>
                                <td>{s.student_name}</td>
                                <td>{s.country}</td>
                                <td>{s.month}</td>
                                <td>{s.service_name}</td>
                                <td>{s.service_date || '-'}</td>
                                <td className="num-cell">Rs {inr(s.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {row.students.length > PAGE_SIZE && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                            <button className="btn" onClick={() => setDetailPage((p) => Math.max(1, p - 1))} disabled={safeDetailPage <= 1}>Prev</button>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Page {safeDetailPage} of {detailTotalPages} ({row.students.length} transactions)</span>
                            <button className="btn" onClick={() => setDetailPage((p) => Math.min(detailTotalPages, p + 1))} disabled={safeDetailPage >= detailTotalPages}>Next</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!summary.length && (
              <tr><td colSpan={4} className="empty-state">No card payments in this range.</td></tr>
            )}
          </tbody>
          {summary.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>Total</td>
                <td className="num-cell" style={{ fontWeight: 600 }}>Rs {inr(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
