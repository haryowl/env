#!/usr/bin/env node
/**
 * Fix missing DB objects that cause errors in logs:
 * - alerts.created_by column
 * - user_sites table
 * Run from project root: node scripts/fix-missing-alerts-and-user-sites.js
 * (Requires .env with DB_* or DATABASE_URL; requires sites table to exist for user_sites.)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../server/config/database');

async function run() {
  try {
    // 1) Add created_by to alerts if missing
    const hasColumn = await query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'alerts' AND column_name = 'created_by'
    `);
    if (hasColumn.rows.length === 0) {
      await query(`
        ALTER TABLE alerts 
        ADD COLUMN created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      `);
      console.log('Added alerts.created_by column.');
    } else {
      console.log('alerts.created_by already exists.');
    }

    // 2) Create user_sites if missing (requires sites table)
    const hasTable = await query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_sites'
    `);
    if (hasTable.rows.length === 0) {
      await query(`
        CREATE TABLE user_sites (
          user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          site_id INTEGER NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
          assigned_at TIMESTAMP DEFAULT NOW(),
          assigned_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
          permission_level VARCHAR(20) DEFAULT 'viewer' CHECK (permission_level IN ('viewer', 'operator', 'admin')),
          PRIMARY KEY (user_id, site_id)
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_user_sites_site_id ON user_sites(site_id)`);
      console.log('Created user_sites table and indexes.');
    } else {
      console.log('user_sites table already exists.');
    }

    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
