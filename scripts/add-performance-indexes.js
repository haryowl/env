/**
 * One-shot migration: add performance indexes for hot query paths.
 * Also applied automatically on server start via ensureDatabaseIndexes.
 *
 * Usage: node scripts/add-performance-indexes.js
 */
require('dotenv').config();

const { Pool } = require('pg');
const { INDEX_DEFINITIONS } = require('../server/utils/ensureDatabaseIndexes');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function tableExists(client, tableName) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return rows[0]?.reg != null;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Adding performance indexes...\n');

    for (const def of INDEX_DEFINITIONS) {
      if (!(await tableExists(client, def.table))) {
        console.log(`  skip ${def.name} (table ${def.table} not found)`);
        continue;
      }
      try {
        await client.query(def.sql);
        console.log(`  ok  ${def.name}`);
      } catch (error) {
        if (def.optional) {
          console.warn(`  warn ${def.name}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
