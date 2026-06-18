// Pure payroll calculation helpers (no DB / I/O) so they can be unit-tested.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate(); // month is 1-12
}

// Financial-year start (year, month) for a given period.
function fyStart(periodYear, periodMonth, fyStartMonth) {
  const startYear = periodMonth >= fyStartMonth ? periodYear : periodYear - 1;
  return { year: startYear, month: fyStartMonth };
}

// Indian-grouping number format: 174100 -> "1,74,100.00"
function formatIN(n) {
  const num = Number(n) || 0;
  const fixed = Math.abs(num).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  let last3 = intPart.slice(-3);
  let rest = intPart.slice(0, -3);
  if (rest) {
    last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  }
  return `${num < 0 ? '-' : ''}${rest}${last3}.${decPart}`;
}

// Amount in words (Indian system: lakh / crore)
function numberToWords(amount) {
  const rupees = Math.floor(Math.abs(Number(amount) || 0));
  if (rupees === 0) return 'Indian Rupee Zero Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const two = (n) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : ''));
  const three = (n) => {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return (h ? ones[h] + ' Hundred' + (rem ? ' ' : '') : '') + (rem ? two(rem) : '');
  };

  let words = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;

  if (crore) words += three(crore) + ' Crore ';
  if (lakh) words += three(lakh) + ' Lakh ';
  if (thousand) words += three(thousand) + ' Thousand ';
  if (hundred) words += three(hundred);

  return `Indian Rupee ${words.trim().replace(/\s+/g, ' ')} Only`;
}

// Compute a single payslip's lines from a salary structure + attendance counts.
// struct: { basic, hra, fixed_allowance, pf_applicable, pt_applicable }
// attendance: { absent_days, half_days }
function computePayslip(struct, attendance, totalDays, settings, incomeTax = 0) {
  const pfPercent = Number(settings.payroll_pf_percent || 12);
  const pfCeiling = Number(settings.payroll_pf_wage_ceiling || 15000);
  const ptAmount = Number(settings.payroll_pt_amount || 200);

  const absent = Number(attendance.absent_days || 0);
  const half = Number(attendance.half_days || 0);
  const lopDays = r2(absent + 0.5 * half);
  const paidDays = r2(Math.max(0, totalDays - lopDays));
  const factor = totalDays > 0 ? paidDays / totalDays : 0;

  const basic = r2(Number(struct.basic) * factor);
  const hra = r2(Number(struct.hra) * factor);
  const fixed = r2(Number(struct.fixed_allowance) * factor);
  const gross = r2(basic + hra + fixed);

  const epf = struct.pf_applicable ? r2(Math.min(basic, pfCeiling) * pfPercent / 100) : 0;
  const pt = struct.pt_applicable && gross > 0 ? ptAmount : 0;
  const it = r2(incomeTax);
  const totalDeductions = r2(epf + pt + it);
  const net = r2(gross - totalDeductions);

  return {
    paid_days: paidDays, lop_days: lopDays, total_days: totalDays,
    basic, hra, fixed_allowance: fixed, gross_earnings: gross,
    epf, professional_tax: pt, income_tax: it,
    total_deductions: totalDeductions, net_pay: net,
  };
}

module.exports = {
  MONTH_NAMES, r2, daysInMonth, fyStart, formatIN, numberToWords, computePayslip,
};
