const http = require('http');
const EventEmitter = require('events');
const {
  securityConfig,
  ensureAuthToken,
  verifyTokenConstantTime,
  isAllowedHostHeader,
  SlidingRateLimiter,
  writeLog,
} = require('./security');

const DEFAULT_PORT = securityConfig.hookPort || 47821;
const APPROVAL_TIMEOUT_MS = 120 * 1000;

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    let exceeded = false;
    req.on('data', (chunk) => {
      len += chunk.length;
      if (len > maxBytes) {
        exceeded = true;
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return reject(new Error('Payload too large'));
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({ raw });
      }
    });
    req.on('error', () => resolve({}));
  });
}

function summarizeToolRequest(body = {}) {
  const toolName = String(body.tool_name || body.toolName || 'Tool').slice(0, 64);
  const input = body.tool_input || body.toolInput || {};
  let detail = '';

  if (typeof input === 'string') {
    detail = input;
  } else if (input.command) {
    detail = input.command;
  } else if (input.file_path || input.path) {
    detail = input.file_path || input.path;
  } else if (input.url) {
    detail = input.url;
  } else if (input.pattern) {
    detail = input.pattern;
  } else if (input.description) {
    detail = input.description;
  } else if (Object.keys(input).length > 0) {
    detail = JSON.stringify(input).slice(0, 140);
  }

  return { toolName, detail: String(detail || '').slice(0, 220) };
}

class HookServer extends EventEmitter {
  constructor(port = DEFAULT_PORT, permissionEvaluator = null) {
    super();
    this.port = port;
    this.permissionEvaluator = permissionEvaluator;
    this.server = null;
    this.authToken = ensureAuthToken();
    this.rateLimiter = new SlidingRateLimiter(securityConfig.rateLimitPerMinute || 120);
    this.pendingApprovals = new Map();
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      // 1. Block DNS rebinding via strict Host header check
      if (!isAllowedHostHeader(req.headers.host, this.port)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden host' }));
        return;
      }

      // 2. Block all browser cross-origin requests (anti-CSRF)
      if (securityConfig.rejectCrossOrigin && req.headers.origin) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Cross-origin requests rejected' }));
        return;
      }

      // 3. Rate limiting
      if (!this.rateLimiter.allow()) {
        res.writeHead(429);
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }

