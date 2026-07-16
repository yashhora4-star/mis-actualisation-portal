'use client';
import { useState } from 'react';
import { api } from '@/services/api';

export default function AddStudentModal({ onClose, onAdded }) {
    const [form, setForm] = useState({
          stp_code: '', student_name: '', email: '', country: '', package: '',
          month: 'July 2026', total_sale_amount: '', collected: '', outstanding: '',
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function submit() {
        if (!form.stp_code || !form.student_name || !form.month) {
                setErr('STP code, student name, and month are required.');
                return;
        }
        setBusy(true);
        setErr('');
        try {
                await api('/api/students', {
                          method: 'POST',
                          body: {
                                      ...form,
                                      total_sale_amount: form.total_sale_amount ? Number(form.total_sale_amount) : null,
                                      collected: form.collected ? Number(form.collected) : null,
                                      outstanding: form.outstanding ? Number(form.outstanding) : null,
                          },
                });
                onAdded && onAdded();
        } catch (e) {
                setErr(e.message);
        } finally {
                setBusy(false);
        }
  }

  return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                <div className="card" style={{ width: 480, background: 'var(--surface)' }}>
                          <div className="card-title">Add student (manual entry)</div>div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                  <div className="field"><label>STP code *</label>label><input value={form.stp_code} onChange={(e) => set('stp_code', e.target.value)} /></div>div>
                                  <div className="field"><label>Student name *</label>label><input value={form.student_name} onChange={(e) => set('student_name', e.target.value)} /></div>div>
                                  <div className="field"><label>Email</label>label><input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>div>
                                  <div className="field"><label>Country</label>label><input value={form.country} onChange={(e) => set('country', e.target.value)} /></div>div>
                                  <div className="field"><label>Package</label>label><input value={form.package} onChange={(e) => set('package', e.target.value)} placeholder="Italy / Germany / MBBS / L1E2E" /></div>div>
                                  <div className="field"><label>Month *</label>label><input value={form.month} onChange={(e) => set('month', e.target.value)} /></div>div>
                                  <div className="field"><label>Total sale amount</label>label><input value={form.total_sale_amount} onChange={(e) => set('total_sale_amount', e.target.value)} /></div>div>
                                  <div className="field"><label>Collected</label>label><input value={form.collected} onChange={(e) => set('collected', e.target.value)} /></div>div>
                                  <div className="field"><label>Outstanding</label>label><input value={form.outstanding} onChange={(e) => set('outstanding', e.target.value)} /></div>div>
                        </div>div>
                  {err && <div className="error-text">{err}</div>div>}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                                  <button className="btn" onClick={onClose}>Cancel</button>button>
                                  <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Adding...' : 'Add student'}</button>button>
                        </div>div>
                </div>div>
        </div>div>
      );
}
</div>
