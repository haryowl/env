const { getRow, getRows, query } = require('../config/database');
const { processDeviceData } = require('./deviceMapper');
const mqttService = require('./mqttService');

const MAX_IMPORT_ROWS = Math.max(
  100,
  parseInt(process.env.DATA_IMPORT_MAX_ROWS, 10) || 10000
);
const COMMIT_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.DATA_IMPORT_CONCURRENCY, 10) || 3
);

const MENU_PATH = '/data-import';
const MENU_NAME = 'Data import';

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeRowObject(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key == null || String(key).trim() === '') continue;
    const k = String(key).trim();
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[k] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

function pickDatetime(row) {
  if (!row) return null;
  return (
    row.datetime ??
    row.DateTime ??
    row.DATETIME ??
    row.timestamp ??
    row.Timestamp ??
    row.time ??
    row.Time ??
    null
  );
}

async function getDevice(deviceId) {
  return getRow(
    `SELECT device_id, name, device_type, protocol, timezone, status, config
     FROM devices
     WHERE device_id = $1 AND COALESCE(is_deleted, false) = false`,
    [deviceId]
  );
}

async function getMapperColumns(deviceId) {
  const mappings = [];

  const fieldRows = await getRows(
    `SELECT source_field, target_field, data_type
     FROM field_mappings
     WHERE device_id = $1
     ORDER BY source_field`,
    [deviceId]
  );
  for (const m of fieldRows || []) {
    if (m.source_field) {
      mappings.push({
        source_field: String(m.source_field),
        target_field: m.target_field ? String(m.target_field) : '',
        data_type: m.data_type || 'number',
      });
    }
  }

  const templateRow = await getRow(
    `SELECT mt.mappings
     FROM device_mapper_assignments dma
     JOIN mapper_templates mt ON dma.template_id = mt.template_id
     WHERE dma.device_id = $1
     LIMIT 1`,
    [deviceId]
  );
  let templateMappings = templateRow?.mappings;
  if (typeof templateMappings === 'string') {
    try {
      templateMappings = JSON.parse(templateMappings);
    } catch {
      templateMappings = [];
    }
  }
  if (Array.isArray(templateMappings)) {
    for (const m of templateMappings) {
      const source = m?.source_field || m?.source;
      if (!source) continue;
      const source_field = String(source);
      if (mappings.some((x) => x.source_field === source_field)) continue;
      mappings.push({
        source_field,
        target_field: String(m.target_field || m.target || ''),
        data_type: m.data_type || 'number',
      });
    }
  }

  return mappings;
}

/**
 * Ensure admin / super_admin roles can see Data import in the menu (existing DBs).
 */
async function ensureAdminMenuAccess() {
  try {
    const roles = await getRows(
      `SELECT role_id, role_name FROM roles WHERE role_name IN ('super_admin', 'admin')`
    );
    for (const role of roles || []) {
      await query(
        `INSERT INTO menu_permissions
           (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete)
         VALUES ($1, $2, $3, true, true, true, true, true)
         ON CONFLICT (role_id, menu_path) DO UPDATE SET
           menu_name = EXCLUDED.menu_name,
           can_access = true,
           can_create = true,
           can_read = true,
           can_update = true,
           can_delete = true`,
        [role.role_id, MENU_PATH, MENU_NAME]
      );
    }
  } catch (err) {
    console.warn('dataImport: ensureAdminMenuAccess skipped:', err?.message || err);
  }
}

async function getTemplate(deviceId) {
  const device = await getDevice(deviceId);
  if (!device) {
    const err = new Error('Device not found');
    err.status = 404;
    throw err;
  }

  const mappings = await getMapperColumns(deviceId);
  const sourceFields = mappings
    .map((m) => m.source_field)
    .filter((f) => f && !['datetime', 'timestamp', 'time'].includes(String(f).toLowerCase()));

  const headers = ['datetime', ...sourceFields];
  const sampleValues = headers.map((h) => (h === 'datetime' ? '2026-07-31T10:00:00Z' : ''));
  const csv = `${headers.map(csvEscape).join(',')}\n${sampleValues.map(csvEscape).join(',')}\n`;

  return {
    device: {
      device_id: device.device_id,
      name: device.name,
      timezone: device.timezone || 'UTC',
    },
    headers,
    mappings,
    notes: [
      'One row = one timestamp. Use ISO datetime with Z or offset when possible.',
      'Column names should match mapper source fields (see mappings).',
      `Naive datetimes are interpreted in device timezone: ${device.timezone || 'UTC'}.`,
      'Import does not fire alerts or change device online status.',
      `Max rows per import: ${MAX_IMPORT_ROWS}.`,
    ],
    csv,
    maxRows: MAX_IMPORT_ROWS,
  };
}

