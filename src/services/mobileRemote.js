const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const { getPrivateDataDir, writeLog } = require('./security');
const { generateQrSvg } = require('./qrCode');

const MOBILE_PORT = 47822;
const MAX_BODY = 64 * 1024;

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    const isVirtual = /wsl|vethernet|hyper-v|vmware|virtualbox|docker|tailscale/i.test(name);
    for (const iface of nets[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(iface.address)) {
        const prio = !isVirtual && iface.address.startsWith('192.168.') ? 0 : !isVirtual && iface.address.startsWith('10.') ? 1 : !isVirtual ? 2 : 3;
        candidates.push({ address: iface.address, prio });
      }
    }
  }
  candidates.sort((a, b) => a.prio - b.prio);
  return candidates[0]?.address || '127.0.0.1';
}

function findCloudflaredExe() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.unsloth', 'studio', 'bin', 'cloudflared.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe'),
    path.join(process.env.PROGRAMFILES || '', 'cloudflared', 'cloudflared.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'cloudflared', 'cloudflared.exe'),
    'cloudflared.exe',
    'cloudflared',
  ];
  for (const p of candidates) {
    if (!p) continue;
    if (p.includes(path.sep) && fs.existsSync(p)) return p;
  }
  return 'cloudflared';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Hardened Worldwide Mobile Remote Server + Cloudflare Quick Tunnel Bridge:
 * - OFF by default for public safety; user opts in with 1 click!
 * - 256-bit cryptographically random token stored strictly in %LOCALAPPDATA%\PetFish\mobile-auth.json
 * - One-time 6-digit pairing PIN (3-minute TTL) + 100% offline SVG QR Code
 * - Per-IP brute-force rate limiter (locks out after 6 bad tries for 5 minutes)
 * - Serves mobile/web/index.html + authenticated REST API for PetFish Android APK & mobile browser!
 */
class MobileRemoteServer extends EventEmitter {
  constructor(handlers = {}) {
    super();
    this.handlers = handlers;
    this.authFile = path.join(getPrivateDataDir(), 'mobile-auth.json');
    this.webHtmlPath = path.resolve(__dirname, '..', '..', 'mobile', 'web', 'index.html');
    this.server = null;
    this.tunnelProc = null;
    this.running = false;
    this.tunnelRunning = false;
    this.tunnelUrl = '';
    this.tunnelStatus = 'Stopped';
    this.lanEnabled = false;
    this.token = '';
    this.customUrl = '';
    this.pairingPin = null; // { code, expiresAt }
    this.failMap = new Map(); // ip -> { count, lockedUntil }
    this.lastClientSeen = 0;
    this.loadAuth();
  }

  loadAuth() {
    try {
      if (fs.existsSync(this.authFile)) {
        const d = JSON.parse(fs.readFileSync(this.authFile, 'utf8'));
        if (d.token && /^[a-f0-9]{64}$/i.test(d.token)) this.token = d.token;
        if (typeof d.customUrl === 'string') this.customUrl = d.customUrl.trim().slice(0, 180);
      }
    } catch {}
    if (!this.token) {
      this.token = crypto.randomBytes(32).toString('hex');
      this.saveAuth();
    }
  }

  saveAuth() {
    try {
      fs.writeFileSync(
        this.authFile,
        JSON.stringify({ token: this.token, customUrl: this.customUrl, createdAt: Date.now() }, null, 2),
        { encoding: 'utf8', mode: 0o600 }
      );
    } catch {}
  }

  rotateToken() {
    this.token = crypto.randomBytes(32).toString('hex');
    this.pairingPin = null;
    this.failMap.clear();
    this.saveAuth();
    writeLog('INFO', 'MobileRemote: 256-bit pairing token rotated (all old mobile sessions revoked)');
    this.emit('update', this.getState());
    return this.getState();
  }

  createPairingPin() {
    const code = String(crypto.randomInt(100000, 999999));
    this.pairingPin = { code, expiresAt: Date.now() + 3 * 60 * 1000 };
    this.emit('update', this.getState());
    return this.pairingPin;
  }

