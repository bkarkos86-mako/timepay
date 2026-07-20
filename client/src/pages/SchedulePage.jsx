import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ShiftCalendar, { colorForEmployee } from '../components/ShiftCalendar';
import ReasonPromptModal from '../components/ReasonPromptModal';

// Local Y/M/D, not toISOString() (which is UTC and rolls the date back a
// day for any timezone ahead of UTC, e.g. Asia/Manila).
function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// All dates from start to end (inclusive) whose day-of-week is in `weekdays`.
function datesInRange(startStr, endStr, weekdays) {
  const dates = [];
  const cursor = new Date(`${startStr}T00:00:00`);
  const last = new Date(`${endStr}T00:00:00`);
  while (cursor <= last) {
    if (weekdays.includes(cursor.getDay())) dates.push(toInputDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export default function SchedulePage() {
  const { isManager } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(new Date());

  const [form, setForm] = useState({
    employeeId: '',
    roleName: '',
    date: toInputDate(new Date()),
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    isRestDay: false,
  });

  const [bulkForm, setBulkForm] = useState({
    employeeIds: [],
    startDate: toInputDate(new Date()),
    endDate: toInputDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    isRestDay: false,
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState('');

  const [selectedShift, setSelectedShift] = useState(null);
  const [requestModal, setRequestModal] = useState(null); // { date, shiftId }
  const [requestReason, setRequestReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);

  const load = useCallback(async () => {
    try {
      // Pad a week either side of the visible month so the calendar's
      // leading/trailing overflow days are populated too.
      const from = new Date(month.getFullYear(), month.getMonth(), -7).toISOString();
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 7).toISOString();
      const [employeesData, shiftsData, requestsData] = await Promise.all([
        api.get('/employees'),
        api.get(`/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api.get('/shifts/change-requests'),
      ]);
      setEmployees(employeesData);
      setShifts(shiftsData);
      setChangeRequests(requestsData);
      if (!form.employeeId && employeesData.length) {
        setForm((f) => ({ ...f, employeeId: employeesData[0].id, roleName: employeesData[0].jobRoles?.[0]?.roleName ?? '' }));
      }
    } catch (err) {
      setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

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
    setSelectedShift(null);
    load();
  }

  function toggleBulkEmployee(id) {
    setBulkForm((f) => ({
      ...f,
      employeeIds: f.employeeIds.includes(id) ? f.employeeIds.filter((x) => x !== id) : [...f.employeeIds, id],
    }));
  }

  function toggleBulkWeekday(day) {
    setBulkForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day) ? f.weekdays.filter((x) => x !== day) : [...f.weekdays, day].sort(),
    }));
  }

  const bulkDates = datesInRange(bulkForm.startDate, bulkForm.endDate, bulkForm.weekdays);
  const bulkPreviewCount = bulkForm.employeeIds.length * bulkDates.length;

  async function submitBulk(e) {
    e.preventDefault();
    setError('');
    setBulkNotice('');
    if (bulkForm.employeeIds.length === 0 || bulkDates.length === 0) {
      setError('Select at least one employee and at least one matching date.');
      return;
    }
    setBulkBusy(true);
    try {
      const shiftsPayload = [];
      for (const employeeId of bulkForm.employeeIds) {
        const emp = employees.find((e) => e.id === employeeId);
        const roleName = emp?.jobRoles?.find((r) => r.isDefault)?.roleName ?? emp?.jobRoles?.[0]?.roleName;
        for (const date of bulkDates) {
          shiftsPayload.push({
            employeeId,
            roleName,
            date,
            scheduledStart: new Date(`${date}T${bulkForm.startTime}`).toISOString(),
            scheduledEnd: new Date(`${date}T${bulkForm.endTime}`).toISOString(),
            breakMinutes: Number(bulkForm.breakMinutes),
            isRestDay: bulkForm.isRestDay,
          });
        }
      }
      const result = await api.post('/shifts/bulk', { shifts: shiftsPayload });
      setBulkNotice(`Added ${result.count} shifts.`);
      setBulkForm((f) => ({ ...f, employeeIds: [] }));
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  function handleDayClick(dateKey) {
    if (isManager) {
      setForm((f) => ({ ...f, date: dateKey }));
    } else {
      setRequestModal({ date: dateKey, shiftId: null });
      setRequestReason('');
    }
  }

  function handleShiftClick(shift) {
    setSelectedShift(shift);
  }

  function openRequestForShift(shift) {
    setSelectedShift(null);
    setRequestModal({ date: toInputDate(new Date(shift.date)), shiftId: shift.id });
    setRequestReason('');
  }

  async function submitChangeRequest(e) {
    e.preventDefault();
    setSubmittingRequest(true);
    setError('');
    try {
      await api.post('/shifts/change-requests', { date: requestModal.date, shiftId: requestModal.shiftId, reason: requestReason });
      setRequestModal(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingRequest(false);
    }
  }

  function approveRequest(id) {
    api
      .post(`/shifts/change-requests/${id}/approve`)
      .then(load)
      .catch((err) => setError(err.message));
  }

  function denyRequest(id) {
    setReasonModal({
      title: 'Reason for denying this change request',
      confirmLabel: 'Deny',
      onConfirm: async (decisionNote) => {
        try {
          await api.post(`/shifts/change-requests/${id}/deny`, { decisionNote });
          setReasonModal(null);
          load();
        } catch (err) {
          setError(err.message);
        }
      },
    });
  }

  const selectedEmployee = employees.find((e) => e.id === form.employeeId);
  const requestDates = new Set(changeRequests.filter((r) => r.status === 'PENDING').map((r) => toInputDate(new Date(r.date))));
  const pendingRequests = changeRequests.filter((r) => r.status === 'PENDING');
  const myRequests = changeRequests; // backend already scopes non-managers to their own

  return (
    <div>
      <h1>Shift Scheduling</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card section">
        <ShiftCalendar
          month={month}
          onMonthChange={setMonth}
          shifts={shifts}
          employees={employees}
          requestDates={requestDates}
          onDayClick={handleDayClick}
          onShiftClick={handleShiftClick}
          showLegend={isManager}
        />
        <p className="muted" style={{ marginTop: '0.6rem' }}>
          {isManager ? 'Click a day to prefill the "Schedule a shift" form below, or click a shift to view/remove it.' : 'Click a day (or a shift) to request a schedule change.'}
        </p>
      </div>

      {isManager && (
        <div className="card section">
          <h3>Pending shift change requests</h3>
          <table>
            <tbody>
              {pendingRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.employee.firstName} {r.employee.lastName}
                    <div className="muted">
                      {fmtDate(r.date)} {r.shift ? `· ${r.shift.roleName} ${fmtDateTime(r.shift.scheduledStart)}–${fmtDateTime(r.shift.scheduledEnd)}` : ''} · {r.reason}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ marginRight: '0.4rem' }} onClick={() => approveRequest(r.id)}>
                      Approve
                    </button>
                    <button className="btn btn-danger" onClick={() => denyRequest(r.id)}>
                      Deny
                    </button>
                  </td>
                </tr>
              ))}
              {pendingRequests.length === 0 && (
                <tr>
                  <td className="muted">Nothing pending.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isManager && (
        <div className="card section">
          <h3>My change requests</h3>
          <table>
            <tbody>
              {myRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {fmtDate(r.date)} — {r.reason}
                    {r.status === 'DENIED' && r.decisionNote && <div className="muted">{r.decisionNote}</div>}
                  </td>
                  <td>
                    <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {myRequests.length === 0 && (
                <tr>
                  <td className="muted">No change requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isManager && (
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
      )}

      {isManager && (
        <div className="card section">
          <h3>Bulk add shifts</h3>
          <p className="muted">Schedule the same shift pattern across a date range for one or more employees at once.</p>
          {bulkNotice && <p style={{ color: 'var(--accent)' }}>{bulkNotice}</p>}
          <form onSubmit={submitBulk}>
            <div className="field">
              <label>Employees</label>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.6rem',
                }}
              >
                {employees.map((emp) => (
                  <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={bulkForm.employeeIds.includes(emp.id)} onChange={() => toggleBulkEmployee(emp.id)} />
                    {emp.firstName} {emp.lastName}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="field">
                <label>Start date</label>
                <input type="date" value={bulkForm.startDate} onChange={(e) => setBulkForm({ ...bulkForm, startDate: e.target.value })} />
              </div>
              <div className="field">
                <label>End date</label>
                <input type="date" value={bulkForm.endDate} onChange={(e) => setBulkForm({ ...bulkForm, endDate: e.target.value })} />
              </div>
            </div>

            <div className="field">
              <label>Days of week</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {WEEKDAY_LABELS.map((label, day) => (
                  <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={bulkForm.weekdays.includes(day)} onChange={() => toggleBulkWeekday(day)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3">
              <div className="field">
                <label>Start time</label>
                <input type="time" value={bulkForm.startTime} onChange={(e) => setBulkForm({ ...bulkForm, startTime: e.target.value })} />
              </div>
              <div className="field">
                <label>End time</label>
                <input type="time" value={bulkForm.endTime} onChange={(e) => setBulkForm({ ...bulkForm, endTime: e.target.value })} />
              </div>
              <div className="field">
                <label>Break (minutes)</label>
                <input type="number" value={bulkForm.breakMinutes} onChange={(e) => setBulkForm({ ...bulkForm, breakMinutes: e.target.value })} />
              </div>
            </div>

            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <input type="checkbox" checked={bulkForm.isRestDay} onChange={(e) => setBulkForm({ ...bulkForm, isRestDay: e.target.checked })} />
              These are rest-day shifts (triggers rest-day premium pay)
            </label>

            <p className="muted">
              {bulkForm.employeeIds.length} employee{bulkForm.employeeIds.length === 1 ? '' : 's'} × {bulkDates.length} matching date
              {bulkDates.length === 1 ? '' : 's'} = <strong>{bulkPreviewCount}</strong> shift{bulkPreviewCount === 1 ? '' : 's'} will be created.
            </p>

            <button className="btn" type="submit" disabled={bulkBusy || bulkPreviewCount === 0}>
              {bulkBusy ? 'Saving…' : `Add ${bulkPreviewCount || ''} shifts`}
            </button>
          </form>
        </div>
      )}

      {selectedShift && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={() => setSelectedShift(null)}
        >
          <div className="card" style={{ width: '100%', maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
            <h3>
              {selectedShift.employee?.firstName} {selectedShift.employee?.lastName}
            </h3>
            <p className="muted">{selectedShift.roleName}</p>
            <p>
              {fmtDateTime(selectedShift.scheduledStart)} – {fmtDateTime(selectedShift.scheduledEnd)}
            </p>
            {selectedShift.isRestDay && <span className="badge badge-pending">Rest day</span>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {!isManager && (
                <button className="btn btn-secondary" onClick={() => openRequestForShift(selectedShift)}>
                  Request a change
                </button>
              )}
              {isManager && (
                <button className="btn btn-danger" onClick={() => deleteShift(selectedShift.id)}>
                  Remove shift
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setSelectedShift(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {requestModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={() => setRequestModal(null)}
        >
          <div className="card" style={{ width: '100%', maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Request a schedule change</h3>
            <p className="muted">{fmtDate(requestModal.date)}</p>
            <form onSubmit={submitChangeRequest}>
              <div className="field">
                <label>What do you need?</label>
                <textarea required rows={3} autoFocus value={requestReason} onChange={(e) => setRequestReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setRequestModal(null)} disabled={submittingRequest}>
                  Cancel
                </button>
                <button className="btn" type="submit" disabled={submittingRequest || !requestReason.trim()}>
                  {submittingRequest ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reasonModal && (
        <ReasonPromptModal
          title={reasonModal.title}
          confirmLabel={reasonModal.confirmLabel}
          onConfirm={reasonModal.onConfirm}
          onCancel={() => setReasonModal(null)}
        />
      )}
    </div>
  );
}
