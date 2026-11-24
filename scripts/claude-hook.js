#!/usr/bin/env node
/**
 * PetFish <-> Claude Code Authenticated Hook Bridge
 * Reads the user-private 256-bit auth token from %LOCALAPPDATA%\PetFish\.auth-token
 * and forwards Claude Code hook JSON over loopback (127.0.0.1:47821).
 * Exits cleanly with code 0 if PetFish is not running so Claude Code is never blocked.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const hookEvent = process.argv[2] || 'Event';
const PORT = 47821;

function readAuthToken() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const tokenPath = path.join(base, 'PetFish', '.auth-token');
  try {
    return fs.readFileSync(tokenPath, 'utf8').trim();
  } catch {
    return '';
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  const token = readAuthToken();
  if (!token) process.exit(0);

  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  payload.hookEvent = payload.hook_event_name || hookEvent;
  payload.agentName = 'Claude Code';

  const isPermission = hookEvent === 'PermissionRequest';
  const endpoint = isPermission ? '/api/hooks/permission' : '/api/hooks/event';
  const body = JSON.stringify(payload);

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-PetFish-Token': token,
      },
      timeout: isPermission ? 122000 : 2500,
    },
    (res) => {
      let resp = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { resp += c; });
      res.on('end', () => {
        if (isPermission && res.statusCode === 200 && resp.trim()) {
          process.stdout.write(resp.trim());
        }
        process.exit(0);
      });
    }
  );

  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.on('error', () => { process.exit(0); });
  req.write(body);
  req.end();
});
