const { Pool, types } = require('pg');
const sql = require('mssql');
const logger = require('../utils/logger');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects
// This prevents timezone offset issues (e.g. IST midnight → previous day in UTC)
types.setTypeParser(1082, (val) => val);

// PostgreSQL Connection Pool
const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT, 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', err);
});

// MS SQL Configuration for eSSL Biometric Device
// Supports named instances (e.g., localhost\SQLEXPRESS) via instanceName option
const mssqlConfig = {
  server: (process.env.MSSQL_HOST || 'localhost').split('\\')[0],
  port: process.env.MSSQL_HOST && process.env.MSSQL_HOST.includes('\\') ? undefined : parseInt(process.env.MSSQL_PORT, 10),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    instanceName: process.env.MSSQL_HOST && process.env.MSSQL_HOST.includes('\\')
      ? process.env.MSSQL_HOST.split('\\')[1]
      : undefined,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let mssqlPool = null;

async function getMssqlPool() {
  if (!mssqlPool) {
    try {
      mssqlPool = await sql.connect(mssqlConfig);
      logger.info('Connected to MS SQL (Biometric DB)');
    } catch (err) {
      logger.error('MS SQL connection failed', err);
      throw err;
    }
  }
  return mssqlPool;
}

// Test connections
async function testConnections() {
  let pgClient;
  try {
    // Both pgPool.connect() AND pgClient.query() can hang indefinitely:
    // - connectionTimeoutMillis:5000 only covers pool QUEUE wait, not TCP/auth
    // - pgClient.query() has no default timeout
    // We wrap the entire sequence in a 10-second hard timeout.
    pgClient = await Promise.race([
      pgPool.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PG connect() timed out after 10s')), 10000)
      ),
    ]);
    await Promise.race([
      pgClient.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PG test query timed out after 8s')), 8000)
      ),
    ]);
    pgClient.release();
    logger.info('PostgreSQL connection verified');
  } catch (err) {
    logger.error('PostgreSQL connection failed', err);
    if (pgClient) { try { pgClient.release(true); } catch (_) {} }
    throw err;
  }

  try {
    await getMssqlPool();
    logger.info('MS SQL connection verified');
  } catch (err) {
    logger.warn('MS SQL connection failed - biometric sync will be unavailable', err.message);
  }
}

module.exports = { pgPool, getMssqlPool, testConnections };
