#!/usr/bin/env node
/**
 * Legacy wrapper — runs full fresh-install schema ensure.
 * node scripts/fix-missing-alerts-and-user-sites.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ensureCoreSchema } = require('../server/utils/ensureCoreSchema');

ensureCoreSchema()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
