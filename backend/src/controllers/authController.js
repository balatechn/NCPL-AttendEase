const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Employee = require('../models/Employee');
const { pgPool } = require('../config/database');
const { sendNotificationEmail } = require('../services/emailService');
const logger = require('../utils/logger');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const employee = await Employee.findByEmail(email);
    if (!employee) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isValid = await Employee.validatePassword(employee, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const accessToken = jwt.sign(
      { id: employee.id, email: employee.email, role: employee.role, employee_code: employee.employee_code },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    const refreshToken = jwt.sign(
      { id: employee.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    logger.info(`Login success: ${employee.email}`);

    res.json({
      accessToken,
      refreshToken,
      must_change_password: !!employee.must_change_password,
      user: {
        id: employee.id,
        employee_code: employee.employee_code,
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        designation: employee.designation,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const employee = await Employee.findById(decoded.id);
    if (!employee) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const accessToken = jwt.sign(
      { id: employee.id, email: employee.email, role: employee.role, employee_code: employee.employee_code },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token.' });
  }
};

exports.me = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.user.id);
    if (!employee) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(employee);
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with both letters and numbers.' });
    }

    const emp = await pgPool.query('SELECT id, password_hash FROM employees WHERE id = $1', [req.user.id]);
    if (!emp.rows[0]) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, emp.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pgPool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );

    logger.info(`Password changed for employee: ${req.user.id}`);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const emp = await Employee.findByEmail(email);
    if (!emp) {
      // Don't reveal if email exists
      return res.json({ message: 'If the email exists, an OTP has been sent.' });
    }

    // Rate limit: max 3 OTPs per hour
    const recent = await pgPool.query(
      `SELECT COUNT(*) FROM password_reset_otps WHERE employee_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [emp.id]
    );
    if (parseInt(recent.rows[0].count) >= 3) {
      return res.status(429).json({ error: 'Too many OTP requests. Please try again later.' });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate previous OTPs
    await pgPool.query(
      'UPDATE password_reset_otps SET used = true WHERE employee_id = $1 AND used = false',
      [emp.id]
    );

    await pgPool.query(
      'INSERT INTO password_reset_otps (employee_id, otp_hash, expires_at) VALUES ($1, $2, $3)',
      [emp.id, otpHash, expiresAt]
    );

    // Send OTP email
    sendNotificationEmail({
      employeeEmail: emp.email,
      employeeName: `${emp.first_name} ${emp.last_name}`,
      title: 'Password Reset OTP',
      message: `Your OTP for password reset is: <strong style="font-size:24px;letter-spacing:4px;color:#1d4ed8;">${otp}</strong><br/><br/>This OTP is valid for 10 minutes. Do not share it with anyone.`,
      type: 'warning',
    }).catch(() => {});

    logger.info(`OTP sent to ${emp.email} for password reset`);
    res.json({ message: 'If the email exists, an OTP has been sent.' });
  } catch (err) {
    next(err);
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });

    const emp = await Employee.findByEmail(email);
    if (!emp) return res.status(400).json({ error: 'Invalid email or OTP.' });

    const otpRecord = await pgPool.query(
      `SELECT * FROM password_reset_otps 
       WHERE employee_id = $1 AND used = false AND expires_at > NOW() AND attempts < 3
       ORDER BY created_at DESC LIMIT 1`,
      [emp.id]
    );

    if (!otpRecord.rows[0]) {
      return res.status(400).json({ error: 'OTP expired or invalid. Please request a new one.' });
    }

    const record = otpRecord.rows[0];
    const valid = await bcrypt.compare(otp, record.otp_hash);

    if (!valid) {
      await pgPool.query('UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      const remaining = 2 - record.attempts;
      return res.status(400).json({ error: `Invalid OTP. ${remaining > 0 ? remaining + ' attempt(s) remaining.' : 'Please request a new OTP.'}` });
    }

    // Mark OTP as used and generate reset token
    await pgPool.query('UPDATE password_reset_otps SET used = true WHERE id = $1', [record.id]);

    const resetToken = jwt.sign(
      { id: emp.id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ resetToken });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with both letters and numbers.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'password_reset') throw new Error('Invalid token purpose');
    } catch {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new OTP.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pgPool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [hash, decoded.id]
    );

    logger.info(`Password reset for employee: ${decoded.id}`);
    res.json({ message: 'Password reset successfully. You can now login.' });
  } catch (err) {
    next(err);
  }
};

// ─── Microsoft OAuth SSO ──────────────────────────────────────────────────────

exports.microsoftRedirect = (req, res) => {
  const state = jwt.sign({ ts: Date.now() }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email',
    state,
  });
  res.redirect(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`);
};

exports.microsoftCallback = async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://49.206.25.183:3000';
  try {
    const { code, error, state } = req.query;
    if (error) {
      return res.redirect(`${frontendUrl}/login?mserror=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${frontendUrl}/login?mserror=invalid_request`);
    }

    // Validate state to prevent CSRF
    try {
      jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.redirect(`${frontendUrl}/login?mserror=invalid_state`);
    }

    // Exchange code for Microsoft tokens and decode id_token
    const payload = await exchangeMicrosoftCode(code);
    const email = payload.email || payload.preferred_username;
    if (!email) {
      return res.redirect(`${frontendUrl}/login?mserror=no_email`);
    }

    // Find employee by email
    const employee = await Employee.findByEmail(email.toLowerCase());
    if (!employee || !employee.is_active) {
      return res.redirect(`${frontendUrl}/login?mserror=user_not_found`);
    }

    const accessToken = jwt.sign(
      { id: employee.id, email: employee.email, role: employee.role, employee_code: employee.employee_code },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    const refreshToken = jwt.sign(
      { id: employee.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    logger.info(`Microsoft SSO login: ${employee.email}`);

    const user = JSON.stringify({
      id: employee.id,
      employee_code: employee.employee_code,
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      designation: employee.designation,
    });

    const redirectParams = new URLSearchParams({ accessToken, refreshToken, user });
    res.redirect(`${frontendUrl}/auth/callback?${redirectParams}`);
  } catch (err) {
    next(err);
  }
};

async function exchangeMicrosoftCode(code) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString();

    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error_description || parsed.error));
          // Decode id_token payload (base64url → JSON)
          const part = parsed.id_token.split('.')[1];
          const pad = part.length % 4;
          const b64 = part + (pad ? '='.repeat(4 - pad) : '');
          const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
          resolve(payload);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.sendWelcomeEmails = async (req, res, next) => {
  try {
    const employees = await pgPool.query(
      `SELECT id, email, first_name, last_name, employee_code FROM employees WHERE is_active = true AND role != 'admin' AND email IS NOT NULL AND email != ''`
    );

    let sent = 0;
    let skipped = 0;
    for (const emp of employees.rows) {
      if (!emp.email || emp.email.endsWith('.auto@ncpl.com')) {
        skipped++;
        continue;
      }
      sendNotificationEmail({
        employeeEmail: emp.email,
        employeeName: `${emp.first_name} ${emp.last_name}`,
        title: 'Welcome to NCPL AttendEase!',
        message: `Your attendance management account is ready.<br/><br/>
          <strong>Login Details:</strong><br/>
          Email: <strong>${emp.email}</strong><br/>
          Password: <strong>Welcome@123</strong><br/><br/>
          You will be asked to change your password on first login.<br/>
          Please keep your credentials secure and do not share them.`,
        type: 'success',
      }).catch(() => {});
      sent++;
    }

    logger.info(`Welcome emails: sent=${sent}, skipped=${skipped}`);
    res.json({ message: `Welcome emails queued: ${sent} sent, ${skipped} skipped (no valid email).` });
  } catch (err) {
    next(err);
  }
};
