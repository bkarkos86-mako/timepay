import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function toInputDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    roleName: '',
    date: toInputDate(new Date()),
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    isRestDay: false,
  });

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 21).toISOString();
      const [employeesData, shiftsData] = await Promise.all([
        api.get('/employees'),
        api.get(`/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      ]);
      setEmployees(employeesData);
      setShifts(shiftsData);
      if (!form.employeeId && employeesData.length) {
        setForm((f) => ({ ...f, employeeId: employeesData[0].id, roleName: employeesData[0].jobRoles?.[0]?.roleName ?? '' }));
      }
    } catch (err) {
      setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createShift(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const scheduledStart = new Date(`${form.date}T${form.startTime}`);
      const scheduledEnd = new Date(`${form.date}T${form.endTime}`);
      await api.post('/shifts', {
        employeeId: form.employeeId,
        roleName: form.roleName,
        date: form.date,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        breakMinutes: Number(form.breakMinutes),
        isRestDay: form.isRestDay,
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteShift(id) {
    await api.del(`/shifts/${id}`);
    load();
  }

  const selectedEmployee = employees.find((e) => e.id === form.employeeId);

  return (
    <div>
      <h1>Shift Scheduling</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card section">
        <h3>Schedule a shift</h3>
        <form onSubmit={createShift}>
          <div className="grid grid-cols-3">
            <div className="field">
              <label>Employee</label>
              <select
                value={form.employeeId}
                onChange={(e) => {
                  const emp = employees.find((x) => x.id === e.target.value);
                  setForm({ ...form, employeeId: e.target.value, roleName: emp?.jobRoles?.[0]?.roleName ?? '' });
                }}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })}>
                {selectedEmployee?.jobRoles?.map((r) => (
                  <option key={r.id} value={r.roleName}>
                    {r.roleName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Start time</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="field">
              <label>End time</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <div className="field">
              <label>Break (minutes)</label>
              <input type="number" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={form.isRestDay} onChange={(e) => setForm({ ...form, isRestDay: e.target.checked })} />
            This is the employee's designated rest day (triggers rest-day premium pay)
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Add shift'}
          </button>
        </form>
      </div>

      <div className="card section">
        <h3>Shifts (past week – next 3 weeks)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Start</th>
                <th>End</th>
                <th>Rest day</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.employee.firstName} {s.employee.lastName}</td>
                  <td>{s.roleName}</td>
                  <td>{fmtDateTime(s.scheduledStart)}</td>
                  <td>{fmtDateTime(s.scheduledEnd)}</td>
                  <td>{s.isRestDay ? <span className="badge badge-pending">Rest day</span> : '—'}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => deleteShift(s.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No shifts scheduled in this window.
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
