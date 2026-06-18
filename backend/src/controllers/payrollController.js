const PDFDocument = require('pdfkit');
const Payroll = require('../models/Payroll');
const logger = require('../utils/logger');
const {
  MONTH_NAMES, r2, daysInMonth, fyStart, formatIN, numberToWords, computePayslip,
} = require('../utils/payrollCalc');

// =====================================================================
// Settings
// =====================================================================
exports.getSettings = async (req, res, next) => {
  try {
    res.json(await Payroll.getSettings());
  } catch (err) { next(err); }
};

exports.updateSettings = async (req, res, next) => {
  try {
    res.json(await Payroll.updateSettings(req.body));
  } catch (err) { next(err); }
};

// =====================================================================
// Salary structures
// =====================================================================
exports.listSalaryStructures = async (req, res, next) => {
  try {
    res.json(await Payroll.listSalaryStructures({ search: req.query.search }));
  } catch (err) { next(err); }
};

exports.getStructureHistory = async (req, res, next) => {
  try {
    res.json(await Payroll.getStructureHistory(req.params.employeeId));
  } catch (err) { next(err); }
};

exports.saveSalaryStructure = async (req, res, next) => {
  try {
    const { employee_id, effective_from, basic, hra, fixed_allowance } = req.body;
    if (!employee_id || !effective_from) {
      return res.status(400).json({ error: 'employee_id and effective_from are required.' });
    }
    if ([basic, hra, fixed_allowance].some((v) => v !== undefined && Number(v) < 0)) {
      return res.status(400).json({ error: 'Salary components cannot be negative.' });
    }
    const structure = await Payroll.upsertSalaryStructure(req.body, req.user.id);
    // Optionally persist bank/UAN/PAN/PF details if provided
    if (['bank_account_no', 'uan', 'pan', 'pf_number'].some((k) => k in req.body)) {
      await Payroll.upsertPayrollDetails(employee_id, req.body);
    }
    res.status(201).json(structure);
  } catch (err) { next(err); }
};

// =====================================================================
// Runs — draft / finalize
// =====================================================================
exports.listRuns = async (req, res, next) => {
  try {
    res.json(await Payroll.listRuns());
  } catch (err) { next(err); }
};

exports.getRun = async (req, res, next) => {
  try {
    const run = await Payroll.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
    const payslips = await Payroll.getPayslips(run.id);
    res.json({ run, payslips });
  } catch (err) { next(err); }
};

