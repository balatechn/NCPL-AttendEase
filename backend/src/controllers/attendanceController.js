const Attendance = require('../models/Attendance');
const { pgPool } = require('../config/database');

exports.getEmployeeList = async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      `SELECT id, first_name, last_name, employee_code, department
       FROM employees WHERE is_active = true ORDER BY first_name, last_name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getMyAttendance = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const records = await Attendance.findByEmployeeAndMonth(req.user.id, y, m);
    res.json(records);
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeAttendance = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { year, month } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const records = await Attendance.findByEmployeeAndMonth(parseInt(employeeId, 10), y, m);
    res.json(records);
  } catch (err) {
    next(err);
  }
};

exports.getMyAttendanceRange = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required.' });
    }
    const records = await Attendance.findByDateRange(req.user.id, startDate, endDate);
    res.json(records);
  } catch (err) {
    next(err);
  }
};

exports.getMySummary = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const summary = await Attendance.getSummary(req.user.id, y, m);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};

exports.getDashboard = async (req, res, next) => {
  try {
    const stats = await Attendance.getDashboardStats(req.user.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

exports.getAllByDate = async (req, res, next) => {
  try {
    const { date, department, page, limit } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required.' });
    const records = await Attendance.findAllByDate(date, { department, page: parseInt(page, 10), limit: parseInt(limit, 10) });
    res.json(records);
  } catch (err) {
    next(err);
  }
};

exports.overrideAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await Attendance.override(id, req.body, req.user.id);
    if (!updated) return res.status(404).json({ error: 'Attendance record not found.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};
