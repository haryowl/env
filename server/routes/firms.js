const express = require('express');
const axios = require('axios');

const router = express.Router();

const FIRMS_AREA = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
/** Indonesia and nearby waters (west,south,east,north). Matches the device fleet region. */
const BBOX = '94,-12,142,8';
const DAY_RANGE = 1;
const SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT'];
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, fires: [], error: null };

function mapKey() {
  return (process.env.FIRMS_MAP_KEY || '').trim();
}

function parseCsv(text, source) {
  const lines = String(text || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const latI = headers.indexOf('latitude');
  const lonI = headers.indexOf('longitude');
  if (latI < 0 || lonI < 0) {
    const msg = lines[0].slice(0, 240);
    if (/invalid|error|limit|denied|key/i.test(msg)) {
      throw new Error(msg);
    }
    return [];
  }
  const idx = (name) => headers.indexOf(name);
  const fires = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    const lat = Number(cols[latI]);
    const lng = Number(cols[lonI]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const acqDate = cols[idx('acq_date')] || '';
    const acqTime = String(cols[idx('acq_time')] || '').padStart(4, '0');
    fires.push({
      id: `${source}-${lat.toFixed(5)}-${lng.toFixed(5)}-${acqDate}-${acqTime}`,
      lat,
      lng,
      brightness: cols[idx('bright_ti4')] || cols[idx('brightness')] || '',
      frp: cols[idx('frp')] || '',
      confidence: cols[idx('confidence')] || '',
      satellite: cols[idx('satellite')] || '',
      instrument: cols[idx('instrument')] || source,
      daynight: cols[idx('daynight')] || '',
      acqDate,
      acqTime,
      source,
    });
  }
  return fires;
}

async function fetchSource(key, source) {
  const url = `${FIRMS_AREA}/${encodeURIComponent(key)}/${source}/${BBOX}/${DAY_RANGE}`;
  const response = await axios.get(url, {
    timeout: 25000,
    responseType: 'text',
    transformResponse: [(data) => data],
    headers: { Accept: 'text/csv,text/plain,*/*' },
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    throw new Error(`FIRMS ${source} returned HTTP ${response.status}`);
  }
  return parseCsv(response.data, source);
}

router.get('/fires', async (req, res) => {
  const key = mapKey();
  if (!key) {
    return res.json({ configured: false, fires: [], updatedAt: null });
  }
  const now = Date.now();
  if (cache.at && now - cache.at < CACHE_MS) {
    return res.json({
      configured: true,
      fires: cache.fires,
      cached: true,
      updatedAt: cache.at,
      error: cache.error,
    });
  }
  try {
    const batches = await Promise.all(SOURCES.map((source) => fetchSource(key, source)));
    const fires = batches.flat();
    cache = { at: now, fires, error: null };
    return res.json({
      configured: true,
      fires,
      cached: false,
      updatedAt: now,
    });
  } catch (error) {
    const message = error.message || 'Failed to load FIRMS fire data';
    if (cache.fires.length) {
      return res.json({
        configured: true,
        fires: cache.fires,
        cached: true,
        updatedAt: cache.at,
        error: message,
      });
    }
    return res.status(502).json({
      configured: true,
      fires: [],
      updatedAt: null,
      error: message,
    });
  }
});

module.exports = router;
