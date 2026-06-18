const Regularization = require('../models/Regularization');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const Employee = require('../models/Employee');
const { sendNotificationEmail } = require('../services/emailService');

exports.apply = async (req, res, next) => {
  try {
    const { attendance_date, reason, regularization_type } = req.body;
    const requested_punch_in = req.body.requested_punch_in || null;
    const requested_punch_out = req.body.requested_punch_out || null;
    if (!attendance_date || !reason || !regularization_type) {
      return res.status(400).json({ error: 'Date, type, and reason are required.' });
    }

    // Validate punch_out is after punch_in to prevent AM/PM mix-ups
    if (requested_punch_in && requested_punch_out) {
      const pIn = new Date(`1970-01-01T${requested_punch_in}`);
      const pOut = new Date(`1970-01-01T${requested_punch_out}`);
      if (pOut <= pIn) {
        return res.status(400).json({ error: 'Punch-out time must be after punch-in time. Please use 24-hour format (e.g., 18:30 instead of 06:30 for 6:30 PM).' });
      }
    }

    const reg = await Regularization.create({
      employee_id: req.user.id,
      attendance_date,
      requested_punch_in,
      requested_punch_out,
      reason,
      regularization_type,
    });

    // Notify reporting manager or HR/Admin fallback
    const applicant = await Employee.findById(req.user.id);
    const applicantName = `${applicant.first_name} ${applicant.last_name}`.trim();
    if (applicant.reporting_manager_id) {
      const manager = await Employee.findById(applicant.reporting_manager_id);
      if (manager && manager.email) {
        sendNotificationEmail({
          employeeEmail: manager.email,
          employeeName: `${manager.first_name} ${manager.last_name}`.trim(),
          title: 'New Regularization Request',
          message: `${applicantName} has requested attendance regularization for ${attendance_date}. Reason: ${reason}`,
          type: 'info',
        }).catch(() => {});
      }
    } else {
      const hrAdmins = await Employee.getHrAdmins();
      for (const hr of hrAdmins) {
        sendNotificationEmail({
          employeeEmail: hr.email,
          employeeName: `${hr.first_name} ${hr.last_name}`.trim(),
          title: 'New Regularization Request',
          message: `${applicantName} has requested attendance regularization for ${attendance_date}. Reason: ${reason}`,
          type: 'info',
        }).catch(() => {});
      }
    }

    res.status(201).json(reg);
  } catch (err) {
    next(err);
  }
};

exports.getMyRequests = async (req, res, next) => {
  try {
    const requests = await Regularization.findByEmployee(req.user.id);
    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeRequests = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const requests = await Regularization.findByEmployee(parseInt(employeeId, 10));
    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.getPending = async (req, res, next) => {
  try {
    const requests = await Regularization.findPending({
      managerId: req.user.id,
      managerRole: req.user.role,
    });
    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const reg = await Regularization.findById(id);
    if (!reg) return res.status(404).json({ error: 'Request not found.' });
    if (reg.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not in pending status.' });
    }

    // Update attendance record with regularized times
    const normalizedDate = (reg.attendance_date || '').substring(0, 10);

    // Validate punch_out > punch_in to prevent negative work hours
    let workHours = null;
    if (reg.requested_punch_in && reg.requested_punch_out) {
      const pIn = new Date(`1970-01-01T${reg.requested_punch_in}`);
      const pOut = new Date(`1970-01-01T${reg.requested_punch_out}`);
      workHours = ((pOut - pIn) / 3600000).toFixed(2);
      if (workHours <= 0) {
        return res.status(400).json({ error: `Cannot approve: punch-out (${reg.requested_punch_out}) is before punch-in (${reg.requested_punch_in}). This would result in negative work hours. Please reject and ask the employee to resubmit with correct times.` });
      }
    }

    await Attendance.upsert({
      employee_id: reg.employee_id,
      attendance_date: normalizedDate,
      punch_in: reg.requested_punch_in,
      punch_out: reg.requested_punch_out,
      status: 'present',
      work_hours: workHours,
      is_late: false,
      late_minutes: 0,
      source: 'regularization',
    });

    const updated = await Regularization.updateStatus(id, 'approved', req.user.id, remarks);

    await Notification.create({
      employee_id: reg.employee_id,
      title: 'Regularization Approved',
      message: `Your regularization for ${reg.attendance_date} has been approved.`,
      type: 'success',
      reference_id: id,
      reference_type: 'regularization',
    });

    // FYI email to HR/Admin
    const empName = `${reg.first_name} ${reg.last_name}`.trim();
    const hrAdmins = await Employee.getHrAdmins();
    const approverName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Manager';
    for (const hr of hrAdmins) {
      if (hr.id === req.user.id) continue;
      sendNotificationEmail({
        employeeEmail: hr.email,
        employeeName: `${hr.first_name} ${hr.last_name}`.trim(),
        title: 'Regularization Approved (FYI)',
        message: `${empName}'s regularization for ${reg.attendance_date} was approved by ${approverName}.`,
        type: 'info',
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const reg = await Regularization.findById(id);
    if (!reg) return res.status(404).json({ error: 'Request not found.' });

    const updated = await Regularization.updateStatus(id, 'rejected', req.user.id, remarks);

    await Notification.create({
      employee_id: reg.employee_id,
      title: 'Regularization Rejected',
      message: `Your regularization for ${reg.attendance_date} has been rejected. ${remarks || ''}`,
      type: 'warning',
      reference_id: id,
      reference_type: 'regularization',
    });

    // FYI email to HR/Admin
    const empName = `${reg.first_name} ${reg.last_name}`.trim();
    const hrAdmins = await Employee.getHrAdmins();
    const rejecterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Manager';
    for (const hr of hrAdmins) {
      if (hr.id === req.user.id) continue;
      sendNotificationEmail({
        employeeEmail: hr.email,
        employeeName: `${hr.first_name} ${hr.last_name}`.trim(),
        title: 'Regularization Rejected (FYI)',
        message: `${empName}'s regularization for ${reg.attendance_date} was rejected by ${rejecterName}. Reason: ${remarks || 'N/A'}`,
        type: 'warning',
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};
