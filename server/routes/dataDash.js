const express = require('express');
const { query, getRow } = require('../config/database');
const mathFormulaService = require('../services/mathFormulaService');
const { authenticateToken } = require('../middleware/auth');
const {
  getFieldCategoryMap,
  parseCategoryQuery,
  fieldPassesCategoryFilter,
  filterFieldNames,
} = require('../utils/fieldCategories');
const {
  isNonNumericFieldValue,
} = require('../utils/sensorReadingValue');
const {
  enrichSensorRow,
  resolveReadingValueWithMeta,
  payloadFieldFromMeta,
} = require('../utils/dataDashRowContext');
const {
  resolveDeviceDatetimeFromReading,
  deviceReadingMergeKey,
  compareDeviceTime,
} = require('../utils/deviceReadingTime');
const router = express.Router();

// Apply authentication middleware (filterDeviceData applied at app level)
router.use(authenticateToken);

// GET /api/data-dash
router.get(['/', ''], async (req, res) => {
  try {
    const { deviceIds, parameters, startDate, endDate, groupBy, limit: limitParam } = req.query;
    let ids = deviceIds ? (Array.isArray(deviceIds) ? deviceIds : deviceIds.split(',')) : [];
    // For non-admin: only return data for devices in valid access period
    if (req.allowedDeviceIdsForData !== null) {
      ids = ids.filter(id => req.allowedDeviceIdsForData && req.allowedDeviceIdsForData.includes(id));
    } else if (req.allowedDeviceIds !== null && req.allowedDeviceIds && req.allowedDeviceIds.length > 0) {
      ids = ids.filter(id => req.allowedDeviceIds.includes(id));
    }
    let params = parameters ? (Array.isArray(parameters) ? parameters : parameters.split(',')) : [];
    const categoryMap = await getFieldCategoryMap();
    const categoryOpts = parseCategoryQuery(req);
    if (categoryOpts.excludeCategories.length || categoryOpts.categories) {
      params = filterFieldNames(params, categoryMap, categoryOpts);
    }
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const group = groupBy || null;
    // Limit for display (default 500), export can request up to 100000 (e.g. 1 month at 2–5 min interval)
    const limit = Math.min(Math.max(1, parseInt(limitParam, 10) || 500), 100000);

    // 1. Get all devices and their mapper assignments
    let deviceMap = {};
    if (ids.length) {
      const deviceRows = await query(`
        SELECT d.device_id, d.name, dma.template_id, mt.mappings
        FROM devices d
        LEFT JOIN device_mapper_assignments dma ON d.device_id = dma.device_id
        LEFT JOIN mapper_templates mt ON dma.template_id = mt.template_id
        WHERE d.device_id = ANY($1)
      `, [ids]);
      deviceRows.rows.forEach(row => {
        deviceMap[row.device_id] = {
          name: row.name,
          template_id: row.template_id,
          mappings: row.mappings || null
        };
      });
      console.log('Device mappers:', deviceMap);
    }

    // 2. Get raw sensor data for all devices in range (using sr.timestamp for UTC filtering)
    let where = [];
    let sqlParams = [];
    let paramIdx = 1;
    if (ids.length) {
      where.push(`sr.device_id = ANY($${paramIdx++})`);
      sqlParams.push(ids);
    }
    if (start) {
      where.push(`sr.timestamp >= $${paramIdx++}`);
      sqlParams.push(start);
    }
    if (end) {
      where.push(`sr.timestamp <= $${paramIdx++}`);
      sqlParams.push(end);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rawSql = `
      SELECT sr.timestamp, sr.device_id, sr.sensor_type, sr.value, sr.unit, sr.metadata, (sr.metadata->>'datetime') as datetime
      FROM sensor_readings sr
      ${whereClause}
      ORDER BY sr.timestamp DESC
      LIMIT $${paramIdx}
    `;
    sqlParams.push(limit);
    const rawResult = await query(rawSql, sqlParams);
    const rawRows = rawResult.rows;
    console.log('Raw sensor readings:', rawRows.slice(0, 10));

    // 2b. Get raw GPS track rows for all devices in range (gps_tracks uses UTC timestamp)
    // Use a separate query so we don't explode rows by joining.
    let gpsWhere = [];
    let gpsParams = [];
    let gpsIdx = 1;
    if (ids.length) {
      gpsWhere.push(`gt.device_id = ANY($${gpsIdx++})`);
      gpsParams.push(ids);
    }
    if (start) {
      gpsWhere.push(`gt.timestamp >= $${gpsIdx++}`);
      gpsParams.push(start);
    }
    if (end) {
      gpsWhere.push(`gt.timestamp <= $${gpsIdx++}`);
      gpsParams.push(end);
    }
    const gpsWhereClause = gpsWhere.length ? `WHERE ${gpsWhere.join(' AND ')}` : '';
    const gpsSql = `
      SELECT
        gt.timestamp,
        gt.device_id,
        gt.latitude,
        gt.longitude,
        gt.altitude,
        gt.speed,
        gt.heading,
        gt.accuracy,
        gt.satellites
      FROM gps_tracks gt
      ${gpsWhereClause}
      ORDER BY gt.timestamp DESC
      LIMIT $${gpsIdx}
    `;
    gpsParams.push(limit);
    const gpsResult = await query(gpsSql, gpsParams);
    const gpsRows = gpsResult.rows || [];
    console.log('Raw GPS tracks:', gpsRows.slice(0, 10));

    // 3. Apply mapping to each row (device time = mapped target field `datetime`)
    let mappedData = [];
    for (const row of rawRows) {
      const { meta, deviceDatetime, serverReceivedAt } = enrichSensorRow(row);
      const device = deviceMap[row.device_id] || {};
      let mapped = false;
      if (device.mappings && Array.isArray(device.mappings) && device.mappings.length > 0) {
        for (const mapping of device.mappings) {
          const src = mapping.source_field;
          const tgt = mapping.target_field;
          const typeKeys = [...new Set([src, tgt].filter(Boolean))];
          if (
            typeKeys.includes(row.sensor_type) &&
            tgt &&
            fieldPassesCategoryFilter(tgt, categoryMap, categoryOpts)
          ) {
            let mappedValue = resolveReadingValueWithMeta(row, meta, ...typeKeys);
            if (mapping.formula && mappedValue !== null && mappedValue !== undefined) {
              try {
                mappedValue = mathFormulaService.evaluateFormula(mapping.formula, { value: mappedValue });
              } catch (e) {
                /* keep mappedValue */
              }
            }
            if (mappedValue !== null && mappedValue !== undefined) {
              mappedData.push({
                datetime: deviceDatetime,
                server_received_at: serverReceivedAt,
                device_id: row.device_id,
                device_name: device.name,
                [tgt]: mappedValue,
              });
              mapped = true;
            }
          }
        }
        // String/status fields may only exist inside metadata.payload on numeric rows.
        if (device.mappings && Object.keys(meta).length > 0) {
          for (const mapping of device.mappings) {
            const src = mapping.source_field;
            const tgt = mapping.target_field;
            const typeKeys = [...new Set([src, tgt].filter(Boolean))];
            if (!tgt || typeKeys.includes(row.sensor_type)) continue;
            if (!fieldPassesCategoryFilter(tgt, categoryMap, categoryOpts)) continue;
            const payloadVal = payloadFieldFromMeta(meta, ...typeKeys);
            if (!isNonNumericFieldValue(payloadVal)) continue;
            mappedData.push({
              datetime: deviceDatetime,
              server_received_at: serverReceivedAt,
              device_id: row.device_id,
              device_name: device.name,
              [tgt]: String(payloadVal).trim(),
            });
            mapped = true;
          }
        }
      }
      // Fallback: if not mapped, push raw row
      if (!mapped) {
        mappedData.push({
          datetime: deviceDatetime,
          server_received_at: serverReceivedAt,
          device_id: row.device_id,
          device_name: device.name,
          [row.sensor_type]: row.value,
        });
      }
    }
    console.log('Mapped data (first 10):', mappedData.slice(0, 10));

    // 3b. Append GPS rows into the same stream so requested params can include latitude/longitude/speed/etc.
    // If a mapper template maps gps field names to a custom target_field, honor it.
    const requestedParams = new Set((params || []).map((p) => String(p || '').trim()).filter(Boolean));
    const gpsFieldNames = ['latitude', 'longitude', 'altitude', 'speed', 'heading', 'accuracy', 'satellites'];

    for (const row of gpsRows) {
      const device = deviceMap[row.device_id] || {};
      const base = {
        datetime: resolveDeviceDatetimeFromReading(row) || (row.timestamp ? new Date(row.timestamp).toISOString() : null),
        server_received_at: null,
        device_id: row.device_id,
        device_name: device.name,
      };

      const hasMappings = device.mappings && Array.isArray(device.mappings) && device.mappings.length > 0;
      if (hasMappings) {
        // Apply mappings where source_field matches a gps field name.
        let didMapAny = false;
        for (const mapping of device.mappings) {
          const src = mapping.source_field ?? mapping.source;
          const tgt = mapping.target_field ?? mapping.target;
          if (!src || !tgt) continue;
          if (!fieldPassesCategoryFilter(tgt, categoryMap, categoryOpts)) continue;
          const srcKey = String(src).trim().toLowerCase();
          if (!gpsFieldNames.includes(srcKey)) continue;
          if (row[srcKey] === undefined) continue;
          mappedData.push({
            ...base,
            [tgt]: row[srcKey],
          });
          didMapAny = true;
        }
        // If no gps mappings exist but caller asked for gps params, expose them as raw field names.
        if (!didMapAny) {
          const out = { ...base };
          for (const f of gpsFieldNames) {
            if (requestedParams.size === 0 || requestedParams.has(f)) {
              if (row[f] !== undefined) out[f] = row[f];
            }
          }
          mappedData.push(out);
        }
      } else {
        const out = { ...base };
        for (const f of gpsFieldNames) {
          if (requestedParams.size === 0 || requestedParams.has(f)) {
            if (row[f] !== undefined) out[f] = row[f];
          }
        }
        mappedData.push(out);
      }
    }

    // 4. Merge rows with same mapped device datetime (combine fields)
    let merged = {};
    for (const row of mappedData) {
      const datetime = row.datetime || null;
      const key = deviceReadingMergeKey(row.device_id, datetime, row.server_received_at);
      if (!merged[key]) {
        merged[key] = {
          datetime,
          server_received_at: row.server_received_at || null,
          device_id: row.device_id,
          device_name: row.device_name,
        };
      }
      Object.keys(row).forEach((k) => {
        if (!['device_id', 'device_name', 'datetime', 'server_received_at', '_terminalTime'].includes(k)) {
          if (fieldPassesCategoryFilter(k, categoryMap, categoryOpts)) {
            merged[key][k] = row[k];
          }
        }
      });
    }
    // Always include all requested parameters as columns, set to null if missing
    const filteredParams = params.filter(
      (p) => !['timestamp', 'datetime', 'server_received_at', 'device_id', 'device_name'].includes(p)
    );
    let paramCols = filteredParams.length
      ? filteredParams
      : [...new Set(mappedData.flatMap(row => Object.keys(row)).filter(k => !['timestamp', 'datetime', 'server_received_at', 'device_id', 'device_name'].includes(k)))];
    paramCols = filterFieldNames(paramCols, categoryMap, categoryOpts);
    Object.values(merged).forEach(row => {
      for (const p of paramCols) {
        if (!(p in row)) {
          row[p] = null;
        }
      }
    });
    // Only include selected parameters (target fields) that are not null in each row
    let data = Object.values(merged).map((row) => {
      const filteredRow = {
        datetime: row.datetime,
        timestamp: row.datetime,
        server_received_at: row.server_received_at || null,
        device_id: row.device_id,
        device_name: row.device_name,
      };
      for (const p of paramCols) {
        if (row[p] !== null && row[p] !== undefined) {
          filteredRow[p] = row[p];
        }
      }
      return filteredRow;
    });
    data.sort((a, b) => compareDeviceTime(a.datetime, b.datetime));
    console.log('Final data returned (first 10):', data.slice(0, 10));

    // 5. Summary (max, min, avg for each param)
    const summary = {};
    for (const p of paramCols) {
      const values = data.map(row => Number(row[p])).filter(v => !isNaN(v));
      if (values.length) {
        summary[p] = {
          max: Math.max(...values),
          min: Math.min(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length
        };
      }
    }

    // 6. Summary Table (grouped by period)
    let summaryTable = [];
    if (group) {
      let trunc = 'day';
      if (group === 'hour') trunc = 'hour';
      if (group === 'week') trunc = 'week';
      if (group === 'month') trunc = 'month';
      // Group data by period
      const groupMap = {};
      for (const row of data) {
        if (!row.datetime) continue;
        const period = new Date(row.datetime);
        let key;
        if (trunc === 'hour') key = period.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        else if (trunc === 'day') key = period.toISOString().slice(0, 10); // YYYY-MM-DD
        else if (trunc === 'week') {
          const d = new Date(period);
          d.setDate(d.getDate() - d.getDay());
          key = d.toISOString().slice(0, 10); // week start
        } else if (trunc === 'month') key = period.toISOString().slice(0, 7); // YYYY-MM
        else key = period.toISOString().slice(0, 10);
        if (!groupMap[key]) groupMap[key] = [];
        groupMap[key].push(row);
      }
      for (const [period, rows] of Object.entries(groupMap)) {
        const entry = { period };
        for (const p of paramCols) {
          const values = rows.map(r => Number(r[p])).filter(v => !isNaN(v));
          entry[`${p}_max`] = values.length ? Math.max(...values) : null;
          entry[`${p}_min`] = values.length ? Math.min(...values) : null;
          entry[`${p}_avg`] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        }
        summaryTable.push(entry);
      }
      summaryTable.sort((a, b) => b.period.localeCompare(a.period));
    }

    res.json({
      data,
      summary,
      summaryTable
    });
  } catch (error) {
    console.error('DataDash error:', error);
    res.status(500).json({ error: 'Failed to fetch data dash', details: error.message });
  }
});

router.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND', path: req.originalUrl });
});

module.exports = router; 