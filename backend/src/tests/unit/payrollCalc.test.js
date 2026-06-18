const {
  r2, daysInMonth, fyStart, formatIN, numberToWords, computePayslip,
} = require('../../utils/payrollCalc');

// Default statutory settings (as seeded by migration 006)
const SETTINGS = {
  payroll_pf_percent: '12',
  payroll_pf_wage_ceiling: '15000',
  payroll_pt_amount: '200',
  payroll_fy_start_month: '4',
};

describe('payrollCalc - formatting', () => {
  it('formats Indian number grouping', () => {
    expect(formatIN(174100)).toBe('1,74,100.00');
    expect(formatIN(283361)).toBe('2,83,361.00');
    expect(formatIN(1800)).toBe('1,800.00');
    expect(formatIN(0)).toBe('0.00');
    expect(formatIN(12345678)).toBe('1,23,45,678.00');
  });

  it('converts amount to Indian words', () => {
    expect(numberToWords(283361)).toBe(
      'Indian Rupee Two Lakh Eighty-Three Thousand Three Hundred Sixty-One Only'
    );
    expect(numberToWords(0)).toBe('Indian Rupee Zero Only');
    expect(numberToWords(1800)).toBe('Indian Rupee One Thousand Eight Hundred Only');
  });
});

describe('payrollCalc - helpers', () => {
  it('computes days in month', () => {
    expect(daysInMonth(2026, 3)).toBe(31);  // March
    expect(daysInMonth(2026, 2)).toBe(28);  // Feb 2026
    expect(daysInMonth(2024, 2)).toBe(29);  // Feb leap year
  });

  it('derives the financial year start (April)', () => {
    expect(fyStart(2026, 3, 4)).toEqual({ year: 2025, month: 4 }); // March -> prev FY
    expect(fyStart(2025, 8, 4)).toEqual({ year: 2025, month: 4 }); // Aug -> same FY
  });
});

describe('payrollCalc - computePayslip', () => {
  const struct = { basic: 174100, hra: 69640, fixed_allowance: 104460, pf_applicable: true, pt_applicable: true };

  it('reproduces the sample payslip (full month, no LOP)', () => {
    const p = computePayslip(struct, { absent_days: 0, half_days: 0 }, 31, SETTINGS, 62839);
    expect(p.paid_days).toBe(31);
    expect(p.lop_days).toBe(0);
    expect(p.gross_earnings).toBe(348200);
    expect(p.epf).toBe(1800);              // 12% of 15,000 ceiling
    expect(p.professional_tax).toBe(200);
    expect(p.income_tax).toBe(62839);
    expect(p.total_deductions).toBe(64839);
    expect(p.net_pay).toBe(283361);
  });

  it('prorates earnings for LOP days', () => {
    // 2 absent days out of 31 -> paid 29
    const p = computePayslip(struct, { absent_days: 2, half_days: 0 }, 31, SETTINGS, 0);
    expect(p.paid_days).toBe(29);
    expect(p.lop_days).toBe(2);
    // each component is prorated and rounded independently, then summed
    const basic = r2(174100 * 29 / 31);
    const hra = r2(69640 * 29 / 31);
    const fixed = r2(104460 * 29 / 31);
    expect(p.basic).toBe(basic);
    expect(p.gross_earnings).toBe(r2(basic + hra + fixed));
  });

  it('counts a half-day as 0.5 LOP', () => {
    const p = computePayslip(struct, { absent_days: 1, half_days: 1 }, 30, SETTINGS, 0);
    expect(p.lop_days).toBe(1.5);
    expect(p.paid_days).toBe(28.5);
  });

  it('caps EPF at 12% of the PF wage ceiling', () => {
    const p = computePayslip(struct, { absent_days: 0, half_days: 0 }, 31, SETTINGS, 0);
    expect(p.epf).toBe(1800); // min(174100, 15000) * 12%
  });

  it('applies EPF on actual basic when basic is below the ceiling', () => {
    const low = { basic: 10000, hra: 4000, fixed_allowance: 1000, pf_applicable: true, pt_applicable: true };
    const p = computePayslip(low, { absent_days: 0, half_days: 0 }, 31, SETTINGS, 0);
    expect(p.epf).toBe(1200); // 12% of 10,000
  });

  it('skips PF and PT when not applicable', () => {
    const s = { ...struct, pf_applicable: false, pt_applicable: false };
    const p = computePayslip(s, { absent_days: 0, half_days: 0 }, 31, SETTINGS, 0);
    expect(p.epf).toBe(0);
    expect(p.professional_tax).toBe(0);
    expect(p.total_deductions).toBe(0);
    expect(p.net_pay).toBe(348200);
  });

  it('charges no PT when gross is zero (full-month LOP)', () => {
    const p = computePayslip(struct, { absent_days: 31, half_days: 0 }, 31, SETTINGS, 0);
    expect(p.paid_days).toBe(0);
    expect(p.gross_earnings).toBe(0);
    expect(p.professional_tax).toBe(0);
    expect(p.net_pay).toBe(0);
  });
});
