/**
 * Haversine distance in meters between two WGS84 points.
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Drop obvious GPS outliers for map drawing (sequential gate vs last kept point).
 * @param {Array<{ latitude:number, longitude:number, timestamp:string|Date, speed?:number|null, accuracy?:number|null }>} pointsAsc
 * @param {{ gpsFilterEnabled?: boolean, gpsMaxJumpMeters?: number, gpsMaxSpeed?: number, gpsMaxAccuracyMeters?: number|null }} cfg
 */
export function filterGpsOutliers(pointsAsc, cfg) {
  if (!cfg?.gpsFilterEnabled || !pointsAsc?.length) return pointsAsc || [];

  const maxJump = Number(cfg.gpsMaxJumpMeters);
  const maxSpd = Number(cfg.gpsMaxSpeed);
  const maxAccRaw = cfg.gpsMaxAccuracyMeters;
  const useJump = Number.isFinite(maxJump) && maxJump > 0;
  const useSpeed = Number.isFinite(maxSpd) && maxSpd > 0;
  const maxAcc = maxAccRaw == null ? null : Number(maxAccRaw);
  const useAcc = maxAcc != null && Number.isFinite(maxAcc) && maxAcc > 0;

  const out = [];
  let last = null;

  for (const p of pointsAsc) {
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    if (useAcc && p.accuracy != null) {
      const acc = Number(p.accuracy);
      if (Number.isFinite(acc) && acc > maxAcc) continue;
    }

    if (useSpeed && p.speed != null) {
      const sp = Number(p.speed);
      if (Number.isFinite(sp) && sp > maxSpd) continue;
    }

    if (last && useJump) {
      const d = haversineMeters(last.latitude, last.longitude, lat, lon);
      if (d > maxJump) continue;
    }

    const next = { ...p, latitude: lat, longitude: lon };
    out.push(next);
    last = next;
  }

  return out;
}
