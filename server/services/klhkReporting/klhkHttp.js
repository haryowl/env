const https = require('https');
const http = require('http');
const { URL } = require('url');

function httpRequest(url, method, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttp = urlObj.protocol === 'http:';
    const mod = isHttp ? http : https;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'ENV-KLHK-Reporting/1.0',
    };

    let bodyString = '';
    if (body) {
      bodyString = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(bodyString);
    }

    const req = mod.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttp ? 80 : 443),
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          const is2xx = res.statusCode >= 200 && res.statusCode < 300;
          if (!is2xx) {
            if (opts.acceptText && opts.returnErrorBody) {
              resolve(data);
              return;
            }
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          if (opts.acceptText) {
            resolve(data);
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (bodyString) req.write(bodyString);
    req.end();
  });
}

function probeHttpOriginReachable(originUrl, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(originUrl);
      const isHttp = u.protocol === 'http:';
      const mod = isHttp ? http : https;
      const port = u.port ? Number(u.port) : isHttp ? 80 : 443;
      const req = mod.request(
        {
          hostname: u.hostname,
          port,
          path: '/',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.on('error', () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

module.exports = { httpRequest, probeHttpOriginReachable };