  setCustomUrl(url) {
    const clean = String(url || '').trim();
    if (!clean) {
      this.customUrl = '';
    } else if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(clean)) {
      this.customUrl = clean.replace(/\/+$/, '');
    }
    this.saveAuth();
    this.emit('update', this.getState());
    return this.getState();
  }

  getActiveBaseUrl() {
    if (this.tunnelUrl) return this.tunnelUrl;
    if (this.customUrl) return this.customUrl;
    const ip = this.lanEnabled ? getLocalLanIp() : '127.0.0.1';
    return `http://${ip}:${MOBILE_PORT}`;
  }

  getState() {
    const baseUrl = this.getActiveBaseUrl();
    const pairLink = this.running ? `${baseUrl}/#pair=${encodeURIComponent(this.token)}` : '';
    const pinActive = this.pairingPin && this.pairingPin.expiresAt > Date.now() ? this.pairingPin : null;
    const qrSvg = this.running && (this.tunnelUrl || this.lanEnabled || this.customUrl)
      ? generateQrSvg(pairLink, 152)
      : '';
    return {
      running: this.running,
      port: MOBILE_PORT,
      lanEnabled: this.lanEnabled,
      lanUrl: `http://${getLocalLanIp()}:${MOBILE_PORT}`,
      tunnelRunning: this.tunnelRunning,
      tunnelUrl: this.tunnelUrl,
      tunnelStatus: this.tunnelStatus,
      customUrl: this.customUrl,
      activeUrl: baseUrl,
      pairLink,
      qrSvg,
      pairingPin: pinActive ? pinActive.code : null,
      pairingPinExpiresAt: pinActive ? pinActive.expiresAt : 0,
      lastClientSeen: this.lastClientSeen,
      tokenPreview: `${this.token.slice(0, 6)}...${this.token.slice(-4)}`,
    };
  }

  getClientIp(req) {
    return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  }

  isLockedOut(ip) {
    const rec = this.failMap.get(ip);
    if (!rec) return false;
    if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
    if (rec.lockedUntil && Date.now() >= rec.lockedUntil) this.failMap.delete(ip);
    return false;
  }

  recordFail(ip) {
    // Prune stale entries & cap map size to prevent memory-exhaustion DoS
    if (this.failMap.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.failMap.entries()) {
        if (!v.lockedUntil || now >= v.lockedUntil) this.failMap.delete(k);
        if (this.failMap.size <= 300) break;
      }
      if (this.failMap.size > 500) this.failMap.clear();
    }
    const rec = this.failMap.get(ip) || { count: 0, lockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= 5) {
      rec.lockedUntil = Date.now() + 5 * 60 * 1000;
      writeLog('WARN', `MobileRemote: Rate-locked IP ${ip} for 5m after repeated auth failures`);
    }
    this.failMap.set(ip, rec);
  }

  getAllowedCorsOrigin(req) {
    const origin = String(req?.headers?.origin || '').trim();
    if (!origin) return null; // Same-origin or non-browser client
    if (origin === 'null') return 'null'; // Bundled Android APK WebView (file:///android_asset/)
    if (this.tunnelUrl && origin === this.tunnelUrl) return origin;
    if (this.customUrl && origin === this.customUrl) return origin;
    if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin)) return origin;
    if (/^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):47822$/i.test(origin)) {
      return origin;
    }
    return false; // Explicitly reject untrusted third-party web origins!
  }

  isAuthorized(req) {
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const headerTok = String(req.headers['x-petfish-mobile-token'] || '');
    return safeEqual(bearer, this.token) || safeEqual(headerTok, this.token);
  }

  readJsonBody(req) {
    return new Promise((resolve) => {
      let body = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) { req.destroy(); return resolve(null); }
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch { resolve(null); }
      });
      req.on('error', () => resolve(null));
    });
  }

  sendJson(res, status, obj, corsOrigin = null) {
    const payload = JSON.stringify(obj);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };
    if (corsOrigin) {
      headers['Access-Control-Allow-Origin'] = corsOrigin;
      headers['Vary'] = 'Origin';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-PetFish-Mobile-Token';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    }
    res.writeHead(status, headers);
    res.end(payload);
  }

  startServer(allowLan = false) {
    return new Promise((resolve) => {
      if (this.server && this.running && this.lanEnabled === Boolean(allowLan)) {
        return resolve(this.getState());
      }
      this.stopServerOnly();
      this.lanEnabled = Boolean(allowLan);
      const bindHost = this.lanEnabled ? '0.0.0.0' : '127.0.0.1';

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          writeLog('ERROR', `MobileRemote request error: ${err.message}`);
          this.sendJson(res, 500, { ok: false, error: 'Internal error' });
        });
      });

      this.server.on('error', (err) => {
        writeLog('WARN', `MobileRemote bind error: ${err.message}`);
        this.running = false;
        this.emit('update', this.getState());
        resolve(this.getState());
      });

      this.server.listen(MOBILE_PORT, bindHost, () => {
        this.running = true;
        if (!this.pairingPin || this.pairingPin.expiresAt <= Date.now()) {
          this.createPairingPin();
        }
        writeLog('INFO', `MobileRemote server listening on ${bindHost}:${MOBILE_PORT}`);
        this.emit('update', this.getState());
        resolve(this.getState());
      });
    });
  }

  stopServerOnly() {
    if (this.server) {
      try { this.server.close(); } catch {}
      this.server = null;
    }
    this.running = false;
  }

  async startWorldwideTunnel() {
    await this.startServer(false);
    if (this.tunnelProc && this.tunnelRunning && this.tunnelUrl) {
      return this.getState();
    }
    this.stopTunnel();
    this.tunnelStatus = 'Starting Cloudflare Tunnel...';
    this.emit('update', this.getState());

    const exe = findCloudflaredExe();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          this.emit('update', this.getState());
          resolve(this.getState());
        }
      };

      try {
        const proc = spawn(exe, ['tunnel', '--url', `http://127.0.0.1:${MOBILE_PORT}`, '--no-autoupdate'], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.tunnelProc = proc;
        this.tunnelRunning = true;

        const parseLine = (chunk) => {
          const text = chunk.toString('utf8');
          const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (m && !this.tunnelUrl) {
            this.tunnelUrl = m[0];
            this.tunnelStatus = 'Live Worldwide (HTTPS)';
            writeLog('INFO', `MobileRemote Cloudflare Tunnel live: ${this.tunnelUrl}`);
            done();
          }
        };

        proc.stdout.on('data', parseLine);
        proc.stderr.on('data', parseLine);
        proc.on('error', (err) => {
          this.tunnelRunning = false;
          this.tunnelUrl = '';
          this.tunnelStatus = `cloudflared not found (${err.message})`;
          writeLog('WARN', `MobileRemote tunnel error: ${err.message}`);
          done();
        });
        proc.on('exit', () => {
          this.tunnelRunning = false;
          this.tunnelUrl = '';
          this.tunnelProc = null;
          if (this.tunnelStatus === 'Live Worldwide (HTTPS)' || this.tunnelStatus.startsWith('Starting')) {
            this.tunnelStatus = 'Stopped';
          }
          this.emit('update', this.getState());
          done();
        });

        setTimeout(() => {
          if (!this.tunnelUrl) {
            this.tunnelStatus = this.tunnelRunning ? 'Connecting (check internet)...' : 'Stopped';
            done();
          }
        }, 12000);
      } catch (err) {
        this.tunnelRunning = false;
        this.tunnelStatus = `Failed: ${err.message}`;
        done();
      }
    });
  }

  stopTunnel() {
    if (this.tunnelProc) {
      try { this.tunnelProc.kill(); } catch {}
      this.tunnelProc = null;
    }
    this.tunnelRunning = false;
    this.tunnelUrl = '';
    this.tunnelStatus = 'Stopped';
    this.emit('update', this.getState());
    return this.getState();
  }

  stopAll() {
    this.stopTunnel();
    this.stopServerOnly();
    this.emit('update', this.getState());
    return this.getState();
  }

  async handleRequest(req, res) {
    const corsOrigin = this.getAllowedCorsOrigin(req);
    if (corsOrigin === false) {
      return this.sendJson(res, 403, { ok: false, error: 'Cross-origin request rejected' });
    }

    if (req.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PetFish-Mobile-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      };
      if (corsOrigin) {
        headers['Access-Control-Allow-Origin'] = corsOrigin;
        headers['Vary'] = 'Origin';
      }
      res.writeHead(204, headers);
      return res.end();
    }

    const urlObj = new URL(req.url || '/', `http://127.0.0.1:${MOBILE_PORT}`);
    const pathname = urlObj.pathname;
    const ip = this.getClientIp(req);

    // 1. Serve Mobile Web Companion App (works in Android APK OR any phone browser worldwide!)
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      try {
        const html = fs.readFileSync(this.webHtmlPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http://127.0.0.1:* http://192.168.*:* http://10.*:*; frame-ancestors 'none'; object-src 'none'; base-uri 'none';",
        });
        return res.end(html);
      } catch {
        return this.sendJson(res, 404, { ok: false, error: 'Mobile UI bundle missing' }, corsOrigin);
      }
    }

    // 2. Minimal health ping (exposes zero private data — lets Mobile APK detect Laptop Online vs Offline!)
    if (req.method === 'GET' && pathname === '/api/mobile/ping') {
      return this.sendJson(res, 200, { ok: true, online: true, app: 'OV', version: '6.0.0', ts: Date.now() }, corsOrigin);
    }

    if (this.isLockedOut(ip)) {
      return this.sendJson(res, 429, { ok: false, error: 'Too many invalid attempts. Locked for 5 minutes.' }, corsOrigin);
    }

    // 3. One-time 6-digit PIN pairing exchange
    if (req.method === 'POST' && pathname === '/api/mobile/pair') {
      const body = await this.readJsonBody(req);
      const pin = String(body?.pin || '').trim();
      if (!this.pairingPin || this.pairingPin.expiresAt <= Date.now() || !safeEqual(pin, this.pairingPin.code)) {
        this.recordFail(ip);
        return this.sendJson(res, 401, { ok: false, error: 'Invalid or expired pairing PIN' }, corsOrigin);
      }
      this.pairingPin = null; // One-time use!
      this.failMap.delete(ip);
      this.lastClientSeen = Date.now();
      writeLog('INFO', `MobileRemote: Paired new mobile device from ${ip}`);
      this.emit('update', this.getState());
      return this.sendJson(res, 200, { ok: true, token: this.token }, corsOrigin);
    }

    // 4. All remaining API routes require valid 256-bit Bearer Token
    if (!this.isAuthorized(req)) {
      this.recordFail(ip);
      return this.sendJson(res, 401, { ok: false, error: 'Unauthorized — pair your phone with OV Desktop first' }, corsOrigin);
    }

    this.lastClientSeen = Date.now();

    if (req.method === 'GET' && pathname === '/api/mobile/state') {
      const st = await this.handlers.getMobileState?.();
      return this.sendJson(res, 200, { ok: true, online: true, data: st || {} }, corsOrigin);
    }

    if (req.method !== 'POST') {
      return this.sendJson(res, 404, { ok: false, error: 'Not found' }, corsOrigin);
    }

    const body = await this.readJsonBody(req);
    if (!body || typeof body !== 'object') return this.sendJson(res, 400, { ok: false, error: 'Invalid JSON' }, corsOrigin);

    if (pathname === '/api/mobile/tasks/add') {
      const data = await this.handlers.addTask?.(String(body.text || '').slice(0, 200));
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/tasks/edit') {
      const data = await this.handlers.editTask?.(String(body.id || '').slice(0, 64), String(body.text || '').slice(0, 200));
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/tasks/toggle') {
      const data = await this.handlers.toggleTask?.(String(body.id || '').slice(0, 64));
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/tasks/delete') {
      const data = await this.handlers.deleteTask?.(String(body.id || '').slice(0, 64));
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/tasks/sync') {
      const data = await this.handlers.syncTasks?.(Array.isArray(body.ops) ? body.ops.slice(0, 40) : []);
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/pet') {
      const data = await this.handlers.controlPet?.(body);
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/approval') {
      const data = await this.handlers.resolveApproval?.(String(body.id || '').slice(0, 64), String(body.decision || ''));
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/ask') {
      const resLlm = await this.handlers.askLLM?.(String(body.prompt || '').slice(0, 1200), { thinkMode: Boolean(body.thinkMode) });
      return this.sendJson(res, 200, { ok: Boolean(resLlm?.ok), result: resLlm }, corsOrigin);
    }
    if (pathname === '/api/mobile/launch') {
      const resApp = await this.handlers.launchApp?.(String(body.target || '').slice(0, 220), { asApp: Boolean(body.asApp) });
      return this.sendJson(res, 200, { ok: Boolean(resApp?.ok), result: resApp }, corsOrigin);
    }
    if (pathname === '/api/mobile/search') {
      const queries = Array.isArray(body.queries) ? body.queries.slice(0, 4).map((q) => String(q || '').slice(0, 140)) : body.query ? [String(body.query).slice(0, 140)] : [];
      const resS = await this.handlers.searchMulti?.(queries);
      return this.sendJson(res, 200, { ok: true, result: resS }, corsOrigin);
    }
    if (pathname === '/api/mobile/timer') {
      const data = await this.handlers.timerAction?.(body);
      return this.sendJson(res, 200, { ok: true, data }, corsOrigin);
    }
    if (pathname === '/api/mobile/sys') {
      const resSys = await this.handlers.sysAction?.(body);
      return this.sendJson(res, 200, { ok: true, result: resSys }, corsOrigin);
    }

    return this.sendJson(res, 404, { ok: false, error: 'Unknown endpoint' }, corsOrigin);
  }
}

module.exports = { MobileRemoteServer, MOBILE_PORT };
