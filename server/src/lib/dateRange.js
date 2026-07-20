// A plain date-only string like "2026-07-20" parses as UTC midnight
// (`new Date("2026-07-20")`), which is correct as a *start* bound but wrong
// as an *end* bound — anything that happened later that same day gets
// excluded from `lte`. This extends it to the last instant of that UTC
// calendar day so "payroll through today" actually includes today.
export function endOfDayUTC(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
