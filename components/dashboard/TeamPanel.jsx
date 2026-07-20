'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/services/api';

// Same country list used on the Add Student modal - kept in sync manually
// since POC scoping is keyed off the exact same `country` values.
const COUNTRY_OPTIONS = ['Italy', 'Germany', 'UK', 'Other'];

export default function TeamPanel() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [inviting, setInviting] = useState(false);
    // Which user's access editor is expanded
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState({ sees_all_students: false, is_mis_poc: false, countries: [] });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [settingPwId, setSettingPwId] = useState(null);

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
        if (!email || !password) return;
        if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
        setInviting(true);
        setErr('');
        try {
                await api('/api/admin/users', { method: 'POST', body: { email, name, password } });
                setEmail(''); setName(''); setPassword('');
                await load();
                alert(`Account created for ${email}. Share this password with them directly - no email was sent: ${password}`);
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

  async function deleteUser(u) {
        const sure = window.confirm(
          `Permanently delete ${u.email}? This removes their account and all their access - it can't be undone. Deactivate instead if you just want to block their login.`
        );
        if (!sure) return;
        setDeletingId(u.id);
        setErr('');
        try {
                await api('/api/admin/users', { method: 'DELETE', body: { id: u.id } });
                await load();
        } catch (e) {
                setErr(e.message);
        } finally {
                setDeletingId(null);
        }
  }

  async function setPasswordFor(u) {
        const pw = window.prompt(`Set a new password for ${u.email} (min 8 characters). Share it with them directly afterwards - no email is sent.`);
        if (!pw) return;
        if (pw.length < 8) { setErr('Password must be at least 8 characters'); return; }
        setSettingPwId(u.id);
        setErr('');
        try {
                await api('/api/admin/users', { method: 'PATCH', body: { id: u.id, password: pw } });
                alert(`Password set for ${u.email}. Share it with them now - they can sign in right away.`);
        } catch (e) {
                setErr(e.message);
        } finally {
                setSettingPwId(null);
        }
  }

  function openAccessEditor(u) {
        setEditingId(u.id);
        setDraft({ sees_all_students: !!u.sees_all_students, is_mis_poc: !!u.is_mis_poc, countries: u.countries || [] });
  }

  function toggleDraftCountry(country) {
        setDraft((d) => ({
                ...d,
                countries: d.countries.includes(country)
                  ? d.countries.filter((c) => c !== country)
                  : [...d.countries, country],
        }));
  }

  async function saveAccess(u) {
        setSaving(true);
        setErr('');
        try {
                await api('/api/admin/users', {
                        method: 'PATCH',
                        body: {
                                id: u.id,
                                sees_all_students: draft.sees_all_students,
                                is_mis_poc: draft.is_mis_poc,
                                // If they're the Accounts POC, country scoping is moot - clear it
                                // so the intent stays unambiguous in the DB.
                                countries: draft.sees_all_students ? [] : draft.countries,
                        },
                });
                setEditingId(null);
                await load();
        } catch (e) {
                setErr(e.message);
        } finally {
                setSaving(false);
        }
  }

  function accessSummary(u) {
        if (u.role === 'superadmin') return 'All students (superadmin)';
        const scope = u.sees_all_students ? 'All students (Accounts POC)'
          : (u.countries && u.countries.length) ? u.countries.join(', ')
          : 'No country assigned yet';
        return u.is_mis_poc ? `${scope} - MIS POC` : scope;
  }

  return (
        <>
              <div className="card">
                      <div className="card-title">Add a team member</div>
                      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                                Set a temporary password here and share it with them directly (Slack, WhatsApp, in
                                person) - no email is sent, so they can sign in immediately. New members always join
                                as <code> member</code> - they can view everything and tick services, but can't
                                upload sheets or add students, and can't change a tick once it's locked. After
                                creating, assign them a country (or make them the Accounts POC) below so they only
                                see the students relevant to them.
                      </p>
                      <div style={{ display: 'flex', gap: 10 }}>
                                <input placeholder="email@leverageedu.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 6 }} />
                                <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 6 }} />
                                <input placeholder="Temporary password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 6 }} />
                                <button className="btn primary" onClick={invite} disabled={inviting}>{inviting ? 'Creating...' : 'Create'}</button>
                      </div>
                {err && <div className="error-text">{err}</div>}
              </div>

              <div className="card">
                      <div className="card-title">Team</div>
                {loading ? <div>Loading...</div> : (
                        <table>
                                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Student access</th><th></th></tr></thead>
                                    <tbody>
                                      {users.map((u) => (
                          <Fragment key={u.id}>
                          <tr>
                                            <td>{u.name || '-'}</td>
                                            <td>{u.email}</td>
                                            <td><span className="tag">{u.role}</span></td>
                                            <td><span className={`tag ${u.active ? '' : 'unmarked'}`}>{u.active ? 'Active' : 'Deactivated'}</span></td>
                                            <td style={{ fontSize: 13 }}>{accessSummary(u)}</td>
                                            <td style={{ display: 'flex', gap: 8 }}>
                                              {u.role !== 'superadmin' && (
                                                <>
                                                  <button className="btn" onClick={() => (editingId === u.id ? setEditingId(null) : openAccessEditor(u))}>
                                                    {editingId === u.id ? 'Close' : 'Set access'}
                                                  </button>
                                                  <button className="btn" onClick={() => setPasswordFor(u)} disabled={settingPwId === u.id}>
                                                    {settingPwId === u.id ? 'Setting...' : 'Set password'}
                                                  </button>
                                                  <button className="btn" onClick={() => toggleActive(u)}>
                                                    {u.active ? 'Deactivate' : 'Reactivate'}
                                                  </button>
                                                  <button
                                                    className="btn"
                                                    style={{ color: 'var(--red)' }}
                                                    onClick={() => deleteUser(u)}
                                                    disabled={deletingId === u.id}
                                                  >
                                                    {deletingId === u.id ? 'Deleting...' : 'Delete'}
                                                  </button>
                                                </>
                                                                )}
                                            </td>
                          </tr>
                          {editingId === u.id && (
                            <tr>
                              <td colSpan={6} style={{ background: 'var(--surface-2, #f7f7f8)', padding: 14, borderRadius: 8 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                    <input
                                      type="checkbox"
                                      checked={draft.sees_all_students}
                                      onChange={(e) => setDraft((d) => ({ ...d, sees_all_students: e.target.checked }))}
                                    />
                                    Accounts POC - sees and can act on every student, in every country
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                    <input
                                      type="checkbox"
                                      checked={draft.is_mis_poc}
                                      onChange={(e) => setDraft((d) => ({ ...d, is_mis_poc: e.target.checked }))}
                                    />
                                    MIS POC - can add/edit/delete students and record payments (servicing-only members can only tick services)
                                  </label>
                                  !{draft.sees_all_students && (
                                    <div>
                                      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                                        Or scope this person to specific countries - they'll only see and tick services for students in these countries, and nothing else on the portal.
                                      </div>
                                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                        {COUNTRY_OPTIONS.map((c) => (
                                          <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                            <input
                                              type="checkbox"
                                              checked={draft.countries.includes(c)}
                                              onChange={() => toggleDraftCountry(c)}
                                            />
                                            {c}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                  <div>
                                    <button className="btn primary" onClick={() => saveAccess(u)} disabled={saving}>
                                      {saving ? 'Saving...' : 'Save access'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        ))}
                                    </tbody>
                      </table>
                      )}
              </div>
        </>
      );
}
