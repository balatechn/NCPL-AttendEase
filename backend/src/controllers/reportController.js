const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const { pgPool } = require('../config/database');

exports.attendanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate, department, format } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required.' });
    }

    // Build query for all employees in range
    let query = `
      SELECT a.*, e.employee_code, e.first_name, e.last_name, e.department
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.attendance_date BETWEEN $1 AND $2`;
    const params = [startDate, endDate];

    if (department) {
      query += ' AND e.department = $3';
      params.push(department);
    }
    query += ' ORDER BY e.first_name, a.attendance_date';

    const result = await pgPool.query(query, params);

    if (format === 'excel') {
      return generateExcel(res, result.rows, startDate, endDate);
    } else if (format === 'pdf') {
      return generatePDF(res, result.rows, startDate, endDate);
    }

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

exports.leaveReport = async (req, res, next) => {
  try {
    const { year, department, format } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();

    let query = `
      SELECT l.*, e.employee_code, e.first_name, e.last_name, e.department
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      WHERE EXTRACT(YEAR FROM l.start_date) = $1`;
    const params = [y];

    if (department) {
      query += ' AND e.department = $2';
      params.push(department);
    }
    query += ' ORDER BY l.start_date DESC';

    const result = await pgPool.query(query, params);

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Leave Report');
      sheet.columns = [
        { header: 'Emp Code', key: 'employee_code', width: 12 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Department', key: 'department', width: 15 },
        { header: 'Leave Type', key: 'leave_type', width: 12 },
        { header: 'Start Date', key: 'start_date', width: 12 },
        { header: 'End Date', key: 'end_date', width: 12 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Reason', key: 'reason', width: 30 },
      ];

      result.rows.forEach((r) => {
        sheet.addRow({
          employee_code: r.employee_code,
          name: `${r.first_name} ${r.last_name}`,
          department: r.department,
          leave_type: r.leave_type,
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status,
          reason: r.reason,
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=leave-report-${y}.xlsx`);
      return workbook.xlsx.write(res);
    }

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

exports.summaryReport = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;

    const result = await pgPool.query(`
      SELECT 
        e.employee_code, e.first_name, e.last_name, e.department,
        COUNT(*) FILTER (WHERE a.status = 'present') as present_days,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent_days,
        COUNT(*) FILTER (WHERE a.status = 'half-day') as half_days,
        COUNT(*) FILTER (WHERE a.status = 'leave') as leave_days,
        COUNT(*) FILTER (WHERE a.is_late = true) as late_days,
        COALESCE(ROUND(AVG(a.work_hours)::numeric, 2), 0) as avg_hours
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND EXTRACT(YEAR FROM a.attendance_date) = $1 
        AND EXTRACT(MONTH FROM a.attendance_date) = $2
      WHERE e.is_active = true
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.department
      ORDER BY e.first_name
    `, [y, m]);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

async function generateExcel(res, rows, startDate, endDate) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Attendance Report');

  sheet.columns = [
    { header: 'Emp Code', key: 'employee_code', width: 12 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Department', key: 'department', width: 15 },
    { header: 'Date', key: 'attendance_date', width: 12 },
    { header: 'Punch In', key: 'punch_in', width: 12 },
    { header: 'Punch Out', key: 'punch_out', width: 12 },
    { header: 'Hours', key: 'work_hours', width: 8 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Late', key: 'is_late', width: 6 },
  ];

  // Style header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  rows.forEach((r) => {
    sheet.addRow({
      employee_code: r.employee_code,
      name: `${r.first_name} ${r.last_name}`,
      department: r.department,
      attendance_date: r.attendance_date,
      punch_in: r.punch_in,
      punch_out: r.punch_out,
      work_hours: r.work_hours,
      status: r.status,
      is_late: r.is_late ? 'Yes' : 'No',
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=attendance-${startDate}-to-${endDate}.xlsx`);
  return workbook.xlsx.write(res);
}

async function generatePDF(res, rows, startDate, endDate) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=attendance-${startDate}-to-${endDate}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text('Attendance Report', { align: 'center' });
  doc.fontSize(10).text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
  doc.moveDown();

  // Simple table
  const headers = ['Emp Code', 'Name', 'Dept', 'Date', 'In', 'Out', 'Hours', 'Status'];
  const colWidths = [70, 120, 80, 80, 60, 60, 50, 60];
  let y = doc.y;

  // Header row
  doc.fontSize(8).font('Helvetica-Bold');
  let x = 30;
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: colWidths[i] });
    x += colWidths[i];
  });
  y += 15;

  doc.font('Helvetica').fontSize(7);
  rows.forEach((r) => {
    if (y > 550) {
      doc.addPage();
      y = 30;
    }
    x = 30;
    const cols = [r.employee_code, `${r.first_name} ${r.last_name}`, r.department, String(r.attendance_date).substring(0, 10), r.punch_in || '-', r.punch_out || '-', String(r.work_hours || '-'), r.status];
    cols.forEach((c, i) => {
      doc.text(c, x, y, { width: colWidths[i] });
      x += colWidths[i];
    });
    y += 12;
  });

  doc.end();
}
