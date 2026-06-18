/**
 * Import employees from eSSL eTimeTrackLite MSSQL database into PostgreSQL
 * Run on the server from C:\NCPL-attend: node scripts/import-employees.js
 */
const path = require('path');
const backendDir = path.join(__dirname, '..', 'backend');

// Resolve modules from backend/node_modules
const resolve = (mod) => require(require.resolve(mod, { paths: [backendDir] }));

resolve('dotenv').config({ path: path.join(backendDir, '.env') });

const sql = resolve('mssql');
const { Pool } = resolve('pg');
const bcrypt = resolve('bcryptjs');

const DEFAULT_PASSWORD = 'Welcome@123';
const DEFAULT_SHIFT_ID = 1; // General Shift from seed data

async function main() {
  // PostgreSQL connection
  const pgPool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'attendease',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'password',
  });

  // MSSQL connection
  const mssqlHost = (process.env.MSSQL_HOST || 'localhost\\SQLEXPRESS').split('\\')[0];
  const instanceName = (process.env.MSSQL_HOST || 'localhost\\SQLEXPRESS').split('\\')[1];
  
  const mssqlConfig = {
    server: mssqlHost,
    database: process.env.MSSQL_DATABASE || 'etimetracklite1',
    user: process.env.MSSQL_USER || 'essl',
    password: process.env.MSSQL_PASSWORD || 'essl',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      instanceName: instanceName || undefined,
    },
  };

  console.log('Connecting to MSSQL...');
  const mssqlPool = await sql.connect(mssqlConfig);
  
  console.log('Connecting to PostgreSQL...');
  await pgPool.query('SELECT 1');

  // Fetch employees from eSSL
  console.log('Fetching employees from eSSL...');
  const result = await mssqlPool.request().query(`
    SELECT 
      e.EmployeeCode, 
      e.EmployeeName, 
      e.Gender, 
      e.Designation,
      e.Email, 
      e.ContactNo,
      ISNULL(d.DepartmentFName, 'General') AS DeptName
    FROM Employees e
    LEFT JOIN Departments d ON e.DepartmentId = d.DepartmentId
    WHERE e.RecordStatus = 1
    ORDER BY e.EmployeeCode
  `);

  console.log(`Found ${result.recordset.length} employees in eSSL`);

  // Generate default password hash  
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  console.log(`Default password: ${DEFAULT_PASSWORD}`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const emp of result.recordset) {
    const code = String(emp.EmployeeCode).trim();
    const name = String(emp.EmployeeName || code).trim();
    
    // Split name into first/last; if single word, use it as first name
    const nameParts = name.split(/\s+/);
    const firstName = nameParts[0] || code;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Generate email if not provided
    const email = emp.Email && emp.Email.trim() && emp.Email.trim() !== 'NULL'
      ? emp.Email.trim()
      : `${code}@ncpl.com`;

    const phone = emp.ContactNo && emp.ContactNo.trim() && emp.ContactNo.trim() !== 'NULL'
      ? emp.ContactNo.trim()
      : null;

    const department = emp.DeptName && emp.DeptName !== 'NULL' ? emp.DeptName : 'General';
    const designation = emp.Designation && emp.Designation.trim() && emp.Designation.trim() !== 'NULL'
      ? emp.Designation.trim()
      : null;

    try {
      // Check if employee already exists
      const existing = await pgPool.query(
        'SELECT id FROM employees WHERE employee_code = $1',
        [code]
      );

      if (existing.rows.length > 0) {
        console.log(`  SKIP: ${code} (${firstName}) - already exists`);
        skipped++;
        continue;
      }

      // Check if email already exists (avoid unique constraint violation)
      const emailCheck = await pgPool.query(
        'SELECT id FROM employees WHERE email = $1',
        [email]
      );

      let finalEmail = email;
      if (emailCheck.rows.length > 0) {
        finalEmail = `${code}.dup@ncpl.com`;
      }

      await pgPool.query(
        `INSERT INTO employees (employee_code, first_name, last_name, email, password_hash, role, department, designation, shift_id, phone, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [code, firstName, lastName, finalEmail, passwordHash, 'employee', department, designation, DEFAULT_SHIFT_ID, phone, true]
      );

      console.log(`  OK: ${code} - ${firstName} ${lastName} (${department})`);
      imported++;
    } catch (err) {
      console.error(`  ERROR: ${code} - ${err.message}`);
      errors++;
    }
  }

  console.log('\n--- Import Summary ---');
  console.log(`Total in eSSL: ${result.recordset.length}`);
  console.log(`Imported:       ${imported}`);
  console.log(`Skipped:        ${skipped}`);
  console.log(`Errors:         ${errors}`);

  // Also create default leave balances for imported employees
  if (imported > 0) {
    console.log('\nCreating leave balances for new employees...');
    const newEmps = await pgPool.query(
      "SELECT id FROM employees WHERE role = 'employee' AND id NOT IN (SELECT DISTINCT employee_id FROM leave_balance)"
    );
    
    const leaveTypes = [
      { type: 'casual', total: 12 },
      { type: 'sick', total: 12 },
      { type: 'earned', total: 15 },
    ];

    for (const emp of newEmps.rows) {
      for (const lt of leaveTypes) {
        await pgPool.query(
          `INSERT INTO leave_balance (employee_id, leave_type, total_allowed, used, year)
           VALUES ($1, $2, $3, 0, EXTRACT(YEAR FROM NOW()))
           ON CONFLICT DO NOTHING`,
          [emp.id, lt.type, lt.total]
        );
      }
    }
    console.log(`Leave balances created for ${newEmps.rows.length} employees`);
  }

  await mssqlPool.close();
  await pgPool.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
