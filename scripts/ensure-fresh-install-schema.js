#!/usr/bin/env node
/**
 * Apply idempotent schema fixes for fresh / legacy databases.
 * Run from project root: node scripts/ensure-fresh-install-schema.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ensureCoreSchema } = require('../server/utils/ensureCoreSchema');

async function run() {
  try {
    await ensureCoreSchema();
    console.log('Core schema OK (user_sites, alerts.created_by, alert notification tables, device columns, field_mappings.formula, tenants).');
  } catch (err) {
    console.error('Schema ensure failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

run();
