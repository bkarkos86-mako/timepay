import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ReasonPromptModal from '../components/ReasonPromptModal';

const RATING_LABELS = {
  EXCEEDS_EXPECTATIONS: 'Exceeds Expectations',
  MEETS_EXPECTATIONS: 'Meets Expectations',
  NEEDS_IMPROVEMENT: 'Needs Improvement',
  UNSATISFACTORY: 'Unsatisfactory',
};
const RATING_BADGE = {
  EXCEEDS_EXPECTATIONS: 'badge-approved',
  MEETS_EXPECTATIONS: 'badge-closed',
  NEEDS_IMPROVEMENT: 'badge-pending',
  UNSATISFACTORY: 'badge-denied',
};

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}
function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function toInputDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthsBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [employee, setEmployee] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [tardy, setTardy] = useState({ count: 0, entries: [] });
  const [error, setError] = useState('');
  const [reasonModal, setReasonModal] = useState(null);

  const [dateForm, setDateForm] = useState({ hireDate: '', regularizationDate: '' });
  const [savingDates, setSavingDates] = useState(false);

  const [reviewForm, setReviewForm] = useState({ rating: 'MEETS_EXPECTATIONS', notes: '', reviewDate: toInputDate(new Date().toISOString()) });
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(async () => {
    try {
      const [empData, reviewsData, tardyData] = await Promise.all([
        api.get(`/employees/${id}`),
        api.get(`/employees/${id}/performance-reviews`),
        api.get(`/employees/${id}/tardy-entries`),
      ]);
      setEmployee(empData);
      setReviews(reviewsData);
      setTardy(tardyData);
      setDateForm({ hireDate: toInputDate(empData.hireDate), regularizationDate: toInputDate(empData.regularizationDate) });
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDates(e) {
    e.preventDefault();
    setSavingDates(true);
    setError('');
    try {
      await api.patch(`/employees/${id}`, { hireDate: dateForm.hireDate, regularizationDate: dateForm.regularizationDate });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDates(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    setSubmittingReview(true);
    setError('');
    try {
      await api.post(`/employees/${id}/performance-reviews`, reviewForm);
      setReviewForm({ rating: 'MEETS_EXPECTATIONS', notes: '', reviewDate: toInputDate(new Date().toISOString()) });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  function removeEmployee() {
    setReasonModal({
      title: `Reason for removing ${employee.firstName} ${employee.lastName}`,
      confirmLabel: 'Remove',
      onConfirm: async (reason) => {
        try {
          await api.patch(`/employees/${id}`, { employmentStatus: 'TERMINATED', reason });
          setReasonModal(null);
          load();
        } catch (err) {
          setError(err.message);
        }
      },
    });
  }

  async function reactivateEmployee() {
    try {
      await api.patch(`/employees/${id}`, { employmentStatus: 'ACTIVE', reason: 'Reactivated' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!employee) return <p>Loading…</p>;

  const isRegular = employee.regularizationDate && new Date(employee.regularizationDate) <= new Date();
  const monthsToRegular = employee.regularizationDate ? monthsBetween(new Date(), employee.regularizationDate) : null;

  return (
    <div>
      <button className="btn-secondary btn" style={{ marginBottom: '1rem' }} onClick={() => navigate('/admin')}>
        ← Back to Admin Dashboard
      </button>

      {error && <div className="error-banner">{error}</div>}

      <div className="card section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="muted" style={{ marginBottom: '0.4rem' }}>{employee.email}</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className={`badge ${employee.employmentStatus === 'ACTIVE' ? 'badge-approved' : 'badge-denied'}`}>{employee.employmentStatus}</span>
            <span className="badge badge-closed">{employee.systemRole}</span>
            {employee.regularizationDate && (
              <span className={`badge ${isRegular ? 'badge-approved' : 'badge-pending'}`}>
                {isRegular ? 'Regular employee' : `Probationary — regular in ${monthsToRegular} mo`}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div>
            {employee.employmentStatus === 'ACTIVE' ? (
              <button className="btn btn-danger" onClick={removeEmployee}>
                Remove employee
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={reactivateEmployee}>
                Reactivate
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 section">
        <div className="card">
          <h3>Job roles</h3>
          <table>
            <tbody>
              {employee.jobRoles?.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.roleName} {r.isDefault && <span className="badge badge-closed">default</span>}
                  </td>
                  <td>₱{r.hourlyRate}/hr</td>
                  <td className="muted">{r.dailyAllowance > 0 ? `₱${r.dailyAllowance}/day allowance` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Employment dates</h3>
          <form onSubmit={saveDates}>
            <div className="field">
              <label>Hire date</label>
              <input type="date" required disabled={!isAdmin} value={dateForm.hireDate} onChange={(e) => setDateForm({ ...dateForm, hireDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Regular employee date</label>
              <input
                type="date"
                required
                disabled={!isAdmin}
                value={dateForm.regularizationDate}
                onChange={(e) => setDateForm({ ...dateForm, regularizationDate: e.target.value })}
              />
              <span className="muted">Defaults to hire date + 6 months (Labor Code Art. 296) — adjust if probation was extended or shortened.</span>
            </div>
            {isAdmin && (
              <button className="btn btn-secondary" type="submit" disabled={savingDates}>
                {savingDates ? 'Saving…' : 'Save dates'}
              </button>
            )}
          </form>
        </div>
      </div>

      <div className="card section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ marginBottom: 0 }}>Tardiness</h3>
          <div style={{ textAlign: 'right' }}>
            <div className="stat-value" style={{ lineHeight: 1 }}>{tardy.count}</div>
            <div className="stat-label">tardy clock-ins (15m+ late)</div>
          </div>
        </div>
        <p className="muted">Reference these when writing a performance review below.</p>
        <div className="table-wrap">
          <table>
            <tbody>
              {tardy.entries.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDateTime(e.clockIn)}</td>
                  <td>{e.roleName}</td>
                  <td>{e.lateMinutes}m late</td>
                </tr>
              ))}
              {tardy.entries.length === 0 && (
                <tr>
                  <td className="muted">No tardy clock-ins recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section">
        <h3>Performance reviews</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Rating</th>
                <th>Reviewed by</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.reviewDate)}</td>
                  <td>
                    <span className={`badge ${RATING_BADGE[r.rating]}`}>{RATING_LABELS[r.rating] || r.rating}</span>
                  </td>
                  <td>{r.reviewedBy.firstName} {r.reviewedBy.lastName}</td>
                  <td>{r.notes}</td>
                </tr>
              ))}
              {reviews.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No performance reviews recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={submitReview} style={{ marginTop: '1rem' }}>
          <div className="grid grid-cols-2">
            <div className="field">
              <label>Rating</label>
              <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}>
                {Object.entries(RATING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Review date</label>
              <input type="date" required value={reviewForm.reviewDate} onChange={(e) => setReviewForm({ ...reviewForm, reviewDate: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea required rows={3} value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} />
          </div>
          <button className="btn" type="submit" disabled={submittingReview}>
            {submittingReview ? 'Saving…' : 'Add review'}
          </button>
        </form>
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
