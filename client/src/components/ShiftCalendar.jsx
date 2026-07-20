const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPLOYEE_COLORS = ['#2563eb', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#059669', '#ea580c'];

export function colorForEmployee(employeeId, employees) {
  const idx = employees.findIndex((e) => e.id === employeeId);
  return EMPLOYEE_COLORS[idx >= 0 ? idx % EMPLOYEE_COLORS.length : 0];
}

// Local Y/M/D, not toISOString() (which is UTC and rolls the date back a
// day for any timezone ahead of UTC, e.g. Asia/Manila).
function toDateKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtTimeShort(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Standard 6x7 month grid (Sun-start), like Google Calendar's month view —
// always shows leading/trailing days from adjacent months so the grid is a
// consistent rectangle.
function getMonthGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

/**
 * Month-view calendar with color-coded shift chips, similar in spirit to
 * Google Calendar's month view (not a pixel clone — no drag/resize).
 *
 * @param month        Date — any date within the month to display
 * @param onMonthChange(nextMonthDate)
 * @param shifts       Shift[] — already loaded for (at least) the visible grid range
 * @param employees    Employee[] — used only for color assignment + legend
 * @param requestDates Set<string> of 'YYYY-MM-DD' — days with a pending change request (shows a dot)
 * @param onDayClick(dateKey)
 * @param onShiftClick(shift)
 * @param showLegend   whether to render the employee color legend (skip for single-employee views)
 */
export default function ShiftCalendar({ month, onMonthChange, shifts, employees, requestDates, onDayClick, onShiftClick, showLegend = true }) {
  const days = getMonthGrid(month);
  const todayKey = toDateKey(new Date());
  const currentMonth = month.getMonth();

  const shiftsByDay = new Map();
  for (const s of shifts) {
    const key = toDateKey(s.date);
    if (!shiftsByDay.has(key)) shiftsByDay.set(key, []);
    shiftsByDay.get(key).push(s);
  }

  function prevMonth() {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  }
  function nextMonth() {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  }
  function goToday() {
    onMonthChange(new Date());
  }

  return (
    <div>
      <div className="cal-header">
        <h3 style={{ margin: 0 }}>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="btn btn-secondary" type="button" onClick={prevMonth}>
            ← Prev
          </button>
          <button className="btn btn-secondary" type="button" onClick={goToday}>
            Today
          </button>
          <button className="btn btn-secondary" type="button" onClick={nextMonth}>
            Next →
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="cal-weekday">
            {label}
          </div>
        ))}
        {days.map((d) => {
          const key = toDateKey(d);
          const dayShifts = shiftsByDay.get(key) || [];
          const outside = d.getMonth() !== currentMonth;
          const isToday = key === todayKey;
          const hasRequest = requestDates?.has(key);

          return (
            <div key={key} className={`cal-day ${outside ? 'cal-day-outside' : ''}`} onClick={() => onDayClick(key)}>
              <div className="cal-day-number">
                <span className={isToday ? 'cal-day-today' : ''}>{d.getDate()}</span>
                {hasRequest && <span className="cal-request-dot" title="Pending change request" />}
              </div>
              {dayShifts.map((s) => (
                <div
                  key={s.id}
                  className="cal-chip"
                  style={{ background: colorForEmployee(s.employeeId, employees) }}
                  title={`${s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : ''} · ${s.roleName} · ${fmtTimeShort(s.scheduledStart)}–${fmtTimeShort(s.scheduledEnd)}${s.isRestDay ? ' · rest day' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShiftClick(s);
                  }}
                >
                  {s.employee ? `${s.employee.firstName} ` : ''}
                  {fmtTimeShort(s.scheduledStart)}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {showLegend && employees.length > 0 && (
        <div className="cal-legend">
          {employees.map((e) => (
            <div key={e.id} className="cal-legend-item">
              <span className="cal-legend-dot" style={{ background: colorForEmployee(e.id, employees) }} />
              {e.firstName} {e.lastName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
