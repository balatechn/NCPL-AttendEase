const { getMssqlPool } = require('../config/database');
const { pgPool } = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

const DEVICE_SERIAL = process.env.BIOMETRIC_DEVICE_SERIAL || 'JJA1244600336';
const DEFAULT_EMPLOYEE_PASSWORD = 'Welcome@123';
const DEFAULT_SHIFT_ID = 1;

/**
 * Biometric Sync Service
 * Reads attendance logs from eSSL eTimeTrackLite MS SQL database
 * eSSL stores logs in monthly tables: DeviceLogs_M_YYYY
 * Devices table maps SerialNumber -> DeviceId (int)
 */
const biometricService = {
  /**
   * Resolve device serial number to integer DeviceId from Devices table
   */
  async getDeviceId(pool) {
    const result = await pool.request()
      .input('serial', DEVICE_SERIAL)
      .query('SELECT DeviceId FROM Devices WHERE SerialNumber = @serial');
    if (result.recordset.length === 0) {
      throw new Error(`Device with serial ${DEVICE_SERIAL} not found in Devices table`);
    }
    return result.recordset[0].DeviceId;
  },

  /**
   * Build the monthly table name(s) to query based on the date range
   * eSSL uses format: DeviceLogs_M_YYYY (e.g., DeviceLogs_4_2026)
   */
  getMonthlyTableNames(sinceDate) {
    const tables = [];
    const now = new Date();
    const current = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
    while (current <= now) {
      tables.push(`DeviceLogs_${current.getMonth() + 1}_${current.getFullYear()}`);
      current.setMonth(current.getMonth() + 1);
    }
    return tables;
  },

  /**
   * Fetch raw device logs from eSSL MS SQL database
   * Queries monthly DeviceLogs tables, joins Employees on UserId = EmployeeCodeInDevice
   */
  async fetchDeviceLogs(since) {
    const pool = await getMssqlPool();
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

    const tables = this.getMonthlyTableNames(sinceDate);
    const deviceId = await this.getDeviceId(pool);
    logger.info(`Querying eSSL tables: ${tables.join(', ')} for DeviceId ${deviceId} (Serial: ${DEVICE_SERIAL})`);

    let allRecords = [];
    for (const table of tables) {
      try {
        const result = await pool.request()
          .input('sinceDate', sinceDate)
          .input('deviceId', deviceId)
          .query(`
            SELECT 
              dl.LogDate AS log_time,
              dl.UserId AS device_user_id,
              dl.Direction AS direction,
              dl.DeviceId AS device_id,
              em.EmployeeName AS employee_name,
              em.EmployeeCode AS employee_code
            FROM [${table}] dl
            LEFT JOIN Employees em ON dl.UserId = em.EmployeeCodeInDevice
            WHERE dl.LogDate >= @sinceDate
              AND dl.DeviceId = @deviceId
            ORDER BY dl.UserId, dl.LogDate ASC
          `);
        allRecords = allRecords.concat(result.recordset);
      } catch (err) {
        if (err.message && err.message.includes('Invalid object name')) {
          logger.warn(`Table ${table} does not exist, skipping`);
        } else {
          throw err;
        }
      }
    }

    return allRecords;
  },

  /**
   * Process raw logs: pair IN/OUT, detect late, handle missing punch-out
   */
  processLogs(rawLogs) {
    // Helper: extract HH:MM:SS from Date using UTC getters
    // (MSSQL driver stores local times as UTC, so UTC getters = actual local time)
    function toTimeStr(d) {
      return d.getUTCHours().toString().padStart(2, '0') + ':' +
             d.getUTCMinutes().toString().padStart(2, '0') + ':' +
             d.getUTCSeconds().toString().padStart(2, '0');
    }
    function toDateStr(d) {
      return d.getUTCFullYear() + '-' +
             (d.getUTCMonth() + 1).toString().padStart(2, '0') + '-' +
             d.getUTCDate().toString().padStart(2, '0');
    }

    // Group logs by employee + date
    const grouped = {};

    for (const log of rawLogs) {
      const dt = new Date(log.log_time);
      const date = toDateStr(dt);
      const key = `${log.employee_code}_${date}`;

      if (!grouped[key]) {
        grouped[key] = {
          employee_code: log.employee_code,
          employee_name: log.employee_name,
          date,
          logs: [],
        };
      }
      grouped[key].logs.push({
        time: new Date(log.log_time),
        direction: log.direction, // 0=IN, 1=OUT (eSSL convention)
      });
    }

    const processed = [];

    for (const [key, group] of Object.entries(grouped)) {
      const sorted = group.logs.sort((a, b) => a.time - b.time);

      // First punch = IN, Last punch = OUT
      const punchIn = sorted[0]?.time || null;
      const punchOut = sorted.length > 1 ? sorted[sorted.length - 1]?.time : null;

      // Calculate work hours
      let workHours = null;
      if (punchIn && punchOut) {
        workHours = parseFloat(((punchOut - punchIn) / 3600000).toFixed(2));
      }

      // Handle missing punch-out (mark as incomplete)
      const hasMissingPunchOut = !punchOut && !!punchIn;

      processed.push({
        employee_code: group.employee_code,
        attendance_date: group.date,
        punch_in: punchIn ? toTimeStr(punchIn) : null,
        punch_out: punchOut ? toTimeStr(punchOut) : null,
        work_hours: workHours,
        has_missing_punch_out: hasMissingPunchOut,
        source: 'biometric',
        device_serial: DEVICE_SERIAL,
      });
    }

    return processed;
  },

  /**
   * Calculate late status based on shift timing
   */
  async calculateLateStatus(record) {
    // Get employee's shift
    const empResult = await pgPool.query(
      `SELECT e.id, s.start_time, s.grace_minutes, s.half_day_hours, s.full_day_hours
       FROM employees e
       LEFT JOIN shifts s ON e.shift_id = s.id
       WHERE e.employee_code = $1`,
      [record.employee_code]
    );

    const emp = empResult.rows[0];
    if (!emp) return { ...record, employee_id: null, is_late: false, late_minutes: 0, status: 'absent' };

    const shiftStart = emp.start_time || '09:00:00';
    const graceMins = emp.grace_minutes || 15;
    const halfDayHours = emp.half_day_hours || 4;
    const fullDayHours = emp.full_day_hours || 8;

    let isLate = false;
    let lateMinutes = 0;
    let status = 'present';

    if (record.punch_in) {
      const punchInDate = new Date(`1970-01-01T${record.punch_in}`);
      const shiftDate = new Date(`1970-01-01T${shiftStart}`);
      const graceDate = new Date(shiftDate.getTime() + graceMins * 60000);

      if (punchInDate > graceDate) {
        isLate = true;
        lateMinutes = Math.round((punchInDate - shiftDate) / 60000);
      }
    }

    if (record.work_hours !== null) {
      if (record.work_hours < halfDayHours) {
        status = 'half-day';
      } else if (record.work_hours >= halfDayHours) {
        status = 'present';
      }
    }

    if (record.has_missing_punch_out) {
      status = 'incomplete';
    }

    if (!record.punch_in) {
      status = 'absent';
    }

    return {
      ...record,
      employee_id: emp.id,
      is_late: isLate,
      late_minutes: lateMinutes,
      status,
    };
  },

  /**
   * Main sync function - fetches, processes, and stores biometric data
   */
  async syncBiometricLogs() {
    logger.info('Starting biometric sync...');

    // Get last sync time
    const lastSyncResult = await pgPool.query(
      "SELECT value FROM app_settings WHERE key = 'last_biometric_sync'"
    );
    const lastSync = lastSyncResult.rows[0]?.value
      ? new Date(lastSyncResult.rows[0].value)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    let rawLogs;
    try {
      rawLogs = await this.fetchDeviceLogs(lastSync);
    } catch (err) {
      logger.error('Failed to fetch biometric logs', err);
      return { success: false, error: err.message, synced: 0 };
    }

    if (!rawLogs || rawLogs.length === 0) {
      logger.info('No new biometric logs to process');
      return { success: true, synced: 0 };
    }

    const processed = this.processLogs(rawLogs);
    let synced = 0;
    let errors = 0;

    for (const record of processed) {
      try {
        // Get employee info + shift
        const empResult = await pgPool.query(
          `SELECT e.id, s.start_time, s.grace_minutes, s.half_day_hours, s.full_day_hours
           FROM employees e
           LEFT JOIN shifts s ON e.shift_id = s.id
           WHERE e.employee_code = $1`,
          [record.employee_code]
        );
        const emp = empResult.rows[0];
        if (!emp) {
          logger.warn(`Employee not found for code: ${record.employee_code}`);
          errors++;
          continue;
        }

        // Merge with existing record: keep earliest punch_in, latest punch_out
        let punchIn = record.punch_in;
        let punchOut = record.punch_out;

        const existing = await pgPool.query(
          'SELECT punch_in, punch_out, source FROM attendance WHERE employee_id = $1 AND attendance_date = $2',
          [emp.id, record.attendance_date]
        );

        if (existing.rows[0] && existing.rows[0].source !== 'regularization') {
          const ep = existing.rows[0];
          // Collect all known punch times: first punch = IN, last punch = OUT
          const allTimes = [];
          if (punchIn) allTimes.push(punchIn);
          if (punchOut) allTimes.push(punchOut);
          if (ep.punch_in) allTimes.push(ep.punch_in);
          if (ep.punch_out) allTimes.push(ep.punch_out);

          allTimes.sort();
          const earliest = allTimes[0];
          const latest = allTimes[allTimes.length - 1];
          punchIn = earliest;
          punchOut = earliest !== latest ? latest : null;
        }

        // Recalculate work hours from merged times
        let workHours = null;
        if (punchIn && punchOut) {
          const pIn = new Date(`1970-01-01T${punchIn}`);
          const pOut = new Date(`1970-01-01T${punchOut}`);
          workHours = parseFloat(((pOut - pIn) / 3600000).toFixed(2));
        }

        // Calculate late status from merged punch_in
        const shiftStart = emp.start_time || '09:00:00';
        const graceMins = emp.grace_minutes || 15;
        const halfDayHours = emp.half_day_hours || 4;

        let isLate = false;
        let lateMinutes = 0;
        let status = 'present';

        if (punchIn) {
          const punchInDate = new Date(`1970-01-01T${punchIn}`);
          const shiftDate = new Date(`1970-01-01T${shiftStart}`);
          const graceDate = new Date(shiftDate.getTime() + graceMins * 60000);
          if (punchInDate > graceDate) {
            isLate = true;
            lateMinutes = Math.round((punchInDate - shiftDate) / 60000);
          }
        }

        if (workHours !== null) {
          if (workHours < halfDayHours) {
            status = 'half-day';
          } else {
            status = 'present';
          }
        }
        if (!punchOut && punchIn) status = 'incomplete';
        if (!punchIn) status = 'absent';

        await pgPool.query(
          `INSERT INTO attendance (employee_id, attendance_date, punch_in, punch_out, status, work_hours, is_late, late_minutes, source, device_serial)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (employee_id, attendance_date) 
           DO UPDATE SET 
             punch_in = EXCLUDED.punch_in,
             punch_out = EXCLUDED.punch_out,
             status = CASE WHEN attendance.source = 'regularization' THEN attendance.status ELSE EXCLUDED.status END,
             work_hours = EXCLUDED.work_hours,
             is_late = CASE WHEN attendance.source = 'regularization' THEN attendance.is_late ELSE EXCLUDED.is_late END,
             late_minutes = CASE WHEN attendance.source = 'regularization' THEN attendance.late_minutes ELSE EXCLUDED.late_minutes END,
             source = CASE WHEN attendance.source = 'regularization' THEN attendance.source ELSE EXCLUDED.source END,
             updated_at = NOW()`,
          [emp.id, record.attendance_date, punchIn, punchOut, status, workHours, isLate, lateMinutes, record.source, record.device_serial]
        );

        synced++;
      } catch (err) {
        logger.error(`Failed to sync record for ${record.employee_code} on ${record.attendance_date}`, err);
        errors++;
      }
    }

    // Update last sync time
    await pgPool.query(
      `INSERT INTO app_settings (key, value) VALUES ('last_biometric_sync', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [new Date().toISOString()]
    );

    logger.info(`Biometric sync completed. Synced: ${synced}, Errors: ${errors}`);
    return { success: true, synced, errors, total: processed.length };
  },

  async getSyncStatus() {
    const result = await pgPool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('last_biometric_sync', 'last_employee_sync')"
    );
    const settings = {};
    for (const row of result.rows) settings[row.key] = row.value;
    return {
      lastSync: settings.last_biometric_sync || null,
      lastEmployeeSync: settings.last_employee_sync || null,
      deviceSerial: DEVICE_SERIAL,
    };
  },

  /**
   * Sync employees from eSSL MSSQL into PostgreSQL.
   * Uses EmployeeCode as the static unique key.
   * - New employees: INSERT with default password + leave balances
   * - Existing employees: UPDATE name, department, designation, phone
   * - Deactivated in eSSL: set is_active = false in PG
   * - Re-activated in eSSL: set is_active = true in PG
   * Never overwrites: password_hash, role, shift_id, email
   */
  async syncEmployees() {
    logger.info('Starting employee sync from eSSL...');
    const pool = await getMssqlPool();

    // Fetch ALL employees from eSSL (both active and inactive)
    const esslResult = await pool.request().query(`
      SELECT
        e.EmployeeCode,
        e.EmployeeName,
        e.Gender,
        e.Designation,
        e.Email,
        e.ContactNo,
        e.RecordStatus,
        ISNULL(d.DepartmentFName, 'General') AS DeptName
      FROM Employees e
      LEFT JOIN Departments d ON e.DepartmentId = d.DepartmentId
    `);

    logger.info(`Found ${esslResult.recordset.length} employees in eSSL`);

    // Fetch all existing employee_codes from PG
    const pgResult = await pgPool.query(
      'SELECT id, employee_code, is_active FROM employees'
    );
    const pgMap = new Map();
    for (const row of pgResult.rows) pgMap.set(row.employee_code, row);

    let inserted = 0;
    let updated = 0;
    let deactivated = 0;
    let reactivated = 0;
    let unchanged = 0;
    let errors = 0;
    let passwordHash = null; // lazy-generate only if needed

    for (const emp of esslResult.recordset) {
      const code = String(emp.EmployeeCode).trim();
      if (!code) continue;

      const name = String(emp.EmployeeName || code).trim();
      const nameParts = name.split(/\s+/);
      const firstName = nameParts[0] || code;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const department = emp.DeptName && emp.DeptName !== 'NULL' ? emp.DeptName : 'General';
      const designation = emp.Designation && String(emp.Designation).trim() && String(emp.Designation).trim() !== 'NULL'
        ? String(emp.Designation).trim() : null;
      const phone = emp.ContactNo && String(emp.ContactNo).trim() && String(emp.ContactNo).trim() !== 'NULL'
        ? String(emp.ContactNo).trim() : null;
      const isActiveInEssl = emp.RecordStatus === 1;

      try {
        const existing = pgMap.get(code);

        if (!existing) {
          // --- NEW EMPLOYEE ---
          if (!isActiveInEssl) { unchanged++; continue; } // skip inactive new employees

          if (!passwordHash) {
            passwordHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 12);
          }

          const email = emp.Email && String(emp.Email).trim() && String(emp.Email).trim() !== 'NULL'
            ? String(emp.Email).trim() : `${code}@ncpl.com`;

          // Ensure email uniqueness
          const emailCheck = await pgPool.query('SELECT id FROM employees WHERE email = $1', [email]);
          const finalEmail = emailCheck.rows.length > 0 ? `${code}.auto@ncpl.com` : email;

          const insertResult = await pgPool.query(
            `INSERT INTO employees (employee_code, first_name, last_name, email, password_hash, role, department, designation, shift_id, phone, is_active)
             VALUES ($1,$2,$3,$4,$5,'employee',$6,$7,$8,$9,true)
             RETURNING id`,
            [code, firstName, lastName, finalEmail, passwordHash, department, designation, DEFAULT_SHIFT_ID, phone]
          );

          // Create leave balances for new employee
          const newId = insertResult.rows[0].id;
          const currentYear = new Date().getFullYear();
          await pgPool.query(
            `INSERT INTO leave_balance (employee_id, leave_type, total_allowed, used, year)
             VALUES ($1,'casual',0,0,$2), ($1,'sick',0,0,$2), ($1,'earned',0,0,$2), ($1,'compensatory',0,0,$2)
             ON CONFLICT DO NOTHING`,
            [newId, currentYear]
          );

          logger.info(`[EmpSync] NEW: ${code} - ${firstName} ${lastName}`);
          inserted++;

        } else if (isActiveInEssl) {
          // --- UPDATE EXISTING (active in eSSL) ---
          const changes = [];
          const params = [code];
          let paramIdx = 2;

          // Only update profile fields, never role/shift/password/email
          const fields = [
            { col: 'first_name', val: firstName },
            { col: 'last_name', val: lastName },
            { col: 'department', val: department },
            { col: 'designation', val: designation },
            { col: 'phone', val: phone },
          ];

          for (const f of fields) {
            changes.push(`${f.col} = $${paramIdx}`);
            params.push(f.val);
            paramIdx++;
          }

          // Re-activate if was deactivated
          if (!existing.is_active) {
            changes.push(`is_active = true`);
            reactivated++;
            logger.info(`[EmpSync] REACTIVATED: ${code}`);
          }

          changes.push('updated_at = NOW()');

          const result = await pgPool.query(
            `UPDATE employees SET ${changes.join(', ')} WHERE employee_code = $1`,
            params
          );
          if (result.rowCount > 0) updated++;
          else unchanged++;

        } else {
          // --- DEACTIVATE (inactive in eSSL, exists in PG) ---
          if (existing.is_active) {
            await pgPool.query(
              'UPDATE employees SET is_active = false, updated_at = NOW() WHERE employee_code = $1',
              [code]
            );
            logger.info(`[EmpSync] DEACTIVATED: ${code}`);
            deactivated++;
          } else {
            unchanged++;
          }
        }
      } catch (err) {
        logger.error(`[EmpSync] ERROR for ${code}: ${err.message}`);
        errors++;
      }
    }

    // Update last employee sync time
    await pgPool.query(
      `INSERT INTO app_settings (key, value) VALUES ('last_employee_sync', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [new Date().toISOString()]
    );

    const summary = { success: true, total: esslResult.recordset.length, inserted, updated, deactivated, reactivated, unchanged, errors };
    logger.info(`Employee sync completed.`, summary);
    return summary;
  },
};

module.exports = biometricService;
