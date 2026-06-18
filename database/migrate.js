/**
 * Database Migration Runner
 * Reads and executes SQL migration files in order
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT, 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Track migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const migrationDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const executed = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
      if (executed.rows.length > 0) {
        console.log(`⏭ Skipping (already run): ${file}`);
        continue;
      }

      console.log(`▶ Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log(`✅ Completed: ${file}`);
    }

    console.log('\n✅ All migrations complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function runSeeds() {
  const client = await pool.connect();
  try {
    const seedDir = path.join(__dirname, 'seeds');
    const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`🌱 Running seed: ${file}`);
      const sql = fs.readFileSync(path.join(seedDir, file), 'utf8');
      await client.query(sql);
      console.log(`✅ Seeded: ${file}`);
    }

    console.log('\n✅ All seeds complete.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const command = process.argv[2];
if (command === 'seed') {
  runSeeds();
} else {
  runMigrations().then(() => {
    if (process.argv.includes('--seed')) {
      return runSeeds();
    }
  });
}