// Generate (or regenerate) a DRAFT run for a month. Re-running a draft replaces its payslips.
exports.generateDraft = async (req, res, next) => {
  try {
    const month = parseInt(req.body.period_month, 10);
    const year = parseInt(req.body.period_year, 10);
    const payDate = req.body.pay_date || null;
    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid period_month (1-12) and period_year are required.' });
    }

    let run = await Payroll.getRunByPeriod(month, year);
    if (run && run.status === 'finalized') {
      return res.status(409).json({ error: 'Payroll for this month is already finalized and cannot be regenerated.' });
    }
    if (!run) {
      run = await Payroll.createRun({ period_month: month, period_year: year, pay_date: payDate }, req.user.id);
    } else {
      await Payroll.clearPayslips(run.id); // regenerate draft from scratch
    }

    const settings = await Payroll.getSettings();
    const totalDays = daysInMonth(year, month);
    const asOf = `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;

    const employees = await Payroll.getActiveEmployeesWithStructure(asOf);
    let created = 0;
    for (const emp of employees) {
      const attendance = await Payroll.getAttendanceCounts(emp.employee_id, year, month);
      const calc = computePayslip(emp, attendance, totalDays, settings, 0);
      await Payroll.insertPayslip({ run_id: run.id, employee_id: emp.employee_id, ...calc });
      created += 1;
    }

    await Payroll.updateRunTotals(run.id);
    const fresh = await Payroll.getRun(run.id);
    const payslips = await Payroll.getPayslips(run.id);
    logger.info(`Payroll draft generated for ${month}/${year}: ${created} payslips`);
    res.status(201).json({
      run: fresh, payslips,
      skipped: employees.length === 0
        ? 'No employees have an active salary structure for this period.'
        : null,
    });
  } catch (err) { next(err); }
};

// Edit a single draft payslip; recompute deductions/net from the edited values.
exports.updatePayslip = async (req, res, next) => {
  try {
    const current = await Payroll.getPayslip(req.params.id);
    if (!current) return res.status(404).json({ error: 'Payslip not found.' });
    if (current.run_status === 'finalized') {
      return res.status(409).json({ error: 'Cannot edit a payslip in a finalized run.' });
    }

    const settings = await Payroll.getSettings();
    const pfPercent = Number(settings.payroll_pf_percent || 12);
    const pfCeiling = Number(settings.payroll_pf_wage_ceiling || 15000);

    // Accept edits to components, paid/lop days, and income tax; everything else recomputed.
    const basic = r2(req.body.basic ?? current.basic);
    const hra = r2(req.body.hra ?? current.hra);
    const fixed = r2(req.body.fixed_allowance ?? current.fixed_allowance);
    const incomeTax = r2(req.body.income_tax ?? current.income_tax);
    const epf = req.body.epf !== undefined ? r2(req.body.epf) : r2(Math.min(basic, pfCeiling) * pfPercent / 100);
    const pt = req.body.professional_tax !== undefined ? r2(req.body.professional_tax) : r2(current.professional_tax);

    const gross = r2(basic + hra + fixed);
    const totalDeductions = r2(epf + pt + incomeTax);
    const net = r2(gross - totalDeductions);

    const updated = await Payroll.updatePayslipFields(req.params.id, {
      paid_days: req.body.paid_days ?? current.paid_days,
      lop_days: req.body.lop_days ?? current.lop_days,
      basic, hra, fixed_allowance: fixed, gross_earnings: gross,
      epf, professional_tax: pt, income_tax: incomeTax,
      total_deductions: totalDeductions, net_pay: net,
    });

    await Payroll.updateRunTotals(current.run_id);
    res.json(updated);
  } catch (err) { next(err); }
};

// Finalize: lock the run, freeze YTD totals into each payslip's breakdown snapshot.
exports.finalizeRun = async (req, res, next) => {
  try {
    const run = await Payroll.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
    if (run.status === 'finalized') {
      return res.status(409).json({ error: 'This payroll run is already finalized.' });
    }
    const payslips = await Payroll.getPayslips(run.id);
    if (payslips.length === 0) {
      return res.status(400).json({ error: 'Cannot finalize an empty run. Generate the draft first.' });
    }

    const settings = await Payroll.getSettings();
    const fyStartMonth = Number(settings.payroll_fy_start_month || 4);
    const fy = fyStart(run.period_year, run.period_month, fyStartMonth);

    const finalized = await Payroll.finalizeRun(run.id, req.user.id);

    // Build YTD snapshots now that the run is finalized (so this month is included)
    for (const ps of payslips) {
      const ytd = await Payroll.getYtdTotals(
        ps.employee_id, fy.year, fy.month, run.period_year, run.period_month, null
      );
      await Payroll.setPayslipBreakdown(ps.id, {
        earnings: [
          { label: 'Basic', amount: r2(ps.basic), ytd: r2(ytd.basic) },
          { label: 'House Rent Allowance', amount: r2(ps.hra), ytd: r2(ytd.hra) },
          { label: 'Fixed Allowance', amount: r2(ps.fixed_allowance), ytd: r2(ytd.fixed_allowance) },
        ],
        deductions: [
          { label: 'EPF Contribution', amount: r2(ps.epf), ytd: r2(ytd.epf) },
          { label: 'Income Tax', amount: r2(ps.income_tax), ytd: r2(ytd.income_tax) },
          { label: 'Professional Tax', amount: r2(ps.professional_tax), ytd: r2(ytd.professional_tax) },
        ],
        ytd: {
          gross_earnings: r2(ytd.gross_earnings),
          total_deductions: r2(ytd.total_deductions),
          net_pay: r2(ytd.net_pay),
        },
      });
    }

    logger.info(`Payroll run ${run.id} (${run.period_month}/${run.period_year}) finalized by ${req.user.id}`);
    res.json({ run: finalized, message: 'Payroll finalized. Payslips are now available to employees.' });
  } catch (err) { next(err); }
};

exports.deleteRun = async (req, res, next) => {
  try {
    const run = await Payroll.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
    if (run.status === 'finalized') {
      return res.status(409).json({ error: 'Finalized payroll runs cannot be deleted.' });
    }
    await Payroll.deleteRun(run.id);
    res.json({ message: 'Draft payroll run deleted.' });
  } catch (err) { next(err); }
};

// =====================================================================
// Employee self-service
// =====================================================================
exports.getMyPayslips = async (req, res, next) => {
  try {
    res.json(await Payroll.getEmployeePayslips(req.user.id));
  } catch (err) { next(err); }
};

// =====================================================================
// Payslip PDF
// =====================================================================
function streamPayslipPdf(res, ps, settings) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename=payslip-${ps.employee_code}-${ps.period_year}-${String(ps.period_month).padStart(2, '0')}.pdf`);
  doc.pipe(res);
  renderPayslip(doc, ps, settings);
}

