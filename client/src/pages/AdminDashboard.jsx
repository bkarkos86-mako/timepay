import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import WorksiteLocationPicker from '../components/WorksiteLocationPicker';
import ReasonPromptModal from '../components/ReasonPromptModal';

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}
function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function mapUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
function MapLink({ lat, lng }) {
  if (lat == null || lng == null) return <span className="muted">no location</span>;
  return (
    <a href={mapUrl(lat, lng)} target="_blank" rel="noreferrer">
      📍 {lat.toFixed(4)}, {lng.toFixed(4)}
    </a>
  );
}
// For punch locations: leads with a plain In/Out geofence badge — the exact
// coordinates stay one click away via a small map-pin link, not the headline.
function LocationStatus({ lat, lng, distanceMeters, outsideGeofence }) {
  if (lat == null || lng == null) return <span className="muted">no location</span>;
  const title = distanceMeters != null ? `${Math.round(distanceMeters)}m from nearest worksite` : 'No worksite configured to compare against';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      {distanceMeters != null ? (
        <span className={`badge ${outsideGeofence ? 'badge-denied' : 'badge-approved'}`} title={title}>
          {outsideGeofence ? 'Out' : 'In'}
        </span>
      ) : (
        <span className="muted" title={title}>
          n/a
        </span>
      )}
      <a href={mapUrl(lat, lng)} target="_blank" rel="noreferrer" title="View on map" style={{ opacity: 0.55 }}>
        📍
      </a>
    </span>
  );
}

