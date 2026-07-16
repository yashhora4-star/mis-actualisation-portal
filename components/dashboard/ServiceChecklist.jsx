'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { inr } from '@/lib/format';

export default function ServiceChecklist({ studentId, month, role, onChanged }) {
    const [checklist, setChecklist] = useState([]);
    const [packageKey, setPackageKey] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [saving, setSaving] = useState({});

  async function load() {
        setLoading(true);
        try {
                const res = await api(`/api/student-services?student_id=${studentId}&month=${encodeURIComponent(month)}`);
                setChecklist(res.checklist || []);
                setPackageKey(res.package_key);
        } catch (e) {
                setErr(e.message);
        } finally {
                setLoading(false);
        }
  }

  useEffect(() => { if (studentId && month) load(); }, [studentId, month]);

  async function toggle(item, checked) {
        setSaving((s) => ({ ...s, [item.reference_service_id]: true }));
        try {
                await api('/api/student-services', {
                          method: 'POST',
                          body: {
                                      student_id: studentId,
                                      month,
                                      reference_service_id: item.reference_service_id,
                                      is_selected: checked,
                                      service_date: new Date().toISOString().slice(0, 10),
                          },
                });
                await load();
                onChanged && onChanged();
        } catch (e) {
                setErr(e.message);
        } finally {
                setSaving((s) => ({ ...s, [item.reference_service_id]: false }));
        }
  }

  async function unlock(item) {
        if (!item.id) return;
        try {
                await api('/api/student-services', { method: 'PATCH', body: { id: item.id, locked: false } });
                await load();
        } catch (e) {
                setErr(e.message);
        }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading checklist...</div>div>;
    if (!packageKey) {
          return (
                  <div style={{ padding: 16, color: 'var(--muted)' }}>
                            No package matched for this student - {role === 'superadmin' ? 'set reference_package_key on the MIS record to enable the checklist.' : 'ask the superadmin to map this student to a package.'}
                  </div>div>
                );
    }
    if (err) return <div style={{ padding: 16 }} className="error-text">{err}</div>div>;
  
    return (
          <div style={{ padding: '12px 20px' }}>
                <table>
                        <thead>
                                  <tr>
                                              <th></th>th><th>Service</th>th><th>Type</th>th><th className="num-cell">Reference cost</th>th><th>Notes</th>th><th>Locked</th>th>
                                  </tr>tr>
                        </thead>thead>
                        <tbody>
                          {checklist.map((item) => (
                        <tr key={item.reference_service_id}>
                                      <td>
                                                      <input
                                                                          type="checkbox"
                                                                          checked={item.is_selected}
                                                                          disabled={item.locked && role !== 'superadmin'}
                                                                          onChange={(e) => toggle(item, e.target.checked)}
                                                                        />
                                      </td>td>
                                      <td>{item.service_name}</td>td>
                                      <td><span className={`tag ${item.cost_type === 'fixed' ? 'ac' : item.cost_type === 'variable' ? 'vas-other' : ''}`}>{item.cost_type}</span>span></td>td>
                                      <td className="num-cell">{item.reference_cost_inr != null ? `Rs ${inr(item.reference_cost_inr)}` : '-'}</td>td>
                                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.notes || ''}</td>td>
                                      <td>
                                        {item.locked ? (
                                            role === 'superadmin' ? (
                                                                  <button className="btn" onClick={() => unlock(item)}>Unlock</button>button>
                                                                ) : (
                                                                  <span className="tag unmarked">Locked</span>span>
                                                                )
                                          ) : '-'}
                                      </td>td>
                        </tr>tr>
                      ))}
                        </tbody>tbody>
                </table>table>
          </div>div>
        );
}
</div>
