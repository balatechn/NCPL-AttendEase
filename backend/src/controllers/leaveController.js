const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { sendNotificationEmail } = require('../services/emailService');
const { pgPool } = require('../config/database');

exports.apply = async (req, res, next) => {
  try {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date || !reason) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    if (end < start) {
      return res.status(400).json({ error: 'End date must be after start date.' });
    }

    const year = start.getFullYear();
    const balances = await Leave.getBalance(req.user.id, year);
    const typeBalance = balances.find((b) => b.leave_type === leave_type);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    let isLwp = false;

    // === LEAVE POLICY VALIDATIONS ===

    // 1. Compensatory leave: validate actual overtime in attendance
    if (leave_type === 'compensatory') {
      // Check if employee has overtime days (work_hours > 9 or worked on weekends)
      const overtimeResult = await pgPool.query(
        `SELECT COUNT(*) as overtime_days FROM attendance
         WHERE employee_id = $1
         AND attendance_date < $2
         AND status = 'present'
         AND (work_hours > 9 OR EXTRACT(DOW FROM attendance_date) IN (0, 6))
         AND attendance_date NOT IN (
           SELECT start_date FROM leaves WHERE employee_id = $1 AND leave_type = 'compensatory' AND status IN ('approved', 'pending')
         )`,
        [req.user.id, start_date]
      );
      const availableOvertimeDays = parseInt(overtimeResult.rows[0].overtime_days, 10);
      if (availableOvertimeDays < days) {
        return res.status(400).json({
          error: `Insufficient overtime days for compensatory leave. You have ${availableOvertimeDays} overtime day(s) available, requested ${days}.`,
        });
      }
    }

    // 2. Casual leave: max 1 day per calendar month
    if (leave_type === 'casual') {
      if (days > 1) {
        return res.status(400).json({ error: 'Casual leave can only be taken 1 day at a time.' });
      }
      const month = start.getMonth() + 1;
      const existingCasual = await pgPool.query(
        `SELECT COUNT(*) as count FROM leaves
         WHERE employee_id = $1 AND leave_type = 'casual'
         AND status IN ('approved', 'pending')
         AND EXTRACT(YEAR FROM start_date) = $2
         AND EXTRACT(MONTH FROM start_date) = $3`,
        [req.user.id, year, month]
      );
      if (parseInt(existingCasual.rows[0].count, 10) >= 1) {
        return res.status(400).json({ error: 'You can only take 1 casual leave per month.' });
      }
    }

    // 3. Sick leave > 1 day in a month needs medical certificate (warn only, not block)
    // The system tracks this; approval authority can verify

    // 4. Unpaid leave: skip balance check
    if (leave_type === 'unpaid') {
      isLwp = true;
    }

    // 5. Balance check (for non-unpaid leave types)
    if (leave_type !== 'unpaid' && leave_type !== 'compensatory') {
      if (!typeBalance || typeBalance.remaining < days) {
        // If sick or casual is exhausted, auto-convert to LWP
        if (leave_type === 'sick' || leave_type === 'casual') {
          isLwp = true;
          // Don't block - allow as LWP
        } else {
          return res.status(400).json({
            error: `Insufficient leave balance. Available: ${typeBalance ? typeBalance.remaining : 0}, Requested: ${days}`,
          });
        }
      }
    }

    // For compensatory, check comp balance
    if (leave_type === 'compensatory') {
      if (typeBalance && typeBalance.remaining < days) {
        return res.status(400).json({
          error: `Insufficient compensatory leave balance. Available: ${typeBalance.remaining}, Requested: ${days}`,
        });
      }
    }

    const leave = await Leave.create({
      employee_id: req.user.id,
      leave_type,
      start_date,
      end_date,
      reason,
      is_lwp: isLwp,
    });

    // Notify reporting manager (or HR/Admin if none assigned)
    const applicant = await Employee.findById(req.user.id);
    const applicantName = `${applicant.first_name} ${applicant.last_name}`.trim();
    const lwpNote = isLwp ? ' [LWP - Leave Without Pay]' : '';

    if (applicant.reporting_manager_id) {
      await Notification.create({
        employee_id: applicant.reporting_manager_id,
        title: 'New Leave Request',
        message: `${applicantName} has applied for ${leave_type} leave from ${start_date} to ${end_date} (${days} day${days > 1 ? 's' : ''}).${lwpNote}`,
        type: 'info',
        reference_id: leave.id,
        reference_type: 'leave',
      });
    } else {
      // No reporting manager — notify all HR/Admin
      const hrAdmins = await Employee.getHrAdmins();
      for (const hr of hrAdmins) {
        await Notification.create({
          employee_id: hr.id,
          title: 'New Leave Request',
          message: `${applicantName} has applied for ${leave_type} leave from ${start_date} to ${end_date} (${days} day${days > 1 ? 's' : ''}).${lwpNote}`,
          type: 'info',
          reference_id: leave.id,
          reference_type: 'leave',
        });
      }
    }

    res.status(201).json(leave);
  } catch (err) {
    next(err);
  }
};

