const { ensureTenantsSchema } = require('./ensureTenantsSchema');
const { ensureSitesSchema } = require('./ensureSitesSchema');
const { ensureAlertsSchema } = require('./ensureAlertsSchema');
const { ensureDevicesSchema } = require('./ensureDevicesSchema');
const { ensureFieldMappingsSchema } = require('./ensureFieldMappingsSchema');

let ensured = false;

/**
 * Idempotent schema fixes for fresh installs (objects that setup-db historically omitted).
 * Safe to run on every server start.
 */
async function ensureCoreSchema() {
  if (ensured) return;

  await ensureTenantsSchema();
  await ensureSitesSchema();
  await ensureAlertsSchema();
  await ensureDevicesSchema();
  await ensureFieldMappingsSchema();

  ensured = true;
}

function resetCoreSchemaCacheForTests() {
  ensured = false;
  require('./ensureTenantsSchema').resetTenantsSchemaCacheForTests?.();
  require('./ensureSitesSchema').resetSitesSchemaCacheForTests?.();
  require('./ensureAlertsSchema').resetAlertsSchemaCacheForTests?.();
  require('./ensureDevicesSchema').resetDevicesSchemaCacheForTests?.();
  require('./ensureFieldMappingsSchema').resetFieldMappingsSchemaCacheForTests?.();
}

module.exports = { ensureCoreSchema, resetCoreSchemaCacheForTests };
