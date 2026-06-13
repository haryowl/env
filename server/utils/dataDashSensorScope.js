const { fieldPassesCategoryFilter } = require('./fieldCategories');

/**
 * When data-dash is scoped to Status (or explicit parameters), restrict sensor_readings
 * so LIMIT applies to relevant rows only — not drowned out by high-frequency telemetry.
 */
function collectScopedSensorQuery(deviceMap, categoryMap, categoryOpts, params = []) {
  const paramSet = params?.length
    ? new Set(params.map((p) => String(p || '').trim()).filter(Boolean))
    : null;

  const hasCategoryScope =
    (categoryOpts.categories && categoryOpts.categories.length > 0) ||
    (categoryOpts.excludeCategories && categoryOpts.excludeCategories.length > 0) ||
    (paramSet && paramSet.size > 0);

  if (!hasCategoryScope) {
    return null;
  }

  const sensorTypes = new Set();
  const payloadKeys = new Set();
  let matchedMappings = 0;

  for (const device of Object.values(deviceMap || {})) {
    const mappings = device.mappings;
    if (!Array.isArray(mappings)) continue;

    for (const mapping of mappings) {
      const tgt = mapping.target_field ?? mapping.target;
      if (!tgt || !fieldPassesCategoryFilter(tgt, categoryMap, categoryOpts)) continue;
      if (paramSet && !paramSet.has(String(tgt).trim())) continue;

      matchedMappings += 1;
      const src = mapping.source_field ?? mapping.source;
      [src, tgt].filter(Boolean).forEach((key) => {
        const k = String(key).trim();
        if (k) {
          sensorTypes.add(k);
          payloadKeys.add(k);
        }
      });
    }
  }

  if (matchedMappings === 0) {
    return { sensorTypes: [], payloadKeys: [], active: true };
  }

  return {
    sensorTypes: [...sensorTypes],
    payloadKeys: [...payloadKeys],
    active: true,
  };
}

function appendSensorScopeClause(where, sqlParams, paramIdx, scope) {
  if (!scope?.active) {
    return paramIdx;
  }

  const types = scope.sensorTypes || [];
  const payloadKeys = scope.payloadKeys || [];

  if (types.length === 0 && payloadKeys.length === 0) {
    where.push('1 = 0');
    return paramIdx;
  }

  const parts = [];
  if (types.length > 0) {
    parts.push(`sr.sensor_type = ANY($${paramIdx++})`);
    sqlParams.push(types);
  }
  if (payloadKeys.length > 0) {
    parts.push(`COALESCE(sr.metadata->'payload', '{}'::jsonb) ?| $${paramIdx++}::text[]`);
    sqlParams.push(payloadKeys);
  }

  where.push(`(${parts.join(' OR ')})`);
  return paramIdx;
}

module.exports = {
  collectScopedSensorQuery,
  appendSensorScopeClause,
};
