const { query, getRow } = require('../config/database');
const {
  DEFAULT_GLOBAL_SUBSCRIBE_PATTERNS,
  normalizeGlobalPatterns,
  getEffectiveGlobalPatterns,
} = require('../utils/mqttIngest');

const SETTINGS_ID = 1;

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_system_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      global_subscribe_patterns JSONB NOT NULL DEFAULT '[]',
      use_builtin_defaults BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(user_id)
    )
  `);
  const row = await getRow('SELECT id FROM mqtt_system_settings WHERE id = $1', [SETTINGS_ID]);
  if (!row) {
    await query(
      `INSERT INTO mqtt_system_settings (id, global_subscribe_patterns, use_builtin_defaults)
       VALUES ($1, $2, true)`,
      [SETTINGS_ID, JSON.stringify([])]
    );
  }
}

async function getGlobalSettings() {
  await ensureTables();
  const row = await getRow('SELECT * FROM mqtt_system_settings WHERE id = $1', [SETTINGS_ID]);
  const patterns = normalizeGlobalPatterns(row?.global_subscribe_patterns);
  const useBuiltinDefaults = row?.use_builtin_defaults !== false;
  const effective = getEffectiveGlobalPatterns({
    patterns,
    use_builtin_defaults: useBuiltinDefaults,
  });
  return {
    builtin_defaults: [...DEFAULT_GLOBAL_SUBSCRIBE_PATTERNS],
    custom_patterns: patterns,
    use_builtin_defaults: useBuiltinDefaults,
    effective_patterns: effective,
    updated_at: row?.updated_at || null,
  };
}

async function updateGlobalSettings({ custom_patterns, use_builtin_defaults }, userId) {
  await ensureTables();
  const patterns = normalizeGlobalPatterns(custom_patterns);
  const useBuiltin = use_builtin_defaults !== false;

  const prev = await getGlobalSettings();
  const prevEffective = new Set(prev.effective_patterns);
  const nextEffective = getEffectiveGlobalPatterns({
    patterns,
    use_builtin_defaults: useBuiltin,
  });
  const nextSet = new Set(nextEffective);

  await query(
    `UPDATE mqtt_system_settings
     SET global_subscribe_patterns = $1,
         use_builtin_defaults = $2,
         updated_at = NOW(),
         updated_by = $3
     WHERE id = $4`,
    [JSON.stringify(patterns), useBuiltin, userId || null, SETTINGS_ID]
  );

  const mqttService = require('./mqttService');
  if (mqttService?.resyncGlobalSubscribePatterns) {
    await mqttService.resyncGlobalSubscribePatterns(prevEffective, nextSet);
  }

  return getGlobalSettings();
}

module.exports = {
  ensureTables,
  getGlobalSettings,
  updateGlobalSettings,
};
