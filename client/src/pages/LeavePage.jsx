import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export default function LeavePage() {
  const [types, setTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [typesData, requestsData] = await Promise.all([api.get('/leave/types'), api.get('/leave/requests')]);
    setTypes(typesData);
    setRequests(requestsData);
    if (!form.leaveTypeId && typesData.length) setForm((f) => ({ ...f, leaveTypeId: typesData[0].id }));

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
    const calendarData = await api.get(`/leave/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    setCalendar(calendarData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post('/leave/requests', form);
      if (result.staffingWarning) setNotice(result.staffingWarning);
      setForm({ ...form, startDate: '', endDate: '', reason: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Leave</h1>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="error-banner" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>{notice}</div>}

      <div className="grid grid-cols-2 section">
        <div className="card">
          <h3>Request leave</h3>
          <form onSubmit={submit}>
            <div className="field">
              <label>Leave type</label>
              <select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2">
              <div className="field">
                <label>Start date</label>
                <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="field">
                <label>End date</label>
                <input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Reason</label>
              <textarea required rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Upcoming approved leave (team)</h3>
          {calendar.length === 0 && <p className="muted">No approved leave in the next two months.</p>}
          <table>
            <tbody>
              {calendar.map((c) => (
                <tr key={c.id}>
                  <td>{c.employee.firstName} {c.employee.lastName}</td>
                  <td>{c.leaveType.name}</td>
                  <td>{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>My requests</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Hours</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.leaveType.name}</td>
                  <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                  <td>{r.hoursTotal}</td>
                  <td>{r.reason}</td>
                  <td>
                    <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No leave requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