      // 4. Minimal unauthenticated health check (no sensitive details exposed)
      if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, app: 'OV', version: '6.0.0', authRequired: true }));
        return;
      }

      // 5. Require 256-bit X-PetFish-Token for ALL mutating/data endpoints
      if (securityConfig.requireAuthToken) {
        const provided = req.headers['x-petfish-token'];
        if (!verifyTokenConstantTime(provided, this.authToken)) {
          writeLog('WARN', `Rejected unauthorized ${req.method} ${req.url}`);
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid X-PetFish-Token' }));
          return;
        }
      }

      let body = {};
      try {
        body = await readBody(req, securityConfig.maxPayloadBytes || 131072);
      } catch {
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/hooks/permission') {
        const { toolName, detail } = summarizeToolRequest(body);
        const id = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const item = {
          id,
          agent: String(body.agentName || 'Claude Code').slice(0, 48),
          agentType: String(body.agentType || 'claude-code').slice(0, 32),
          sessionId: String(body.session_id || body.sessionId || 'default').slice(0, 64),
          cwd: String(body.cwd || '').slice(0, 260),
          toolName,
          title: `${String(body.agentName || 'Claude Code').slice(0, 40)} wants to use ${toolName}`,
          detail: detail || 'Permission requested to continue task',
          createdAt: Date.now(),
          canRespondDirectly: true,
          processHint: String(body.processHint || 'claude').slice(0, 48),
        };

        this.emit('hook-event', {
          hookEvent: 'PermissionRequest',
          sessionId: item.sessionId,
          agentName: item.agent,
          cwd: item.cwd,
          toolName,
          summary: `Waiting to allow ${toolName}: ${detail.slice(0, 60)}`,
        });

        // Consult user's appointed Auto-Pilot rules first (e.g. Auto-Allow Read-Only / Auto-Deny Dangerous)
        if (typeof this.permissionEvaluator === 'function') {
          const autoDecision = this.permissionEvaluator(item);
          if (autoDecision && (autoDecision.decision === 'allow' || autoDecision.decision === 'deny')) {
            res.writeHead(200);
            res.end(JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'PermissionRequest',
                decision:
                  autoDecision.decision === 'allow'
                    ? { behavior: 'allow' }
                    : { behavior: 'deny', message: autoDecision.reason || 'Blocked by PetFish Auto-Pilot' },
              },
            }));
            return;
          }
        }

        let resolved = false;
        const finish = (decision, message) => {
          if (resolved) return;
          resolved = true;
          const entry = this.pendingApprovals.get(id);
          if (entry?.timer) clearTimeout(entry.timer);
          this.pendingApprovals.delete(id);
          this.emit('approvals-update', this.getApprovals());

          try {
            if (decision === 'allow') {
              res.writeHead(200);
              res.end(JSON.stringify({
                hookSpecificOutput: {
                  hookEventName: 'PermissionRequest',
                  decision: { behavior: 'allow' },
                },
              }));
            } else if (decision === 'deny') {
              res.writeHead(200);
              res.end(JSON.stringify({
                hookSpecificOutput: {
                  hookEventName: 'PermissionRequest',
                  decision: {
                    behavior: 'deny',
                    message: message || 'Denied from PetFish',
                  },
                },
              }));
            } else {
              res.writeHead(200);
              res.end(JSON.stringify({}));
            }
          } catch {}
        };

        const timer = setTimeout(() => finish('passthrough'), APPROVAL_TIMEOUT_MS);
        req.on('close', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            this.pendingApprovals.delete(id);
            this.emit('approvals-update', this.getApprovals());
          }
        });

        this.pendingApprovals.set(id, { item, finish, timer });
        this.emit('approval-new', item);
        this.emit('approvals-update', this.getApprovals());
        return;
      }

      if (req.method === 'POST' && req.url === '/api/hooks/event') {
        const hookEvent = String(body.hook_event_name || body.hookEvent || 'Event').slice(0, 48);
        const { toolName, detail } = summarizeToolRequest(body);
        const summary =
          body.message ||
          body.summary ||
          (toolName !== 'Tool' ? `${toolName}${detail ? `: ${detail.slice(0, 65)}` : ''}` : hookEvent);

        this.emit('hook-event', {
          hookEvent,
          sessionId: String(body.session_id || body.sessionId || 'default').slice(0, 64),
          agentName: String(body.agentName || 'Claude Code').slice(0, 48),
          cwd: String(body.cwd || '').slice(0, 260),
          toolName: toolName !== 'Tool' ? toolName : '',
          summary: String(summary).slice(0, 140),
        });

        if (hookEvent === 'Notification' || hookEvent === 'Stop') {
          this.emit('notify', {
            appName: String(body.agentName || 'Claude Code').slice(0, 48),
            title: hookEvent === 'Stop' ? 'Claude Code finished task' : String(body.title || 'Claude Code').slice(0, 96),
            body: String(body.message || summary || 'Waiting for your next instruction').slice(0, 240),
            category: 'agent',
            accent: '#F59E0B',
            processHint: 'claude',
          });
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/agent/status') {
        this.emit('custom-agent', body);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/notify') {
        this.emit('notify', {
          appName: String(body.appName || 'Agent').slice(0, 48),
          title: String(body.title || 'Notification').slice(0, 120),
          body: String(body.body || '').slice(0, 280),
          category: ['whatsapp', 'agent', 'system', 'social'].includes(body.category) ? body.category : 'agent',
          accent: /^#[0-9a-fA-F]{6}$/.test(body.accent || '') ? body.accent : '#FF7426',
          processHint: String(body.processHint || '').slice(0, 48),
        });
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    this.server.on('error', (err) => {
      writeLog('ERROR', `HookServer error: ${err.code || err.message}`);
    });

    this.server.listen(this.port, securityConfig.bindHost || '127.0.0.1', () => {
      writeLog('INFO', `Authenticated HookServer listening on 127.0.0.1:${this.port}`);
    });
  }

  stop() {
    for (const entry of this.pendingApprovals.values()) {
      entry.finish('passthrough');
    }
    this.pendingApprovals.clear();
    if (this.server) {
      try { this.server.close(); } catch {}
      this.server = null;
    }
  }

  addLocalApproval(item) {
    const id = item.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full = {
      id,
      agent: String(item.agent || 'Claude Code').slice(0, 48),
      agentType: String(item.agentType || 'claude-code').slice(0, 32),
      sessionId: String(item.sessionId || 'demo').slice(0, 64),
      cwd: String(item.cwd || '').slice(0, 260),
      toolName: String(item.toolName || 'Bash').slice(0, 64),
      title: String(item.title || 'Agent wants permission to run command').slice(0, 140),
      detail: String(item.detail || 'npm test').slice(0, 240),
      createdAt: Date.now(),
      canRespondDirectly: item.canRespondDirectly !== false,
      isSimulated: Boolean(item.isSimulated),
      processHint: String(item.processHint || 'Antigravity').slice(0, 48),
    };
    this.pendingApprovals.set(id, {
      item: full,
      finish: () => {
        this.pendingApprovals.delete(id);
        this.emit('approvals-update', this.getApprovals());
      },
      timer: null,
    });
    this.emit('approval-new', full);
    this.emit('approvals-update', this.getApprovals());
    return full;
  }

  resolveApproval(id, decision) {
    const entry = this.pendingApprovals.get(id);
    if (!entry) return false;
    const item = entry.item;
    entry.finish(decision);
    this.emit('approval-resolved', { item, decision });
    return true;
  }

  getApprovals() {
    return Array.from(this.pendingApprovals.values())
      .map((v) => v.item)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

module.exports = { HookServer, DEFAULT_PORT };
