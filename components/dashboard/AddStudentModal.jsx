'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { PACKAGE_OPTIONS } from '@/lib/reference-services';

const COUNTRY_OPTIONS = ['Italy', 'Germany', 'UK', 'Other'];

export default function AddStudentModal({ onClose, onAdded, student }) {
  const isEdit = !!student;
  const [form, setForm] = useState({
    stp_code: student?.stp_code || '',
    student_name: student?.student_name || '',
    email: student?.email || '',
    country: student?.country || '',
    package: student?.package || '',
    month: student?.month || 'July 2026',
    total_sale_amount: student?.total_sale_amount ?? '',
    collected: student?.collected ?? '',
    outstanding: student?.outstanding ?? '',
    net_amount_after_deduction: student?.net_amount_after_deduction ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  // Outstanding = Total sale - Collected, recalculated whenever either input
  // changes. Still a plain input underneath, so it can be overridden by hand
  // afterwards if the real-world number differs (e.g. write-offs, discounts).
  function setAndRecalcOutstanding(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      const sale = Number(next.total_sale_amount);
      const collected = Number(next.collected);
      if (next.total_sale_amount !== '' && next.collected !== '' && Number.isFinite(sale) && Number.isFinite(collected)) {
        next.outstanding = String(sale - collected);
      }
      return next;
    });
  }

  async function submit() {
    if (!isEdit && (!form.stp_code || !form.student_name || !form.month)) {
      setErr('STP code, student name, and month are required.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      if (isEdit) {
        await api('/api/students', {
          method: 'PATCH',
          body: {
            mis_record_id: student.mis_record_id,
            student_name: form.student_name,
            email: form.email,
            country: form.country,
            package: form.package,
            total_sale_amount: form.total_sale_amount ? Number(form.total_sale_amount) : null,
            collected: form.collected ? Number(form.collected) : null,
            outstanding: form.outstanding ? Number(form.outstanding) : null,
            net_amount_after_deduction: form.net_amount_after_deduction ? Number(form.net_amount_after_deduction) : null,
          },
        });
      } else {
        await api('/api/students', {
          method: 'POST',
          body: {
            ...form,
            total_sale_amount: form.total_sale_amount ? Number(form.total_sale_amount) : null,
            collected: form.collected ? Number(form.collected) : null,
            outstanding: form.outstanding ? Number(form.outstanding) : null,
            net_amount_after_deduction: form.net_amount_after_deduction ? Number(form.net_amount_after_deduction) : null,
          },
        });
      }
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
        <div className="card-title">{isEdit ? 'Edit student' : 'Add student (manual entry)'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>STP code {isEdit ? '' : '*'}</label>
            <input value={form.stp_code} disabled={isEdit} onChange={(e) => set('stp_code', e.target.value)} />
          </div>
          <div className="field">
            <label>Student name *</label>
            <input value={form.student_name} onChange={(e) => set('student_name', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field">
            <label>Country</label>
            <select className="cat-select" style={{ width: '100%' }} value={form.country} onChange={(e) => set('country', e.target.value)}>
              <option value="">Select...</option>
              {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Package</label>
            <select className="cat-select" style={{ width: '100%' }} value={form.package} onChange={(e) => set('package', e.target.value)}>
              <option value="">Select...</option>
              {PACKAGE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Month {isEdit ? '' : '*'}</label>
            <input value={form.month} disabled={isEdit} onChange={(e) => set('month', e.target.value)} />
          </div>
          <div className="field"><label>Total sale amount</label><input value={form.total_sale_amount} onChange={(e) => setAndRecalcOutstanding('total_sale_amount', e.target.value)} /></div>
          <div className="field"><label>Collected</label><input value={form.collected} onChange={(e) => setAndRecalcOutstanding('collected', e.target.value)} /></div>
          <div className="field"><label>Outstanding</label><input value={form.outstanding} onChange={(e) => set('outstanding', e.target.value)} /></div>
          <div className="field">
            <label>Net amount after deduction</label>
            <input
              value={form.net_amount_after_deduction}
              onChange={(e) => set('net_amount_after_deduction', e.target.value)}
              placeholder="Amount collected after bank/gateway deduction"
            />
          </div>
        </div>
        {err && <div className="error-text">{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving...' : isEdit ? 'Save changes' : 'Add student'}</button>
        </div>
      </div>
    </div>
  );
}
