'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr, pct } from '@/lib/format';
import AddStudentModal from '@/components/dashboard/AddStudentModal';
import ActivityDrawer from '@/components/dashboard/ActivityDrawer';
import ServiceChecklist from '@/components/dashboard/ServiceChecklist';

export default function ActualisationSheet({ month, role }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [expanded, setExpanded] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [historyFor, setHistoryFor] = useState(null);

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

  if (loading) return <div>Loading...</div>;
    if (err) return <div className="error-text">{err}</div>;
  
    const totalSale = rows.reduce((s, r) => s + (Number(r.total_sale_amount) || 0), 0);
    const totalActualised = rows.reduce((s, r) => s + (Number(r.actualised_cost) || 0), 0);
  
    return (
          <>
                <div className="stat-grid">
                        <div className="stat">
                                  <div className="label">Students (this view)</div>
                                  <div className="value">{rows.length}</div>
                        </div>
                        <div className="stat">
                                  <div className="label">Total sale amount</div>
                                  <div className="value">Rs {inr(totalSale)}</div>
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
                        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Students</span>
                          {role === 'superadmin' && (
                        <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add student</button>
                                  )}
                        </div>
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
                                                            <th className="num-cell">Actualised cost</th>
                                                            <th className="num-cell">Margin %</th>
                                                            <th>Last service date</th>
                                                            <th>Activity</th>
                                              </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r) => {
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
                                                                                  <td className="num-cell">Rs {inr(r.actualised_cost)}</td>
                                                                                  <td className="num-cell">{pct(r.actualised_margin_pct)}</td>
                                                                                  <td>{r.last_service_date ? new Date(r.last_service_date).toLocaleDateString('en-IN') : '-'}</td>
                                                                                  <td>
                                                                                                        <button className="btn" onClick={(e) => { e.stopPropagation(); setHistoryFor({ type: 'mis_record', id: r.id, label: r.students?.student_name }); }}>
                                                                                                                                History
                                                                                                          </button>
                                                                                    </td>
                                                              </tr>
                                              {isOpen && (
                                                                  <tr>
                                                                                        <td colSpan={11} style={{ background: 'var(--surface-2)', padding: 0 }}>
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
                                    {!rows.length && (
                          <tr><td colSpan={11} className="empty-state">No students for this month yet.</td></tr>
                                              )}
                                  </tbody>
                        </table>
                </div>
          
            {showAdd && (
                    <AddStudentModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />
                  )}
            {historyFor && (
                    <ActivityDrawer target={historyFor} onClose={() => setHistoryFor(null)} />
                  )}
          </>
        );
}