function validateAndNormalizeRows(rows) {
  if (!Array.isArray(rows)) {
    const err = new Error('rows must be an array');
    err.status = 400;
    throw err;
  }
  if (rows.length === 0) {
    const err = new Error('No data rows provided');
    err.status = 400;
    throw err;
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    const err = new Error(`Too many rows (max ${MAX_IMPORT_ROWS})`);
    err.status = 400;
    throw err;
  }

  const normalized = [];
  const errors = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = normalizeRowObject(rows[i]);
    if (!row || Object.keys(row).length === 0) {
      errors.push({ row: i + 1, error: 'Empty row' });
      continue;
    }
    const dt = pickDatetime(row);
    if (dt == null || dt === '') {
      errors.push({ row: i + 1, error: 'Missing datetime' });
      continue;
    }
    if (!row.datetime) row.datetime = dt;
    normalized.push({ index: i + 1, row });
  }
  return { normalized, errors };
}

async function previewImport(deviceId, rows) {
  const device = await getDevice(deviceId);
  if (!device) {
    const err = new Error('Device not found');
    err.status = 404;
    throw err;
  }

  const { normalized, errors } = validateAndNormalizeRows(rows);
  const sampleMapped = [];
  let minTs = null;
  let maxTs = null;
  let okCount = 0;

  const sampleLimit = 5;
  for (const item of normalized) {
    try {
      const mapped = await processDeviceData(device, item.row);
      const dt = mapped?.datetime ?? item.row.datetime;
      const parsed = dt != null ? new Date(dt) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        const iso = parsed.toISOString();
        if (!minTs || iso < minTs) minTs = iso;
        if (!maxTs || iso > maxTs) maxTs = iso;
      } else {
        errors.push({ row: item.index, error: 'Invalid datetime after mapping' });
        continue;
      }

      const valueKeys = Object.keys(mapped || {}).filter(
        (k) =>
          k !== 'datetime' &&
          k !== 'metadata' &&
          mapped[k] !== null &&
          mapped[k] !== undefined &&
          mapped[k] !== ''
      );
      if (valueKeys.length === 0) {
        errors.push({ row: item.index, error: 'No sensor values after mapping' });
        continue;
      }

      okCount += 1;
      if (sampleMapped.length < sampleLimit) {
        sampleMapped.push({
          row: item.index,
          datetime: parsed.toISOString(),
          fields: valueKeys.slice(0, 12).reduce((acc, k) => {
            acc[k] = mapped[k];
            return acc;
          }, {}),
        });
      }
    } catch (e) {
      errors.push({ row: item.index, error: e?.message || String(e) });
    }
  }

  return {
    device: {
      device_id: device.device_id,
      name: device.name,
      timezone: device.timezone || 'UTC',
    },
    totalRows: rows.length,
    validRows: okCount,
    errorRows: errors.length,
    dateRange: { start: minTs, end: maxTs },
    sampleMapped,
    errors: errors.slice(0, 50),
    maxRows: MAX_IMPORT_ROWS,
  };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function commitImport(deviceId, rows, user = {}) {
  const device = await getDevice(deviceId);
  if (!device) {
    const err = new Error('Device not found');
    err.status = 404;
    throw err;
  }

  const preview = await previewImport(deviceId, rows);
  if (preview.validRows === 0) {
    const err = new Error('No valid rows to import');
    err.status = 400;
    err.preview = preview;
    throw err;
  }

  const { normalized } = validateAndNormalizeRows(rows);
  const importMeta = {
    importSource: 'csv',
    importedBy: user.user_id || user.id || null,
    importedByEmail: user.email || null,
    importedAt: new Date().toISOString(),
  };

  const summary = {
    rowsAttempted: normalized.length,
    rowsOk: 0,
    rowsFailed: 0,
    sensorInserted: 0,
    sensorSkippedDuplicate: 0,
    gpsInserted: 0,
    failures: [],
  };

  await mapPool(normalized, COMMIT_CONCURRENCY, async (item) => {
    try {
      const mapped = await processDeviceData(device, item.row);
      if (!mapped || mapped.datetime == null || mapped.datetime === '') {
        summary.rowsFailed += 1;
        if (summary.failures.length < 30) {
          summary.failures.push({ row: item.index, error: 'Missing datetime after mapping' });
        }
        return;
      }
      const stats = await mqttService.storeDeviceData(device, mapped, item.row, {
        extraMetadata: importMeta,
      });
      if (stats?.error) {
        summary.rowsFailed += 1;
        if (summary.failures.length < 30) {
          summary.failures.push({ row: item.index, error: stats.error });
        }
        return;
      }
      summary.rowsOk += 1;
      summary.sensorInserted += stats.sensorInserted || 0;
      summary.sensorSkippedDuplicate += stats.sensorSkippedDuplicate || 0;
      summary.gpsInserted += stats.gpsInserted || 0;
    } catch (e) {
      summary.rowsFailed += 1;
      if (summary.failures.length < 30) {
        summary.failures.push({ row: item.index, error: e?.message || String(e) });
      }
    }
  });

  return {
    device: {
      device_id: device.device_id,
      name: device.name,
      timezone: device.timezone || 'UTC',
    },
    preview,
    summary,
  };
}

module.exports = {
  MAX_IMPORT_ROWS,
  MENU_PATH,
  ensureAdminMenuAccess,
  getTemplate,
  previewImport,
  commitImport,
};