// Draw a payslip onto a PDFKit document. Separated from the HTTP wrapper so it
// can also be exercised by tooling (e.g. rendering a sample to a file).
function renderPayslip(doc, ps, settings) {
  // Build breakdown lines (use frozen snapshot if present, else live values)
  const bd = ps.breakdown || {
    earnings: [
      { label: 'Basic', amount: ps.basic, ytd: ps.basic },
      { label: 'House Rent Allowance', amount: ps.hra, ytd: ps.hra },
      { label: 'Fixed Allowance', amount: ps.fixed_allowance, ytd: ps.fixed_allowance },
    ],
    deductions: [
      { label: 'EPF Contribution', amount: ps.epf, ytd: ps.epf },
      { label: 'Income Tax', amount: ps.income_tax, ytd: ps.income_tax },
      { label: 'Professional Tax', amount: ps.professional_tax, ytd: ps.professional_tax },
    ],
  };

  const monthLabel = `${MONTH_NAMES[ps.period_month - 1]} ${ps.period_year}`;
  const left = 40;
  const right = 555;
  const fullName = `${ps.first_name} ${ps.last_name}`;

  // Header
  doc.fillColor('#1a1a1a').font('Helvetica-Bold').fontSize(15)
    .text(settings.company_name || 'Company', left, 45, { width: 360 });
  doc.font('Helvetica').fontSize(8).fillColor('#666')
    .text(settings.company_address || '', left, doc.y + 2, { width: 360 });
  doc.font('Helvetica').fontSize(8).fillColor('#444')
    .text('Payslip For the Month', right - 160, 48, { width: 160, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a')
    .text(monthLabel, right - 160, 60, { width: 160, align: 'right' });

  doc.moveTo(left, 95).lineTo(right, 95).strokeColor('#ddd').stroke();

  // Employee summary
  let y = 110;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333').text('EMPLOYEE SUMMARY', left, y);
  y += 16;
  const summary = [
    ['Employee Name', fullName],
    ['Designation', ps.designation || '-'],
    ['Employee ID', ps.employee_code],
    ['Date of Joining', ps.date_of_joining ? String(ps.date_of_joining).slice(0, 10) : '-'],
    ['Pay Period', monthLabel],
    ['Pay Date', ps.pay_date ? String(ps.pay_date).slice(0, 10) : '-'],
  ];
  doc.fontSize(9);
  summary.forEach(([k, v]) => {
    doc.font('Helvetica').fillColor('#777').text(k, left, y, { width: 110 });
    doc.font('Helvetica').fillColor('#222').text(`: ${v}`, left + 115, y);
    y += 16;
  });

  // Net pay box
  const boxX = 350, boxY = 110, boxW = 205, boxH = 96;
  doc.roundedRect(boxX, boxY, boxW, boxH, 4).fillAndStroke('#f2faf5', '#cfe9d9');
  doc.fillColor('#1a7f4b').font('Helvetica-Bold').fontSize(16)
    .text(`Rs. ${formatIN(ps.net_pay)}`, boxX + 12, boxY + 14, { width: boxW - 24 });
  doc.fillColor('#555').font('Helvetica').fontSize(8).text('Total Net Pay', boxX + 12, boxY + 36);
  doc.fillColor('#333').fontSize(9)
    .text(`Paid Days : ${ps.paid_days}`, boxX + 12, boxY + 58)
    .text(`LOP Days : ${ps.lop_days}`, boxX + 12, boxY + 74);

  y = Math.max(y, boxY + boxH) + 10;
  doc.font('Helvetica').fontSize(9).fillColor('#555')
    .text(`Bank Account No  :  ${ps.bank_account_no || '-'}`, left, y)
    .text(`UAN  :  ${ps.uan || '-'}`, 320, y);
  y += 24;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#ddd').stroke();
  y += 14;

  // Earnings / Deductions tables
  const colA = left, colB = 360;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333');
  doc.text('EARNINGS', colA, y);
  doc.text('AMOUNT', colA + 110, y, { width: 90, align: 'right' });
  doc.text('YTD', colA + 205, y, { width: 80, align: 'right' });
  doc.text('DEDUCTIONS', colB, y);
  doc.text('AMOUNT', colB + 90, y, { width: 60, align: 'right' });
  y += 16;

  doc.font('Helvetica').fontSize(8.5).fillColor('#222');
  const rows = Math.max(bd.earnings.length, bd.deductions.length);
  let ry = y;
  for (let i = 0; i < rows; i++) {
    const e = bd.earnings[i];
    const d = bd.deductions[i];
    if (e) {
      doc.fillColor('#222').text(e.label, colA, ry, { width: 125 });
      doc.text(formatIN(e.amount), colA + 110, ry, { width: 90, align: 'right' });
      doc.fillColor('#888').text(formatIN(e.ytd), colA + 205, ry, { width: 80, align: 'right' });
    }
    if (d) {
      doc.fillColor('#222').text(d.label, colB, ry, { width: 110 });
      doc.text(formatIN(d.amount), colB + 80, ry, { width: 70, align: 'right' });
    }
    ry += 16;
  }

  // Totals row
  ry += 4;
  doc.moveTo(left, ry).lineTo(right, ry).strokeColor('#eee').stroke();
  ry += 6;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111');
  doc.text('Gross Earnings', colA, ry);
  doc.text(formatIN(ps.gross_earnings), colA + 110, ry, { width: 90, align: 'right' });
  doc.text('Total Deductions', colB, ry);
  doc.text(formatIN(ps.total_deductions), colB + 80, ry, { width: 70, align: 'right' });
  ry += 30;

  // Net payable banner
  doc.roundedRect(left, ry, right - left, 44, 4).fillAndStroke('#f7f7f7', '#e5e5e5');
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(10).text('TOTAL NET PAYABLE', left + 14, ry + 10);
  doc.fillColor('#777').font('Helvetica').fontSize(8).text('Gross Earnings - Total Deductions', left + 14, ry + 24);
  doc.roundedRect(right - 170, ry + 8, 156, 28, 4).fillAndStroke('#e8f6ee', '#bfe6cf');
  doc.fillColor('#1a7f4b').font('Helvetica-Bold').fontSize(12)
    .text(`Rs. ${formatIN(ps.net_pay)}`, right - 166, ry + 15, { width: 148, align: 'center' });
  ry += 60;

  doc.font('Helvetica').fontSize(8).fillColor('#555')
    .text('Amount In Words   ', left, ry, { continued: true })
    .fillColor('#222').text(numberToWords(ps.net_pay));
  ry += 24;
  doc.fillColor('#999').fontSize(7.5)
    .text('-- This is a system-generated document. --', left, ry, { width: right - left, align: 'center' });

  doc.end();
}

exports.getPayslipPdf = async (req, res, next) => {
  try {
    const ps = await Payroll.getPayslip(req.params.id);
    if (!ps) return res.status(404).json({ error: 'Payslip not found.' });
    const settings = await Payroll.getSettings();
    streamPayslipPdf(res, ps, settings);
  } catch (err) { next(err); }
};

// Exposed for sample/preview tooling (renders onto a caller-provided PDFKit doc)
exports.renderPayslip = renderPayslip;

// Employee downloading their OWN payslip (must be finalized + belong to them)
exports.getMyPayslipPdf = async (req, res, next) => {
  try {
    const ps = await Payroll.getPayslip(req.params.id);
    if (!ps) return res.status(404).json({ error: 'Payslip not found.' });
    if (ps.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only access your own payslips.' });
    }
    if (ps.run_status !== 'finalized') {
      return res.status(403).json({ error: 'This payslip is not yet available.' });
    }
    const settings = await Payroll.getSettings();
    streamPayslipPdf(res, ps, settings);
  } catch (err) { next(err); }
};
