'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';

export default function TeamPanel() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [inviting, setInviting] = useState(false);

  async function load() {
        setLoading(true);
        try {
                const res = await api('/api/admin/users');
                setUsers(res.users || []);
        } catch (e) {
                setErr(e.message);
        } finally {
                setLoading(false);
        }
  }

  useEffect(() => { load(); }, []);

  async function invite() {
        if (!email) return;
        setInviting(true);
        setErr('');
        try {
                await api('/api/admin/users', { method: 'POST', body: { email, name } });
                setEmail(''); setName('');
                await load();
        } catch (e) {
                setErr(e.message);
        } finally {
                setInviting(false);
        }
  }

  async function toggleActive(u) {
        try {
                await api('/api/admin/users', { method: 'PATCH', body: { id: u.id, active: !u.active } });
                await load();
        } catch (e) {
                setErr(e.message);
        }
  }

  return (
        <>
              <div className="card">
                      <div className="card-title">Invite a team member</div>
                      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                                They will get an email invite from Supabase. New members always join as
                                <code> member</code> - they can view everything and tick services, but
                                can't upload sheets or add students, and can't change a tick once it's locked.
                      </p>
                      <div style={{ display: 'flex', gap: 10 }}>
                                <input placeholder="email@leverageedu.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 6 }} />
                                <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 6 }} />
                                <button className="btn primary" onClick={invite} disabled={inviting}>{inviting ? 'Inviting...' : 'Invite'}</button>
                      </div>
                {err && <div className="error-text">{err}</div>}
              </div>
        
              <div className="card">
                      <div className="card-title">Team</div>
                {loading ? <div>Loading...</div> : (
                        <table>
                                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
                                    <tbody>
                                      {users.map((u) => (
                          <tr key={u.id}>
                                            <td>{u.name || '-'}</td>
                                            <td>{u.email}</td>
                                            <td><span className="tag">{u.role}</span></td>
                                            <td><span className={`tag ${u.active ? '' : 'unmarked'}`}>{u.active ? 'Active' : 'Deactivated'}</span></td>
                                            <td>
                                              {u.role !== 'superadmin' && (
                                                  <button className="btn" onClick={() => toggleActive(u)}>
                                                    {u.active ? 'Deactivate' : 'Reactivate'}
                                                  </button>
                                                                )}
                                            </td>
                          </tr>
                        ))}
                                    </tbody>
                        </table>
                      )}
              </div>
        </>
      );
}
</>
