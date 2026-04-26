/**
 * Derive moving / stop / park segments from GPS points (ascending time).
 * Points with speed ≤ stopSpeedThreshold accumulate "still" time; shorter still spells count as moving.
 *
 * @param {Array<{ timestamp: string | Date; speed?: number | null }>} pointsAsc
 * @param {{ stopSpeedThreshold: number; stopMinutes: number; parkMinutes: number }} settings
 * @returns {Array<{ from: number; to: number; state: 'moving' | 'stop' | 'park'; durationMs: number }>}
 */
export function deriveStateSegments(pointsAsc, settings) {
  const stopT = Number(settings.stopSpeedThreshold) || 0;
  const stopM = (Number(settings.stopMinutes) || 0) * 60 * 1000;
  const parkM = (Number(settings.parkMinutes) || 0) * 60 * 1000;

  if (!pointsAsc || pointsAsc.length === 0) return [];

  const still = (s) => (Number(s) || 0) <= stopT;

  const raw = pointsAsc.map((p) => ({
    t: new Date(p.timestamp).getTime(),
    still: still(p.speed),
  }));

  const chunks = [];
  let chunkStart = 0;
  for (let i = 1; i <= raw.length; i += 1) {
    if (i === raw.length || raw[i].still !== raw[chunkStart].still) {
      chunks.push({
        from: raw[chunkStart].t,
        to: raw[i - 1].t,
        still: raw[chunkStart].still,
      });
      chunkStart = i;
    }
  }

  const segments = [];
  for (const ch of chunks) {
    const dur = ch.to - ch.from;
    let state;
    if (!ch.still) {
      state = 'moving';
    } else if (dur >= parkM) {
      state = 'park';
    } else if (dur >= stopM) {
      state = 'stop';
    } else {
      state = 'moving';
    }
    segments.push({ from: ch.from, to: ch.to, state, durationMs: dur });
  }

  const out = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.state === s.state) {
      prev.to = s.to;
      prev.durationMs = prev.to - prev.from;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export function extractGpsFromDevicePayload(data) {
  if (!data || typeof data !== 'object') return null;
  const lower = {};
  for (const [k, v] of Object.entries(data)) {
    lower[String(k).toLowerCase()] = v;
  }
  const lat = Number(lower.latitude ?? lower.lat);
  const lng = Number(lower.longitude ?? lower.lng ?? lower.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let ts;
  if (lower.datetime) {
    ts = new Date(lower.datetime);
  } else {
    ts = new Date();
  }
  if (Number.isNaN(ts.getTime())) ts = new Date();
  return {
    latitude: lat,
    longitude: lng,
    speed: lower.speed != null && lower.speed !== '' ? Number(lower.speed) : null,
    heading: lower.heading != null && lower.heading !== '' ? Number(lower.heading) : null,
    timestamp: ts.toISOString(),
  };
}
