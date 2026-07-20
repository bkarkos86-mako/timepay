import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PhotoGeoCapture from '../components/PhotoGeoCapture';
import PasskeySettings from '../components/PasskeySettings';
import NotificationSettings from '../components/NotificationSettings';

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}
function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function EmployeeDashboard() {
  const { employee } = useAuth();
  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);
  const [balances, setBalances] = useState([]);
  const [summary, setSummary] = useState(null);
  const [payPeriods, setPayPeriods] = useState([]);
  const [error, setError] = useState('');
  const [showCapture, setShowCapture] = useState(null); // 'in' | 'out' | null
  const [selectedRole, setSelectedRole] = useState('');
  const [manualForm, setManualForm] = useState({ clockIn: '', clockOut: '', roleName: '', reason: '' });
  const [submittingManual, setSubmittingManual] = useState(false);

  const [worksitesExist, setWorksitesExist] = useState(false);
  const [openIncident, setOpenIncident] = useState(null);
  const [showIncidentCapture, setShowIncidentCapture] = useState(false);

  const openEntry = entries.find((e) => !e.clockOut);
  const activeBreak = openEntry?.breaks?.find((b) => !b.breakEnd);

  const load = useCallback(async () => {
    try {
      const [detailData, entriesData, balancesData, periods] = await Promise.all([
        api.get(`/employees/${employee.id}`),
        // Explicit employeeId: managers/admins otherwise get everyone's
        // entries back from this endpoint, not just their own.
        api.get(`/time-entries?employeeId=${employee.id}`),
        api.get('/leave/balances'),
        api.get('/payroll/pay-periods'),
      ]);
      setDetail(detailData);
      setEntries(entriesData);
      setBalances(balancesData);
      setPayPeriods(periods);
      if (!selectedRole && detailData.jobRoles?.length) {
        setSelectedRole(detailData.jobRoles.find((r) => r.isDefault)?.roleName ?? detailData.jobRoles[0].roleName);
      }

      const openPeriod = periods.find((p) => p.status === 'OPEN');
      const from = openPeriod ? openPeriod.startDate : startOfWeek().toISOString();
      const to = openPeriod ? openPeriod.endDate : new Date().toISOString();
      const summaryData = await api.get(`/payroll/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setSummary({ ...summaryData, from, to, isOpenPeriod: !!openPeriod });
    } catch (err) {
      setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/worksites')
      .then((sites) => setWorksitesExist(sites.some((w) => w.isActive)))
      .catch(() => {});
  }, []);

  // Periodic location check while clocked in — only runs when a worksite is
  // actually configured (geofencing is opt-in). Only works while this tab is
  // open and foregrounded; browsers throttle/suspend timers in background
  // tabs, so a closed app won't be caught in real time, only on next open.
  useEffect(() => {
    if (!openEntry || !worksitesExist || !navigator.geolocation) {
      setOpenIncident(null);
      return;
    }

    let cancelled = false;

    function pingOnce() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const result = await api.post(`/time-entries/${openEntry.id}/location-ping`, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            if (!cancelled) setOpenIncident(result.incident);
          } catch {
            // a failed ping shouldn't interrupt the shift
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }

    // Pick up an incident already open (e.g. page reloaded mid-incident) before the first scheduled ping.
    api
      .get(`/time-entries/${openEntry.id}/geofence-incidents/open`)
      .then((incident) => !cancelled && setOpenIncident(incident))
      .catch(() => {});

    pingOnce();
    const interval = setInterval(pingOnce, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [openEntry?.id, worksitesExist]);

  async function handleIncidentVerify({ blob, lat, lng }) {
    setError('');
    try {
      const form = new FormData();
      form.append('photo', blob, 'verify.jpg');
      form.append('lat', lat ?? '');
      form.append('lng', lng ?? '');
      await api.post(`/time-entries/${openEntry.id}/geofence-incidents/${openIncident.id}/verify`, form, { isForm: true });
      setShowIncidentCapture(false);
      setOpenIncident(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleClockIn({ blob, lat, lng }) {
    setError('');
    try {
      const form = new FormData();
      form.append('photo', blob, 'clock-in.jpg');
      form.append('lat', lat ?? '');
      form.append('lng', lng ?? '');
      form.append('roleName', selectedRole);
      await api.post('/time-entries/clock-in', form, { isForm: true });
      setShowCapture(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleClockOut({ blob, lat, lng }) {
    setError('');
    try {
      const form = new FormData();
      form.append('photo', blob, 'clock-out.jpg');
      form.append('lat', lat ?? '');
      form.append('lng', lng ?? '');
      await api.post(`/time-entries/${openEntry.id}/clock-out`, form, { isForm: true });
      setShowCapture(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleBreak(type) {
    setError('');
    try {
      if (activeBreak) {
        await api.post(`/time-entries/breaks/${activeBreak.id}/end`);
      } else {
        await api.post(`/time-entries/${openEntry.id}/breaks/start`, { type });
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitManualEntry(e) {
    e.preventDefault();
    setSubmittingManual(true);
    setError('');
    try {
      await api.post('/time-entries/manual', manualForm);
      setManualForm({ clockIn: '', clockOut: '', roleName: '', reason: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingManual(false);
    }
  }

  if (!detail) return <p>Loading…</p>;

  return (
    <div>
      <h1>Hi, {detail.firstName}</h1>
      {error && <div className="error-banner">{error}</div>}

      {openIncident && (
        <div className="error-banner" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div>
            <strong>You're outside the worksite area.</strong> Please return, or submit a photo to confirm your location.
            {openIncident.lastDistanceMeters != null && <span> (~{Math.round(openIncident.lastDistanceMeters)}m away)</span>}
          </div>
          {!showIncidentCapture && (
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowIncidentCapture(true)}>
              Submit photo to confirm location
            </button>
          )}
          {showIncidentCapture && (
            <PhotoGeoCapture confirmLabel="Submit verification photo" onConfirm={handleIncidentVerify} onCancel={() => setShowIncidentCapture(false)} />
          )}
        </div>
      )}

      <div className="clock-stats-wrap">
      <div className="grid grid-cols-4 section">
        <div className="card">
          <div className="stat-label">Regular hours ({summary?.isOpenPeriod ? 'this pay period' : 'this week'})</div>
          <div className="stat-value">{summary ? summary.regularHours.toFixed(1) : '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Overtime hours</div>
          <div className="stat-value">{summary ? summary.otHours.toFixed(1) : '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Estimated gross pay</div>
          <div className="stat-value">₱{summary ? summary.grossPay.toFixed(2) : '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Allowance{summary ? ` (${summary.allowanceDays}d)` : ''}</div>
          <div className="stat-value">₱{summary ? summary.allowancePay.toFixed(2) : '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 section">
        <div className="card">
          <h3>Clock {openEntry ? 'Out' : 'In'}</h3>
          {openEntry ? (
            <div>
              <p>
                Clocked in at <strong>{fmtTime(openEntry.clockIn)}</strong> as {openEntry.roleName}
                {openEntry.isTardy && <span className="badge badge-denied" style={{ marginLeft: '0.4rem' }}>Tardy {openEntry.lateMinutes}m</span>}
                {openEntry.isLate && !openEntry.isTardy && <span className="badge badge-pending" style={{ marginLeft: '0.4rem' }}>Late {openEntry.lateMinutes}m</span>}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <button className="btn btn-secondary" onClick={() => toggleBreak('BREAK')}>
                  {activeBreak?.type === 'BREAK' ? 'End Break' : 'Start Break'}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleBreak('LUNCH')}>
                  {activeBreak?.type === 'LUNCH' ? 'End Lunch' : 'Start Lunch'}
                </button>
              </div>
              {activeBreak && <p className="muted">On {activeBreak.type.toLowerCase()} since {fmtTime(activeBreak.breakStart)}</p>}
              {!showCapture && (
                <button className="btn btn-block" disabled={!!activeBreak} onClick={() => setShowCapture('out')}>
                  Clock Out
                </button>
              )}
              {activeBreak && <p className="muted">End your break before clocking out.</p>}
            </div>
          ) : (
            <div>
              {detail.jobRoles?.length > 1 && (
                <div className="field">
                  <label>Role for this shift</label>
                  <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                    {detail.jobRoles.map((r) => (
                      <option key={r.id} value={r.roleName}>
                        {r.roleName} (₱{r.hourlyRate}/hr)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!showCapture && (
                <button className="btn btn-block" onClick={() => setShowCapture('in')}>
                  Clock In
                </button>
              )}
            </div>
          )}
          {showCapture && (
            <div style={{ marginTop: '0.75rem' }}>
              <PhotoGeoCapture
                confirmLabel={showCapture === 'in' ? 'Confirm Clock In' : 'Confirm Clock Out'}
                onConfirm={showCapture === 'in' ? handleClockIn : handleClockOut}
                onCancel={() => setShowCapture(null)}
              />
            </div>
          )}
        </div>

        <div className="card">
          <h3>Leave balances</h3>
          {balances.length === 0 && <p className="muted">No leave balances yet.</p>}
          <table>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id}>
                  <td>{b.leaveType.name}</td>
                  <td>{b.balanceHours.toFixed(1)} hrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <div className="card section">
        <h3>Submit manual time entry</h3>
        <p className="muted">Manual entries require a reason and go to your manager for approval.</p>
        <form onSubmit={submitManualEntry}>
          <div className="grid grid-cols-2">
            <div className="field">
              <label>Clock in</label>
              <input type="datetime-local" required value={manualForm.clockIn} onChange={(e) => setManualForm({ ...manualForm, clockIn: e.target.value })} />
            </div>
            <div className="field">
              <label>Clock out (optional)</label>
              <input type="datetime-local" value={manualForm.clockOut} onChange={(e) => setManualForm({ ...manualForm, clockOut: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Role</label>
            <select required value={manualForm.roleName} onChange={(e) => setManualForm({ ...manualForm, roleName: e.target.value })}>
              <option value="" disabled>
                Select role
              </option>
              {detail.jobRoles?.map((r) => (
                <option key={r.id} value={r.roleName}>
                  {r.roleName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Reason</label>
            <textarea required rows={2} value={manualForm.reason} onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })} />
          </div>
          <button className="btn" type="submit" disabled={submittingManual}>
            {submittingManual ? 'Submitting…' : 'Submit for approval'}
          </button>
        </form>
      </div>

      <div className="card section">
        <h3>Recent time entries</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Role</th>
                <th>In</th>
                <th>Out</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 15).map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.clockIn)}</td>
                  <td>{e.roleName}</td>
                  <td>{fmtTime(e.clockIn)}</td>
                  <td>{fmtTime(e.clockOut)}</td>
                  <td>{e.type}</td>
                  <td>
                    <span className={`badge badge-${e.status.toLowerCase()}`}>{e.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>Pay period history</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payPeriods.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.startDate)}</td>
                  <td>{fmtDate(p.endDate)}</td>
                  <td>
                    <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
              {payPeriods.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No pay periods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NotificationSettings />
      <PasskeySettings />
    </div>
  );
}
