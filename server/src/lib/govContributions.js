// Reference-only government contribution lookups (SSS, PhilHealth, Pag-IBIG).
// Deliberately kept separate from wageCalc.js: these are deductions computed
// against monthly basic salary, not part of the hours/OT/holiday engine.

export function lookupContribution(brackets, type, monthlySalary) {
  const match = brackets.find(
    (b) => b.type === type && monthlySalary >= b.minSalary && (b.maxSalary == null || monthlySalary <= b.maxSalary)
  );
  if (!match) return { type, employeeContribution: 0, employerContribution: 0 };
  return {
    type,
    employeeContribution: match.employeeContribution,
    employerContribution: match.employerContribution,
  };
}

export function computeAllContributions(brackets, monthlySalary) {
  return {
    sss: lookupContribution(brackets, 'SSS', monthlySalary),
    philHealth: lookupContribution(brackets, 'PHILHEALTH', monthlySalary),
    pagIbig: lookupContribution(brackets, 'PAGIBIG', monthlySalary),
  };
}
