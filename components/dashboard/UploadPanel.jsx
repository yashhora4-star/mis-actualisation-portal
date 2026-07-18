'use client';
import { useState } from 'react';
import { api } from '@/services/api';

const MONTHS = ['April 2026', 'May 2026', 'June 2026', 'July 2026'];

function UploadBlock({ title, endpoint, needsMonth, onDone }) {
    const [file, setFile] = useState(null);
    const [month, setMonth] = useState(MONTHS[2]);
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);

  async function submit() {
        if (!file) return setStatus('Choose a file first.');
        setBusy(true);
        setStatus('');
        try {
                const form = new FormData();
                form.append('file', file);
                if (needsMonth) form.append('month', month);
                const res = await api(endpoint, { method: 'POST', form });
                setStatus(`Done - ${res.inserted} row(s) imported${res.skippedNoStp ? `, ${res.skippedNoStp} skipped (missing STP code)` : ''}${res.unmatchedToStudent ? `, ${res.unmatchedToStudent} unmatched to a student` : ''}.`);
                onDone && onDone();
        } catch (e) {
                setStatus(`Error: ${e.message}`);
        } finally {
                setBusy(false);
        }
  }

  return (
        <div className="card">
              <div className="card-title">{title}</div>
              <div className="upload-drop">
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
                {needsMonth && (
                    <select className="cat-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                      {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                      )}
                      <button className="btn primary" onClick={submit} disabled={busy}>
                        {busy ? 'Uploading...' : 'Upload'}
                      </button>
              </div>
          {status && <div style={{ marginTop: 10, fontSize: 13 }}>{status}</div>}
        </div>
      );
}

function SheetSyncBlock({ onDone }) {
    const [sheetType, setSheetType] = useState('mis');
    const [month, setMonth] = useState('July 2026');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
  
    async function trigger() {
          setBusy(true);
          setStatus('');
          try {
                  const res = await api('/api/sheet-sync', { method: 'POST', body: { sheetType, month } });
                  setStatus(`Synced - ${res.inserted} row(s).`);
                  onDone && onDone();
          } catch (e) {
                  setStatus(`Error: ${e.message}`);
          } finally {
                  setBusy(false);
          }
    }
  
    return (
          <div className="card">
                <div className="card-title">July onward - pull from live Google Sheet</div>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                        Needs a row in <code>sheet_sync_config</code> pointing at the live sheet
                        (see README). Once set up, this reuses the exact same parser as manual upload.
                </p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <select className="cat-select" value={sheetType} onChange={(e) => setSheetType(e.target.value)}>
                                  <option value="mis">MIS sheet</option>
                                  <option value="pnl">P&amp;L sheet</option>
                        </select>
                        <select className="cat-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button className="btn primary" onClick={trigger} disabled={busy}>
                          {busy ? 'Syncing...' : 'Sync now'}
                        </button>
                </div>
            {status && <div style={{ marginTop: 10, fontSize: 13 }}>{status}</div>}
          </div>
        );
}

export default function UploadPanel({ onUploaded }) {
    return (
          <>
                <UploadBlock title="MIS sheet (receivables) - April / May / June backfill" endpoint="/api/upload/mis" needsMonth onDone={onUploaded} />
                <UploadBlock title="P&L sheet (margin + servicing lines)" endpoint="/api/upload/pnl" needsMonth onDone={onUploaded} />
                <UploadBlock title="Card / bank statement (actualisation)" endpoint="/api/upload/card-statement" onDone={onUploaded} />
                <SheetSyncBlock onDone={onUploaded} />
          </>
        );
}
