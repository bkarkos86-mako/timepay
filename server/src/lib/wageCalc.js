// Core hours & wage engine. Pure functions where possible so they're easy to
// unit-test independently of the database and of government contribution
// rules (see govContributions.js, which is intentionally kept separate).

const MS_PER_MIN = 60 * 1000;

function minutesBetween(a, b) {
  return Math.max(0, (b - a) / MS_PER_MIN);
}

// Subtract break/lunch intervals from a worked [start, end] interval,
// returning the remaining paid sub-intervals.
function subtractBreaks(start, end, breaks) {
  let segments = [[start, end]];
  for (const b of breaks) {
    if (!b.breakEnd) continue; // still open, ignore (shouldn't happen for closed entries)
    const bStart = new Date(b.breakStart);
    const bEnd = new Date(b.breakEnd);
    const next = [];
    for (const [s, e] of segments) {
      if (bEnd <= s || bStart >= e) {
        next.push([s, e]); // no overlap
        continue;
      }
      if (bStart > s) next.push([s, bStart]);
      if (bEnd < e) next.push([bEnd, e]);
    }
    segments = next;
  }
  return segments;
}

// Minutes of a [start, end] interval that fall within the configured night
// differential window (e.g. 22:00–06:00), handling the midnight wraparound.
function nightDiffMinutes(start, end, nightStartHour, nightEndHour) {
  let total = 0;
  let cursor = new Date(start);
  while (cursor < end) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);

    const nightStart = new Date(dayStart);
    nightStart.setHours(nightStartHour, 0, 0, 0);
    const nightEnd = new Date(dayStart);
    nightEnd.setHours(nightEndHour, 0, 0, 0);
    if (nightEndHour <= nightStartHour) nightEnd.setDate(nightEnd.getDate() + 1);

    const segStart = cursor > nightStart ? cursor : nightStart;
    const segEnd = end < nightEnd ? end : nightEnd;
    if (segEnd > segStart) total += minutesBetween(segStart, segEnd);

    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    cursor = nextDay;
  }
  return total;
}

function dateKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/**
 * Compute wage breakdown for a set of approved, clocked-out TimeEntries
 * belonging to a single employee over a pay period.
 *
 * @param entries  TimeEntry[] with `breaks` included, each entry also
 *                 carrying `hourlyRate` (resolved from the employee's
 *                 job-role rate for entry.roleName) and optional `holiday`
 *                 ({ type, multiplierOverride }) and `shift` ({ isRestDay }).
 * @param config   PayRuleConfig row.
 */
export function computeWageBreakdown(entries, config) {
  const byDay = new Map();
  const byCalendarDay = new Map(); // day only, no role — for allowance below

  for (const entry of entries) {
    if (!entry.clockOut) continue; // still clocked in, not payable yet
    const key = `${dateKey(entry.clockIn)}|${entry.roleName}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(entry);

    const dayOnly = dateKey(entry.clockIn);
    if (!byCalendarDay.has(dayOnly)) byCalendarDay.set(dayOnly, []);
    byCalendarDay.get(dayOnly).push(entry);
  }

  const result = {
    regularHours: 0,
    otHours: 0,
    nightDiffHours: 0,
    regularHolidayHours: 0,
    specialHolidayHours: 0,
    restDayHours: 0,
    grossPay: 0,
    lines: [],
    // Flat daily allowance — deliberately kept out of grossPay (see
    // EmployeeJobRole.dailyAllowance). One per calendar day worked,
    // regardless of how many entries/roles that day, using whichever role
    // the day's earliest entry was worked under.
    allowanceDays: 0,
    allowancePay: 0,
    allowanceLines: [],
  };

  for (const [day, dayEntries] of byCalendarDay) {
    const earliest = dayEntries.reduce((a, b) => (new Date(a.clockIn) < new Date(b.clockIn) ? a : b));
    const amount = earliest.dailyAllowance ?? 0;
    if (amount > 0) {
      result.allowanceDays += 1;
      result.allowancePay += amount;
      result.allowanceLines.push({ date: day, roleName: earliest.roleName, amount });
    }
  }

  for (const [, dayEntries] of byDay) {
    let workedMinutesSoFar = 0;
    const otThresholdMin = config.otDailyThresholdHours * 60;

    for (const entry of dayEntries) {
      const segments = subtractBreaks(new Date(entry.clockIn), new Date(entry.clockOut), entry.breaks || []);
      let entryPaidMin = 0;
      let entryNightMin = 0;
      for (const [s, e] of segments) {
        entryPaidMin += minutesBetween(s, e);
        entryNightMin += nightDiffMinutes(s, e, config.nightDiffStartHour, config.nightDiffEndHour);
      }

      const regularMin = Math.min(entryPaidMin, Math.max(0, otThresholdMin - workedMinutesSoFar));
      const otMin = entryPaidMin - regularMin;
      workedMinutesSoFar += entryPaidMin;

      const regularHours = regularMin / 60;
      const otHours = otMin / 60;
      const nightDiffHours = entryNightMin / 60;

      const rate = entry.hourlyRate;
      let dayTypeMultiplier = 1;
      let bucket = 'regularHours';
      if (entry.holiday?.type === 'REGULAR') {
        dayTypeMultiplier = entry.holiday.multiplierOverride ?? config.regularHolidayMultiplier;
        bucket = 'regularHolidayHours';
      } else if (entry.holiday?.type === 'SPECIAL_NON_WORKING') {
        dayTypeMultiplier = entry.holiday.multiplierOverride ?? config.specialHolidayMultiplier;
        bucket = 'specialHolidayHours';
      } else if (entry.shift?.isRestDay) {
        dayTypeMultiplier = config.restDayMultiplier;
        bucket = 'restDayHours';
      }

      const regularPay = regularHours * rate * dayTypeMultiplier;
      const otPay = otHours * rate * config.otMultiplier * dayTypeMultiplier;
      const nightDiffPay = nightDiffHours * rate * (config.nightDiffMultiplier - 1); // premium on top of base

      result.regularHours += regularHours;
      result.otHours += otHours;
      result.nightDiffHours += nightDiffHours;
      result[bucket] += regularHours + otHours;
      result.grossPay += regularPay + otPay + nightDiffPay;

      result.lines.push({
        timeEntryId: entry.id,
        date: dateKey(entry.clockIn),
        roleName: entry.roleName,
        regularHours,
        otHours,
        nightDiffHours,
        dayType: bucket,
        rate,
        pay: regularPay + otPay + nightDiffPay,
      });
    }
  }

  return result;
}

/**
 * 13th month pay in the Philippines accrues as (total basic salary earned
 * in the year) / 12. "Basic salary" excludes OT, night diff, and holiday/
 * rest-day premiums — only the straight regular-hours portion counts.
 */
export function compute13thMonthAccrual(wageBreakdownsByMonth) {
  const totalBasic = wageBreakdownsByMonth.reduce((sum, month) => {
    const basicLines = month.lines.filter((l) => l.dayType === 'regularHours');
    return sum + basicLines.reduce((s, l) => s + l.regularHours * l.rate, 0);
  }, 0);
  return totalBasic / 12;
}
