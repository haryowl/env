/** Short TTL cache for /dashboard/overview aggregate counts (reduces full-table COUNT load). */
const OVERVIEW_TTL_MS = 45 * 1000;

let cache = {
  expiresAt: 0,
  payload: null,
};

async function getCachedDashboardOverview(fetchFn) {
  const now = Date.now();
  if (cache.payload && cache.expiresAt > now) {
    return cache.payload;
  }
  const payload = await fetchFn();
  cache = {
    payload,
    expiresAt: now + OVERVIEW_TTL_MS,
  };
  return payload;
}

function invalidateDashboardOverviewCache() {
  cache = { expiresAt: 0, payload: null };
}

module.exports = {
  getCachedDashboardOverview,
  invalidateDashboardOverviewCache,
  OVERVIEW_TTL_MS,
};
