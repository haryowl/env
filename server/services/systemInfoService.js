const os = require('os');
const fsp = require('fs').promises;

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return null;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}

function summarizeNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  if (!interfaces) return [];
  const rows = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      rows.push({
        name,
        family: a.family,
        internal: a.internal,
        address: a.address,
      });
    }
  }
  return rows;
}

async function statfsForPath(p) {
  if (typeof fsp.statfs !== 'function') {
    return {
      path: p,
      unavailable: true,
      reason: 'Node.js fs.promises.statfs is not available (upgrade to Node 18.15+)',
    };
  }
  try {
    const s = await fsp.statfs(p);
    const bsize = Number(s.bsize) || Number(s.frsize) || 4096;
    const blocks = Number(s.blocks);
    const bavail = Number(s.bavail);
    const total = blocks * bsize;
    const free = bavail * bsize;
    const used = Math.max(0, total - free);
    const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : null;
    return {
      path: p,
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      usedPercent,
      totalFormatted: formatBytes(total),
      freeFormatted: formatBytes(free),
      usedFormatted: formatBytes(used),
    };
  } catch (e) {
    return { path: p, error: e.message };
  }
}

/**
 * Snapshot of OS / hardware / process metrics for the machine running this Node process.
 */
async function getFullSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);

  const diskPaths = [process.cwd()];
  if (os.platform() !== 'win32') {
    diskPaths.push('/');
  }

  const disks = [];
  for (const p of diskPaths) {
    disks.push(await statfsForPath(p));
  }

  const memUsage = process.memoryUsage();

  return {
    collectedAt: new Date().toISOString(),
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      hostname: os.hostname(),
      arch: os.arch(),
      endianness: os.endianness(),
    },
    uptime: {
      systemSeconds: Math.floor(os.uptime()),
      processSeconds: Math.floor(process.uptime()),
    },
    cpu: {
      logicalCores: cpus.length,
      model: cpus[0]?.model || '',
      speedMhz: cpus[0]?.speed || 0,
    },
    loadAverage: os.platform() !== 'win32' ? os.loadavg() : null,
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usedPercent: totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : null,
      totalFormatted: formatBytes(totalMem),
      freeFormatted: formatBytes(freeMem),
      usedFormatted: formatBytes(usedMem),
    },
    process: {
      nodeVersion: process.version,
      pid: process.pid,
      cwd: process.cwd(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
        rssFormatted: formatBytes(memUsage.rss),
        heapUsedFormatted: formatBytes(memUsage.heapUsed),
        heapTotalFormatted: formatBytes(memUsage.heapTotal),
      },
    },
    networkInterfaces: summarizeNetworkInterfaces(),
    disks,
  };
}

module.exports = { getFullSystemInfo, formatBytes };