exports.getMyLeaves = async (req, res, next) => {
  try {
    const { year, status } = req.query;
    const leaves = await Leave.findByEmployee(req.user.id, { year: parseInt(year, 10), status });
    res.json(leaves);
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeLeaves = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { year, status } = req.query;
    const leaves = await Leave.findByEmployee(parseInt(employeeId, 10), { year: parseInt(year, 10), status });
    res.json(leaves);
  } catch (err) {
    next(err);
  }
};

exports.getMyBalance = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const balance = await Leave.getBalance(req.user.id, year);
    res.json(balance);
  } catch (err) {
    next(err);
  }
};

exports.getPending = async (req, res, next) => {
  try {
    const { department } = req.query;
    const leaves = await Leave.findPending({
      department,
      managerId: req.user.id,
      managerRole: req.user.role,
    });
    res.json(leaves);
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
    if (leave.status !== 'pending') {
      return res.status(400).json({ error: 'Leave is not in pending status.' });
    }

    const days = Math.ceil((new Date(leave.end_date) - new Date(leave.start_date)) / (1000 * 60 * 60 * 24)) + 1;

    // Skip balance deduction for LWP and unpaid leaves
    if (!leave.is_lwp && leave.leave_type !== 'unpaid') {
      await Leave.deductBalance(leave.employee_id, leave.leave_type, days, new Date(leave.start_date).getFullYear());
    }

    const updated = await Leave.updateStatus(id, 'approved', req.user.id, remarks);

    // Notify employee
    const empName = `${leave.first_name} ${leave.last_name}`.trim();
    await Notification.create({
      employee_id: leave.employee_id,
      title: 'Leave Approved',
      message: `Your ${leave.leave_type} leave from ${leave.start_date} to ${leave.end_date} has been approved.`,
      type: 'success',
      reference_id: id,
      reference_type: 'leave',
    });

    // Send FYI email to all HR/Admin (they don't need to act, just be informed)
    const hrAdmins = await Employee.getHrAdmins();
    const approverName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Manager';
    for (const hr of hrAdmins) {
      if (hr.id === req.user.id) continue; // Don't notify self
      sendNotificationEmail({
        employeeEmail: hr.email,
        employeeName: `${hr.first_name} ${hr.last_name}`.trim(),
        title: 'Leave Approved (FYI)',
        message: `${empName}'s ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}, ${days} day${days > 1 ? 's' : ''}) was approved by ${approverName}.`,
        type: 'info',
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found.' });

    // Only the applicant or admin/hr can cancel
    const isOwner = leave.employee_id === req.user.id;
    const isAdmin = ['admin', 'hr'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only cancel your own leave requests.' });
    }
    if (leave.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending leaves can be cancelled.' });
    }

    const updated = await Leave.updateStatus(id, 'cancelled', req.user.id, 'Cancelled by ' + (isOwner ? 'employee' : 'admin'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
    if (leave.status !== 'pending') {
      return res.status(400).json({ error: 'Leave is not in pending status.' });
    }

    const updated = await Leave.updateStatus(id, 'rejected', req.user.id, remarks);

    await Notification.create({
      employee_id: leave.employee_id,
      title: 'Leave Rejected',
      message: `Your ${leave.leave_type} leave from ${leave.start_date} to ${leave.end_date} has been rejected. ${remarks || ''}`,
      type: 'warning',
      reference_id: id,
      reference_type: 'leave',
    });

    // FYI email to HR/Admin
    const empName = `${leave.first_name} ${leave.last_name}`.trim();
    const hrAdmins = await Employee.getHrAdmins();
    const rejecterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Manager';
    for (const hr of hrAdmins) {
      if (hr.id === req.user.id) continue;
      sendNotificationEmail({
        employeeEmail: hr.email,
        employeeName: `${hr.first_name} ${hr.last_name}`.trim(),
        title: 'Leave Rejected (FYI)',
        message: `${empName}'s ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was rejected by ${rejecterName}. Reason: ${remarks || 'N/A'}`,
        type: 'warning',
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};
