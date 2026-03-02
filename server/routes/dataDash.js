const express = require('express');
const { query, getRow } = require('../config/database');
const mathFormulaService = require('../services/mathFormulaService');
const parseDeviceDatetime = require('../services/parseDeviceDatetime');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Apply authentication middleware to all data-dash routes
router.use(authenticateToken);

// GET /api/data-dash
router.get(['/', ''], async (req, res) => {
  try {
    const { deviceIds, parameters, startDate, endDate, groupBy } = req.query;
    const ids = deviceIds ? (Array.isArray(deviceIds) ? deviceIds : deviceIds.split(',')) : [];
    const params = parameters ? (Array.isArray(parameters) ? parameters : parameters.split(',')) : [];
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const group = groupBy || null;

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
      LIMIT 2000
    `;
    const rawResult = await query(rawSql, sqlParams);
    const rawRows = rawResult.rows;
    console.log('Raw sensor readings:', rawRows.slice(0, 10));

    // 3. Apply mapping to each row (use row.datetime as the main time axis)
    let mappedData = [];
    for (const row of rawRows) {
      const device = deviceMap[row.device_id] || {};
      let mapped = false;
      if (device.mappings && Array.isArray(device.mappings) && device.mappings.length > 0) {
        for (const mapping of device.mappings) {
          if (mapping.source_field === row.sensor_type && mapping.target_field) {
            let mappedValue = row.value;
            if (mapping.formula) {
              try {
                mappedValue = mathFormulaService.evaluateFormula(mapping.formula, { value: row.value });
              } catch (e) {
                mappedValue = row.value;
              }
            }
            mappedData.push({
              datetime: row.datetime, // device time
              timestamp: row.timestamp, // server receive time
              device_id: row.device_id,
              device_name: device.name,
              [mapping.target_field]: mappedValue
            });
            mapped = true;
          }
        }
      }
      // Fallback: if not mapped, push raw row
      if (!mapped) {
        mappedData.push({
          datetime: row.datetime, // device time
          timestamp: row.timestamp, // server receive time
          device_id: row.device_id,
          device_name: device.name,
          [row.sensor_type]: row.value
        });
      }
    }
    console.log('Mapped data (first 10):', mappedData.slice(0, 10));

    // 4. Merge rows with same timestamp/device (combine fields)
    let merged = {};
    for (const row of mappedData) {
      // If the row has a mapped datetime field (e.g., from _terminalTime), use it
      let datetime = row.datetime;
      if (!datetime) {
        if (row._terminalTime) {
          const parsed = parseDeviceDatetime(row._terminalTime);
          datetime = parsed ? parsed.toISOString() : row._terminalTime;
        } else if (row['timestamp']) {
          datetime = row['timestamp'];
        } else {
          datetime = row.timestamp;
        }
      }
      const key = `${row.timestamp}_${row.device_id}`;
      if (!merged[key]) {
        merged[key] = {
          timestamp: row.timestamp, // server receive time
          datetime: datetime,       // device data time (robustly parsed)
          device_id: row.device_id,
          device_name: row.device_name
        };
      }
      Object.keys(row).forEach(k => {
        if (!['timestamp', 'device_id', 'device_name', 'datetime', '_terminalTime'].includes(k)) {
          merged[key][k] = row[k];
        }
      });
    }
    // Always include all requested parameters as columns, set to null if missing
    const filteredParams = params.filter(p => !['timestamp', 'device_id', 'device_name'].includes(p));
    const paramCols = filteredParams.length
      ? filteredParams
      : [...new Set(mappedData.flatMap(row => Object.keys(row)).filter(k => !['timestamp','device_id','device_name'].includes(k)))];
    Object.values(merged).forEach(row => {
      for (const p of paramCols) {
        if (!(p in row)) {
          row[p] = null;
        }
      }
    });
    // Only include selected parameters (target fields) that are not null in each row
    const data = Object.values(merged).map(row => {
      const filteredRow = {
        timestamp: row.timestamp,
        datetime: row.datetime,
        device_id: row.device_id,
        device_name: row.device_name
      };
      for (const p of paramCols) {
        if (row[p] !== null && row[p] !== undefined) {
          filteredRow[p] = row[p];
        }
      }
      return filteredRow;
    });
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
        const period = new Date(row.timestamp);
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