export default function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [active, setActive] = useState([]);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [error, setError] = useState('');

  const [range, setRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toInputDate(start), to: toInputDate(now) };
  });
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [summary, setSummary] = useState(null);

  const [newEmployee, setNewEmployee] = useState({ firstName: '', lastName: '', email: '', password: '', roleName: '', hourlyRate: '', hireDate: '' });
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  const [worksites, setWorksites] = useState([]);
  const [flaggedEntries, setFlaggedEntries] = useState([]);
  const [newWorksite, setNewWorksite] = useState({ name: '', lat: '', lng: '', radiusMeters: 150 });
  const [savingWorksite, setSavingWorksite] = useState(false);
  const [locatingWorksite, setLocatingWorksite] = useState(false);
  const [geofenceIncidents, setGeofenceIncidents] = useState([]);
  const [pingChallenges, setPingChallenges] = useState([]);
  const [longRunningShifts, setLongRunningShifts] = useState([]);
  const [reasonModal, setReasonModal] = useState(null); // { title, confirmLabel, onConfirm(reason) }
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const [
        statsData,
        activeData,
        pendingData,
        pendingLeaveData,
        employeesData,
        auditData,
        worksitesData,
        flaggedData,
        incidentsData,
        challengesData,
        staleShiftsData,
      ] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/time-entries/active'),
        api.get('/time-entries/pending'),
        api.get('/leave/requests?status=PENDING'),
        api.get('/employees'),
        api.get('/admin/audit-log'),
        api.get('/worksites'),
        api.get('/admin/flagged-entries'),
        api.get('/admin/geofence-incidents'),
        api.get('/admin/ping-challenges'),
        api.get('/admin/long-running-shifts'),
      ]);
      setStats(statsData);
      setActive(activeData);
      setPendingEntries(pendingData);
      setPendingLeave(pendingLeaveData);
      setEmployees(employeesData);
      setAuditLog(auditData.slice(0, 20));
      setWorksites(worksitesData);
      setFlaggedEntries(flaggedData);
      setGeofenceIncidents(incidentsData);
      setPingChallenges(challengesData);
      setLongRunningShifts(staleShiftsData);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function forceClockOut(id) {
    setReasonModal({
      title: 'Reason for clocking this employee out',
      confirmLabel: 'Clock out',
      onConfirm: async (reason) => {
        try {
          await api.post(`/time-entries/${id}/force-clock-out`, { reason });
          setReasonModal(null);
          load();
        } catch (err) {
          setError(err.message);
        }
      },
    });
  }

  async function approveEntry(id) {
    try {
      await api.post(`/time-entries/${id}/approve`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  function rejectEntry(id) {
    setReasonModal({
      title: 'Reason for rejecting this entry',
      confirmLabel: 'Reject',
      onConfirm: async (reason) => {
        try {
          await api.post(`/time-entries/${id}/reject`, { reason });
          setReasonModal(null);
          load();
        } catch (err) {
          setError(err.message);
        }
      },
    });
  }
  async function approveLeave(id) {
    try {
      await api.post(`/leave/requests/${id}/approve`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  function denyLeave(id) {
    setReasonModal({
      title: 'Reason for denying this request',
      confirmLabel: 'Deny',
      onConfirm: async (decisionNote) => {
        try {
          await api.post(`/leave/requests/${id}/deny`, { decisionNote });
          setReasonModal(null);
          load();
        } catch (err) {
          setError(err.message);
        }
      },
    });
  }

  async function runSummary() {
    setError('');
    if (!selectedEmployee) {
      setError('Select a specific employee to preview a summary, or use Export CSV for all employees at once.');
      setSummary(null);
      return;
    }
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to, employeeId: selectedEmployee });
      const data = await api.get(`/payroll/summary?${q.toString()}`);
      setSummary(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportCsv() {
    setError('');
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to });
      if (selectedEmployee) q.set('employeeId', selectedEmployee);
      const csvText = await api.get(`/admin/export/csv?${q.toString()}`);
      const blob = new Blob([csvText], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_${range.from}_${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createEmployee(e) {
    e.preventDefault();
    setCreatingEmployee(true);
    setError('');
    try {
      await api.post('/employees', {
        firstName: newEmployee.firstName,
        lastName: newEmployee.lastName,
        email: newEmployee.email,
        password: newEmployee.password,
        hireDate: newEmployee.hireDate || undefined,
        jobRoles: [{ roleName: newEmployee.roleName, hourlyRate: Number(newEmployee.hourlyRate), isDefault: true }],
      });
      setNewEmployee({ firstName: '', lastName: '', email: '', password: '', roleName: '', hourlyRate: '', hireDate: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingEmployee(false);
    }
  }

  async function useCurrentLocation() {
    setLocatingWorksite(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewWorksite((w) => ({ ...w, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setLocatingWorksite(false);
      },
      () => {
        setError('Could not get current location — enter coordinates manually.');
        setLocatingWorksite(false);
      }
    );
  }

  async function createWorksite(e) {
    e.preventDefault();
    setSavingWorksite(true);
    setError('');
    try {
      await api.post('/worksites', newWorksite);
      setNewWorksite({ name: '', lat: '', lng: '', radiusMeters: 150 });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingWorksite(false);
    }
  }

  async function toggleWorksiteActive(w) {
    await api.patch(`/worksites/${w.id}`, { isActive: !w.isActive });
    load();
  }

  async function deleteWorksite(id) {
    await api.del(`/worksites/${id}`);
    load();
  }

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-cols-4 section">
        <div className="card">
          <div className="stat-label">Currently clocked in</div>
          <div className="stat-value">{stats?.activeCount ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Late today</div>
          <div className="stat-value">{stats?.lateToday ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Tardy today (15m+)</div>
          <div className="stat-value">{stats?.tardyToday ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Pending time entries</div>
          <div className="stat-value">{stats?.pendingTimeEntries ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Pending leave</div>
          <div className="stat-value">{stats?.pendingLeave ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Outside geofence today</div>
          <div className="stat-value">{stats?.outsideGeofenceToday ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Open location incidents</div>
          <div className="stat-value">{stats?.openIncidents ?? '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 section">
        <div className="card">
          <h3>Currently clocked in</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {active.map((e) => (
                  <tr key={e.id}>
                    <td>{e.employee.firstName} {e.employee.lastName}</td>
                    <td>{e.roleName}</td>
                    <td>since {fmtTime(e.clockIn)}</td>
                    <td>
                      <LocationStatus lat={e.clockInLat} lng={e.clockInLng} distanceMeters={e.clockInDistanceMeters} outsideGeofence={e.clockInOutsideGeofence} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {e.isTardy && <span className="badge badge-denied">Tardy</span>}
                      {e.isLate && !e.isTardy && <span className="badge badge-pending">Late</span>}
                    </td>
                    <td>
                      <button className="btn btn-danger" onClick={() => forceClockOut(e.id)}>
                        Clock out
                      </button>
                    </td>
                  </tr>
                ))}
                {active.length === 0 && (
                  <tr>
                    <td className="muted">No one is clocked in right now.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Pending manual entries</h3>
          <table>
            <tbody>
              {pendingEntries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.employee.firstName} {e.employee.lastName}
                    <div className="muted">{fmtDate(e.clockIn)} · {e.reason}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ marginRight: '0.4rem' }} onClick={() => approveEntry(e.id)}>
                      Approve
                    </button>
                    <button className="btn btn-danger" onClick={() => rejectEntry(e.id)}>
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
              {pendingEntries.length === 0 && (
                <tr>
                  <td className="muted">Nothing pending.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>Flagged entries (last 14 days)</h3>
        <p className="muted">Clock-ins/outs that were late, undertime, or outside every configured worksite's geofence.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {flaggedEntries.map((e) => (
                <tr key={e.id}>
                  <td>{e.employee.firstName} {e.employee.lastName}</td>
                  <td>{fmtDate(e.clockIn)}</td>
                  <td>
                    <LocationStatus lat={e.clockInLat} lng={e.clockInLng} distanceMeters={e.clockInDistanceMeters} outsideGeofence={e.clockInOutsideGeofence} />
                  </td>
                  <td>
                    <LocationStatus lat={e.clockOutLat} lng={e.clockOutLng} distanceMeters={e.clockOutDistanceMeters} outsideGeofence={e.clockOutOutsideGeofence} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e.isTardy && <span className="badge badge-denied">Tardy {e.lateMinutes}m</span>}{' '}
                    {e.isLate && !e.isTardy && <span className="badge badge-pending">Late {e.lateMinutes}m</span>}{' '}
                    {e.isUndertime && <span className="badge badge-pending">Undertime {e.undertimeMinutes}m</span>}
                  </td>
                </tr>
              ))}
              {flaggedEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Nothing flagged in the last 14 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>Location incidents (left area while clocked in)</h3>
        <p className="muted">Opens the moment a clocked-in employee's location ping lands outside every worksite's geofence.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Started</th>
                <th>Last known location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {geofenceIncidents.map((i) => (
                <tr key={i.id}>
                  <td>{i.employee.firstName} {i.employee.lastName}</td>
                  <td>{new Date(i.startedAt).toLocaleString()}</td>
                  <td>
                    <MapLink lat={i.lastLat} lng={i.lastLng} />
                    {i.lastDistanceMeters != null && <div className="muted">~{Math.round(i.lastDistanceMeters)}m from worksite</div>}
                  </td>
                  <td>
                    {!i.resolvedAt && <span className="badge badge-denied">Open</span>}
                    {i.resolution === 'RETURNED' && <span className="badge badge-approved">Returned</span>}
                    {i.resolution === 'PHOTO_VERIFIED' && (
                      <span>
                        <span className="badge badge-approved">Photo verified</span>{' '}
                        {i.verificationPhotoUrl && (
                          <a href={i.verificationPhotoUrl} target="_blank" rel="noreferrer">
                            view photo
                          </a>
                        )}
                      </span>
                    )}
                    {i.resolution === 'FORCED_CLOCK_OUT' && (
                      <span className="badge badge-denied">Forced clock-out{i.resolvedBy ? ` by ${i.resolvedBy.firstName}` : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
              {geofenceIncidents.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No location incidents on record.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>Location check-ins</h3>
        <p className="muted">
          Occasional, unannounced location spot-checks sent to clocked-in employees. A miss isn't held against anyone
          automatically — review and decide case by case.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Scheduled</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pingChallenges.map((c) => (
                <tr key={c.id}>
                  <td>{c.employee.firstName} {c.employee.lastName}</td>
                  <td>{new Date(c.sentAt || c.scheduledAt).toLocaleString()}</td>
                  <td>
                    {c.status === 'RESPONDED' ? (
                      <LocationStatus lat={c.lat} lng={c.lng} distanceMeters={c.distanceMeters} outsideGeofence={c.outsideGeofence} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {c.status === 'SCHEDULED' && <span className="badge badge-closed">Upcoming</span>}
                    {c.status === 'PENDING' && <span className="badge badge-pending">Awaiting response</span>}
                    {c.status === 'RESPONDED' && <span className="badge badge-approved">Responded</span>}
                    {c.status === 'MISSED' && <span className="badge badge-denied">Missed</span>}
                    {c.status === 'CANCELLED' && <span className="badge badge-closed">Cancelled (shift ended)</span>}
                  </td>
                </tr>
              ))}
              {pingChallenges.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No location check-ins sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>Long-running open shifts</h3>
        <p className="muted">Housekeeping, not an alarm — usually someone forgot to clock out, or their phone died.</p>
        <table>
          <tbody>
            {longRunningShifts.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.employee.firstName} {e.employee.lastName}
                  <div className="muted">{e.roleName} · clocked in {fmtDate(e.clockIn)} at {fmtTime(e.clockIn)}</div>
                </td>
                <td>
                  <button className="btn btn-danger" onClick={() => forceClockOut(e.id)}>
                    Clock out
                  </button>
                </td>
              </tr>
            ))}
            {longRunningShifts.length === 0 && (
              <tr>
                <td className="muted">Nothing unusually long right now.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card section">
        <h3>Pending leave requests</h3>
        <table>
          <tbody>
            {pendingLeave.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.employee.firstName} {r.employee.lastName}
                  <div className="muted">{r.leaveType.name} · {fmtDate(r.startDate)}–{fmtDate(r.endDate)} · {r.reason}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ marginRight: '0.4rem' }} onClick={() => approveLeave(r.id)}>
                    Approve
                  </button>
                  <button className="btn btn-danger" onClick={() => denyLeave(r.id)}>
                    Deny
                  </button>
                </td>
              </tr>
            ))}
            {pendingLeave.length === 0 && (
              <tr>
                <td className="muted">Nothing pending.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card section">
        <h3>Payroll summary & export</h3>
        <div className="grid grid-cols-4">
          <div className="field">
            <label>From</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <div className="field">
            <label>Employee (optional)</label>
            <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ justifyContent: 'flex-end', flexDirection: 'row', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={runSummary} type="button">
              Preview
            </button>
            <button className="btn" onClick={exportCsv} type="button">
              Export CSV
            </button>
          </div>
        </div>
        {summary && (
          <div className="grid grid-cols-4" style={{ marginTop: '0.5rem' }}>
            <div>
              <div className="stat-label">Regular hrs</div>
              <div className="stat-value">{summary.regularHours.toFixed(1)}</div>
            </div>
            <div>
              <div className="stat-label">OT hrs</div>
              <div className="stat-value">{summary.otHours.toFixed(1)}</div>
            </div>
            <div>
              <div className="stat-label">Night diff hrs</div>
              <div className="stat-value">{summary.nightDiffHours.toFixed(1)}</div>
            </div>
            <div>
              <div className="stat-label">Gross pay</div>
              <div className="stat-value">₱{summary.grossPay.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card section">
        <h3>Worksites (geofencing)</h3>
        <p className="muted">
          When at least one active worksite is configured, every clock in/out is checked against the nearest one and flagged if
          outside its radius. With none configured, location is still captured but nothing is auto-flagged.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Radius</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {worksites.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>
                    <MapLink lat={w.lat} lng={w.lng} />
                  </td>
                  <td>{w.radiusMeters}m</td>
                  <td>
                    <span className={`badge ${w.isActive ? 'badge-approved' : 'badge-closed'}`}>{w.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  {isAdmin && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary" style={{ marginRight: '0.4rem' }} onClick={() => toggleWorksiteActive(w)}>
                        {w.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-danger" onClick={() => deleteWorksite(w.id)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {worksites.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="muted">
                    No worksites configured — geofencing is off.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isAdmin && (
          <form onSubmit={createWorksite} style={{ marginTop: '0.8rem' }}>
            <div className="field">
              <label>Name</label>
              <input required value={newWorksite.name} onChange={(e) => setNewWorksite({ ...newWorksite, name: e.target.value })} />
            </div>

            <div className="field">
              <label>Location</label>
              <WorksiteLocationPicker
                lat={newWorksite.lat === '' ? null : Number(newWorksite.lat)}
                lng={newWorksite.lng === '' ? null : Number(newWorksite.lng)}
                onChange={({ lat, lng }) => setNewWorksite((w) => ({ ...w, lat: String(lat), lng: String(lng) }))}
              />
            </div>

            <div className="grid grid-cols-3">
              <div className="field">
                <label>Latitude</label>
                <input required type="number" step="any" value={newWorksite.lat} onChange={(e) => setNewWorksite({ ...newWorksite, lat: e.target.value })} />
              </div>
              <div className="field">
                <label>Longitude</label>
                <input required type="number" step="any" value={newWorksite.lng} onChange={(e) => setNewWorksite({ ...newWorksite, lng: e.target.value })} />
              </div>
              <div className="field">
                <label>Radius (meters)</label>
                <input required type="number" value={newWorksite.radiusMeters} onChange={(e) => setNewWorksite({ ...newWorksite, radiusMeters: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={useCurrentLocation} disabled={locatingWorksite} style={{ marginRight: '0.5rem' }}>
              {locatingWorksite ? 'Locating…' : '📍 Use my current location'}
            </button>
            <button className="btn" type="submit" disabled={savingWorksite}>
              {savingWorksite ? 'Saving…' : 'Add worksite'}
            </button>
          </form>
        )}
      </div>

      <div className="section">
        <h2>Employees</h2>
        <div className="grid grid-cols-3">
          {employees
            .filter((e) => e.employmentStatus === 'ACTIVE')
            .map((e) => (
              <Link key={e.id} to={`/admin/employees/${e.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                <h3 style={{ marginBottom: '0.2rem' }}>{e.firstName} {e.lastName}</h3>
                <p className="muted" style={{ marginBottom: '0.5rem' }}>{e.email}</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-closed">{e.jobRoles?.map((r) => r.roleName).join(', ') || 'No role'}</span>
                  <span className="badge badge-approved">{e.employmentStatus}</span>
                </div>
              </Link>
            ))}
          {employees.filter((e) => e.employmentStatus === 'ACTIVE').length === 0 && <p className="muted">No active employees.</p>}
        </div>

        {employees.some((e) => e.employmentStatus !== 'ACTIVE') && (
          <>
            <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? 'Hide' : 'Show'} archived ({employees.filter((e) => e.employmentStatus !== 'ACTIVE').length})
            </button>
            {showArchived && (
              <div className="grid grid-cols-3" style={{ marginTop: '1rem' }}>
                {employees
                  .filter((e) => e.employmentStatus !== 'ACTIVE')
                  .map((e) => (
                    <Link key={e.id} to={`/admin/employees/${e.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit', opacity: 0.75 }}>
                      <h3 style={{ marginBottom: '0.2rem' }}>{e.firstName} {e.lastName}</h3>
                      <p className="muted" style={{ marginBottom: '0.5rem' }}>{e.email}</p>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-closed">{e.jobRoles?.map((r) => r.roleName).join(', ') || 'No role'}</span>
                        <span className="badge badge-denied">{e.employmentStatus}</span>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </>
        )}

        {isAdmin && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3>Add employee</h3>
            <form onSubmit={createEmployee}>
              <div className="grid grid-cols-2">
                <div className="field">
                  <label>First name</label>
                  <input required value={newEmployee.firstName} onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input required value={newEmployee.lastName} onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" required value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Temporary password</label>
                <input type="text" required value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} />
              </div>
              <div className="field">
                <label>Hire date (optional — defaults to today)</label>
                <input type="date" value={newEmployee.hireDate} onChange={(e) => setNewEmployee({ ...newEmployee, hireDate: e.target.value })} />
              </div>
              <div className="grid grid-cols-2">
                <div className="field">
                  <label>Job role</label>
                  <input required value={newEmployee.roleName} onChange={(e) => setNewEmployee({ ...newEmployee, roleName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Hourly rate (₱)</label>
                  <input type="number" step="0.01" required value={newEmployee.hourlyRate} onChange={(e) => setNewEmployee({ ...newEmployee, hourlyRate: e.target.value })} />
                </div>
              </div>
              <button className="btn" type="submit" disabled={creatingEmployee}>
                {creatingEmployee ? 'Creating…' : 'Create employee'}
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="card section">
        <h3>Recent audit log</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Entity</th>
                <th>Change</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.timestamp).toLocaleString()}</td>
                  <td>{l.changedBy.firstName} {l.changedBy.lastName}</td>
                  <td>{l.entityType}</td>
                  <td>{l.changeDescription}</td>
                  <td>{l.reason || '—'}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No audit events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
