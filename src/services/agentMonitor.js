const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');
const EventEmitter = require('events');

function readTailUtf8(filePath, maxBytes = 327680) {
  let fd = null;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return '';
    const start = Math.max(0, stat.size - maxBytes);
    const len = stat.size - start;
    const buf = Buffer.alloc(len);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function readHeadUtf8(filePath, maxBytes = 16384) {
  let fd = null;
  try {
    const stat = fs.statSync(filePath);
    const len = Math.min(stat.size, maxBytes);
    if (len === 0) return '';
    const buf = Buffer.alloc(len);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, len, 0);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function parseJsonlLines(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    try { parsed.push(JSON.parse(trimmed)); } catch {}
  }
  return parsed;
}

function unwrapArg(val) {
  if (typeof val !== 'string') return val;
  const t = val.trim();
  if (!t) return '';
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}')) || t === 'true' || t === 'false') {
    try { return JSON.parse(t); } catch {}
  }
  return val;
}

function cleanSnippet(str, maxLen = 120) {
  if (!str) return '';
  const single = String(str)
    .replace(/<USER_REQUEST>/gi, '')
    .replace(/<\/USER_REQUEST>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  return single.length <= maxLen ? single : `${single.slice(0, maxLen - 1)}…`;
}

function formatToolAction(name, rawArgs = {}) {
  const args = rawArgs || {};
  const filePath = unwrapArg(args.Path || args.file_path || args.path || '');
  const base = filePath ? path.basename(String(filePath)) : '';

  if (name === 'write_file' || name === 'Write') return base ? `Writing ${base}` : 'Writing file';
  if (name === 'edit_file' || name === 'Edit') return base ? `Editing ${base}` : 'Editing code';
  if (name === 'read_file' || name === 'Read') return base ? `Reading ${base}` : 'Reading file';
  if (name === 'run_command' || name === 'Bash') {
    const summary = unwrapArg(args.toolSummary || args.description || '');
    const cmd = unwrapArg(args.CommandLine || args.command || '');
    if (summary) return cleanSnippet(summary, 70);
    if (cmd) return `Running ${cleanSnippet(cmd, 56)}`;
    return 'Running terminal command';
  }
  if (name === 'search_web' || name === 'WebSearch') {
    const q = unwrapArg(args.query || '');
    return q ? `Searching: ${cleanSnippet(q, 55)}` : 'Searching web';
  }
  if (name === 'invoke_subagent') {
    const role = unwrapArg(args.Role || args.TypeName || 'Subagent');
    return `Subagent: ${cleanSnippet(role, 46)}`;
  }
  if (name === 'ask_question') return 'Asking for your decision';
  if (name === 'update_focus' || name === 'update_steps') return '';
  return `Tool: ${name}`;
}

function cleanMultilineSnippet(str, maxLen = 480) {
  if (!str) return '';
  const cleaned = String(str)
    .replace(/<USER_REQUEST>/gi, '')
    .replace(/<\/USER_REQUEST>/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1)}…`;
}

function extractPendingQuestionFromRecords(tailRecords = [], ageMs = 0) {
  let pending = null;
  const len = tailRecords.length;

  for (let i = 0; i < len; i++) {
    const rec = tailRecords[i];
    if (!rec || typeof rec !== 'object') continue;

    if (rec.type === 'USER_INPUT' && rec.content) {
      pending = null;
      continue;
    }

    if (rec.type === 'GENERIC') {
      const hasBody = Boolean(String(rec.content || '').trim());
      if (pending && hasBody) {
        pending = null;
      }
      continue;
    }

    if (rec.type !== 'PLANNER_RESPONSE') continue;

    const createdAt = rec.created_at ? (Date.parse(rec.created_at) || Date.now()) : Date.now();
    const stepIndex = Number(rec.step_index) || i + 1;
    const isLastRecord = i === len - 1;
    const tcs = Array.isArray(rec.tool_calls) ? rec.tool_calls : [];

    if (tcs.length > 0) {
      const askCall = tcs.find((tc) => (tc.name || tc.function?.name) === 'ask_question');
      if (askCall) {
        const args = askCall.args || askCall.arguments || {};
        const parsedQs = unwrapArg(args.questions);
        const qArr = Array.isArray(parsedQs) ? parsedQs : [];
        const qTexts = qArr.map((q) => cleanMultilineSnippet(q?.question || '', 320)).filter(Boolean);
        const firstOpts = Array.isArray(qArr[0]?.options)
          ? qArr[0].options.map((o) => cleanSnippet(o, 120)).filter(Boolean).slice(0, 6)
          : [];
        if (qTexts.length > 0) {
          pending = {
            kind: 'question',
            stepIndex,
            toolName: 'ask_question',
            title: 'Antigravity is asking you a question',
            question: cleanMultilineSnippet(qTexts.join('\n\n'), 520),
            options: firstOpts,
            createdAt,
          };
          continue;
        }
      }

      const feedbackCall = tcs.find((tc) => {
        const nm = tc.name || tc.function?.name;
        if (nm !== 'write_file' && nm !== 'edit_file') return false;
        const meta = unwrapArg((tc.args || tc.arguments || {}).ArtifactMetadata);
        return Boolean(meta && meta.RequestFeedback);
      });
      if (feedbackCall) {
        const args = feedbackCall.args || feedbackCall.arguments || {};
        const meta = unwrapArg(args.ArtifactMetadata) || {};
        const fp = unwrapArg(args.Path || '');
        const summary = cleanMultilineSnippet(meta.Summary || (fp ? `Review & approve changes in ${path.basename(String(fp))}` : 'Review & Proceed requested'), 440);
        pending = {
          kind: 'approval',
          stepIndex,
          toolName: feedbackCall.name || 'Artifact',
          title: 'Review & Proceed Requested',
          question: summary,
          options: ['Review & Proceed in Antigravity'],
          createdAt,
        };
        continue;
      }

      // Default-mode permission pause: last transcript entry is an uncompleted mutating/shell tool call waiting >= 1.5s
      if (isLastRecord && ageMs >= 1500 && ageMs < 15 * 60 * 1000) {
        const permCall = tcs.find((tc) => ['run_command', 'write_file', 'edit_file'].includes(tc.name || tc.function?.name));
        if (permCall) {
          const nm = permCall.name || permCall.function?.name;
          const args = permCall.args || permCall.arguments || {};
          const detail =
            unwrapArg(args.CommandLine) ||
            unwrapArg(args.toolSummary) ||
            unwrapArg(args.Path) ||
            `Approve ${nm}`;
          pending = {
            kind: 'approval',
            stepIndex,
            toolName: nm,
            title: nm === 'run_command' ? 'Command Permission Requested' : `File Edit Permission (${nm})`,
            question: cleanMultilineSnippet(String(detail), 440),
            options: ['Allow / Review in Antigravity'],
            createdAt,
          };
          continue;
        }
      }
      continue;
    }

    // Plain-text PLANNER_RESPONSE with no tool calls asking the user a question
    const textBody = cleanMultilineSnippet(rec.content || '', 1200);
    if (textBody && (/\?\s*$/.test(textBody) || /\b(confirm|approve|proceed|choose|which option|let me know|would you like|do you want|ready for me to)\b/i.test(textBody))) {
      const paras = textBody.split(/\n+/).map((p) => p.trim()).filter(Boolean);
      const qPara = [...paras].reverse().find((p) => /\?/.test(p)) || paras[paras.length - 1] || textBody;
      pending = {
        kind: 'input',
        stepIndex,
        toolName: 'Reply Needed',
        title: 'Antigravity asked a question',
        question: cleanMultilineSnippet(qPara, 460),
        options: [],
        createdAt,
      };
    } else {
      pending = null;
    }
  }

  return pending;
}

function summarizeAntigravityBrain() {
  const brainRoot = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  if (!fs.existsSync(brainRoot)) return [];

  let entries = [];
  try {
    entries = fs.readdirSync(brainRoot).map((id) => {
      const dir = path.join(brainRoot, id);
      const transcript = path.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
      try {
        if (!fs.statSync(dir).isDirectory()) return null;
        const st = fs.existsSync(transcript) ? fs.statSync(transcript) : fs.statSync(dir);
        return { id, dir, transcript, mtimeMs: st.mtimeMs };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const now = Date.now();
  const candidates = entries.filter((e, idx) => idx < 2 || now - e.mtimeMs < 6 * 3600 * 1000).slice(0, 3);

  const sessions = [];
  for (const item of candidates) {
    if (!fs.existsSync(item.transcript)) continue;

    const headRecords = parseJsonlLines(readHeadUtf8(item.transcript, 16384));
    const tailRecords = parseJsonlLines(readTailUtf8(item.transcript, 327680));

    let startedAt = item.mtimeMs;
    if (headRecords[0]?.created_at) {
      const parsedTs = Date.parse(headRecords[0].created_at);
      if (Number.isFinite(parsedTs)) startedAt = parsedTs;
    }

    let assignedTask = '';
    for (const rec of headRecords) {
      if (rec.type === 'USER_INPUT' && rec.content) {
        assignedTask = cleanSnippet(rec.content, 120);
        break;
      }
    }

    let turnStartedAt = startedAt;
    let currentFocus = '';
    let steps = [];
    let lastToolName = '';
    let lastToolBrief = '';
    let lastStepType = '';
    let pendingFeedback = false;
    const subagents = [];
    const recentActions = [];
    const touchedFiles = new Set();

    for (const rec of tailRecords) {
      if (rec.type === 'USER_INPUT' && rec.content) {
        const prompt = cleanSnippet(rec.content, 120);
        if (prompt) assignedTask = prompt;
        if (rec.created_at) {
          const ts = Date.parse(rec.created_at);
          if (Number.isFinite(ts)) turnStartedAt = ts;
        }
        pendingFeedback = false;
      }
      if (Array.isArray(rec.tool_calls)) {
        for (const tc of rec.tool_calls) {
          const name = tc.name || tc.function?.name || '';
          const args = tc.args || tc.arguments || {};

          if (name === 'update_focus') {
            const focus = unwrapArg(args.focus);
            if (focus) currentFocus = cleanSnippet(focus, 105);
          } else if (name === 'update_steps') {
            const rawSteps = unwrapArg(args.steps);
            if (Array.isArray(rawSteps)) {
              steps = rawSteps.map((s) => ({
                title: cleanSnippet(s.title, 64),
                status: s.status || 'pending',
              }));
            }
          } else if (name === 'invoke_subagent') {
            const typeName = unwrapArg(args.TypeName || 'subagent');
            const role = unwrapArg(args.Role || typeName);
            const prompt = unwrapArg(args.Prompt || '');
            subagents.push({ type: String(typeName), role: cleanSnippet(role, 42), brief: cleanSnippet(prompt, 70) });
          } else if (name === 'ask_question') {
            pendingFeedback = true;
          } else if (name === 'write_file' || name === 'edit_file') {
            const meta = unwrapArg(args.ArtifactMetadata);
            if (meta && meta.RequestFeedback) pendingFeedback = true;
            const fp = unwrapArg(args.Path);
            if (fp) touchedFiles.add(path.basename(String(fp)));
          }

          const actionDesc = formatToolAction(name, args);
          if (actionDesc) {
            lastToolName = name;
            lastToolBrief = actionDesc;
            if (recentActions[recentActions.length - 1] !== actionDesc) {
              recentActions.push(actionDesc);
            }
          }
        }
      }
      if (rec.type) lastStepType = rec.type;
    }

    const ageMs = now - item.mtimeMs;
    const pendingQuestion = extractPendingQuestionFromRecords(tailRecords, ageMs);
    const isActive = ageMs < 60 * 1000;
    let status = 'idle';
    if (pendingQuestion) status = 'waiting_approval';
    else if (isActive) status = pendingFeedback ? 'waiting_approval' : 'running';
    else if (ageMs < 20 * 60 * 1000) {
      if (lastStepType === 'PLANNER_RESPONSE' && pendingFeedback) status = 'waiting_approval';
      else if (lastStepType === 'PLANNER_RESPONSE') status = 'waiting_input';
      else status = 'running';
    }

    const activeStep = steps.find((s) => s.status === 'in_progress');
    const doneSteps = steps.filter((s) => s.status === 'done').length;
    const what = pendingQuestion
      ? cleanSnippet(pendingQuestion.question, 160)
      : (currentFocus || (activeStep ? activeStep.title : '') || lastToolBrief || 'Ready for next task');

    const howParts = [];
    if (lastToolBrief) howParts.push(lastToolBrief);
    if (touchedFiles.size > 0) howParts.push(`Files: ${Array.from(touchedFiles).slice(-3).join(', ')}`);
    if (subagents.length > 0) howParts.push(`Subagents: ${subagents.slice(-2).map((s) => s.role).join(', ')}`);
    const how = howParts.join(' · ') || 'Direct workspace reasoning';

    sessions.push({
      id: `ag-${item.id.slice(0, 8)}`,
      agentType: 'antigravity',
      name: 'Antigravity',
      badge: 'AGY',
      accent: '#38BDF8',
      status,
      what,
      how,
      why: assignedTask || 'Active Antigravity coding session',
      task: what,
      assignedTask: assignedTask || 'Antigravity coding session',
      stepsProgress: steps.length > 0 ? { done: doneSteps, total: steps.length, current: activeStep?.title || '' } : null,
      recentActions: recentActions.slice(-3).reverse(),
      subagents: subagents.slice(-2),
      lastTool: lastToolName,
      startedAt,
      turnStartedAt,
      updatedAt: item.mtimeMs,
      processHint: 'Antigravity',
      sessionId: item.id,
      pendingQuestion,
    });
  }

  return sessions;
}

function findClaudeTranscript(sessionId) {
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsRoot)) return null;
  try {
    for (const d of fs.readdirSync(projectsRoot)) {
      const candidate = path.join(projectsRoot, d, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}
  return null;
}

function summarizeClaudeSessions(livePids, hookStates) {
  const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
  const results = [];
  const seenSessionIds = new Set();

  if (fs.existsSync(sessionsDir)) {
    let files = [];
    try { files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json')); } catch {}

    for (const f of files) {
      const full = path.join(sessionsDir, f);
      try {
        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
        const pid = Number(data.pid);
        const isAlive = pid && livePids.has(pid);
        const sid = data.sessionId || f.replace('.json', '');
        const st = fs.statSync(full);
        if (!isAlive && Date.now() - st.mtimeMs > 30 * 60 * 1000) continue;
        seenSessionIds.add(sid);

        const hookState = hookStates.get(sid);
        let assignedTask = '';
        let lastTool = hookState?.lastTool || '';
        let updatedAt = hookState?.updatedAt || st.mtimeMs;
        const recentActions = [];

        const transcript = findClaudeTranscript(sid);
        if (transcript) {
          const tst = fs.statSync(transcript);
          if (tst.mtimeMs > updatedAt) updatedAt = tst.mtimeMs;
          const tail = parseJsonlLines(readTailUtf8(transcript, 49152));
          for (const rec of tail) {
            if (rec.type === 'user' && rec.message?.content) {
              const c = rec.message.content;
              if (typeof c === 'string') assignedTask = cleanSnippet(c, 115);
              else if (Array.isArray(c)) {
                const tp = c.find((p) => p.type === 'text' && p.text);
                if (tp) assignedTask = cleanSnippet(tp.text, 115);
              }
            }
            if (rec.type === 'assistant' && Array.isArray(rec.message?.content)) {
              for (const part of rec.message.content) {
                if (part.type === 'tool_use' && part.name) {
                  lastTool = part.name;
                  const act = formatToolAction(part.name, part.input);
                  if (act) recentActions.push(act);
                }
              }
            }
          }
        }

        const folderName = data.cwd ? path.basename(data.cwd) : 'Workspace';
        let status = isAlive ? 'running' : 'idle';
        if (hookState?.status) status = hookState.status;
        else if (isAlive && Date.now() - updatedAt > 90 * 1000) status = 'waiting_input';

        const what = hookState?.task || recentActions[recentActions.length - 1] || `Active in ${folderName}`;
        const how = lastTool ? `Using ${lastTool} via Claude Code CLI in ${folderName}` : `CLI session in ${folderName}`;

        results.push({
          id: `claude-${sid.slice(0, 8)}`,
          agentType: 'claude-code',
          name: 'Claude Code',
          badge: 'CLAUDE',
          accent: '#F59E0B',
          status,
          what,
          how,
          why: assignedTask || `Coding task inside ${folderName}`,
          task: what,
          assignedTask: assignedTask || `Workspace: ${folderName}`,
          recentActions: recentActions.slice(-3).reverse(),
          subagents: [],
          lastTool,
          startedAt: data.startedAt || st.birthtimeMs || updatedAt,
          turnStartedAt: data.startedAt || updatedAt,
          updatedAt,
          processHint: 'claude',
          sessionId: sid,
        });
      } catch {}
    }
  }

  for (const [sid, h] of hookStates.entries()) {
    if (seenSessionIds.has(sid) || Date.now() - h.updatedAt > 20 * 60 * 1000) continue;
    const what = h.task || 'Live hook session';
    results.push({
      id: `claude-hook-${sid.slice(0, 8)}`,
      agentType: 'claude-code',
      name: h.agentName || 'Claude Code',
      badge: 'CLAUDE',
      accent: '#F59E0B',
      status: h.status || 'running',
      what,
      how: h.lastTool ? `Hook tool: ${h.lastTool}` : 'Real-time Claude hook bridge',
      why: h.cwd ? `Working in ${path.basename(h.cwd)}` : 'Hook-connected coding session',
      task: what,
      assignedTask: h.cwd ? `Workspace: ${path.basename(h.cwd)}` : 'Claude session',
      recentActions: h.recentActions || [],
      subagents: [],
      lastTool: h.lastTool || '',
      startedAt: h.startedAt || h.updatedAt,
      turnStartedAt: h.startedAt || h.updatedAt,
      updatedAt: h.updatedAt,
      processHint: 'claude',
      sessionId: sid,
    });
  }

  return results;
}

function queryOllamaPs() {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/ps', method: 'GET', timeout: 800 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve((JSON.parse(data).models || [])); } catch { resolve([]); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.on('error', () => resolve([]));
    req.end();
  });
}

function scanProcessesFast() {
  return new Promise((resolve) => {
    execFile(
      'tasklist.exe',
      ['/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 2500, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const procs = [];
        const targetRegex = /^(antigravity|claude|codex|cursor|windsurf|aider|opencode|gemini|goose|kiro|trae|zed|ollama|lm studio|jan|language_server)/i;
        for (const line of stdout.split(/\r?\n/)) {
          if (!line.startsWith('"')) continue;
          const m = line.match(/^"([^"]+)","(\d+)"/);
          if (!m) continue;
          const name = m[1].replace(/\.exe$/i, '');
          if (targetRegex.test(name)) procs.push({ ProcessName: name, Id: Number(m[2]) });
        }
        resolve(procs);
      }
    );
  });
}

class AgentMonitor extends EventEmitter {
  constructor() {
    super();
    this.agents = [];
    this.hookStates = new Map();
    this.customAgents = new Map();
    this.firstSeenMap = new Map();
    this.dynamicWatchHints = [];
    this.pollTimer = null;
    this.isPolling = false;
  }

  getFirstSeen(key) {
    if (!this.firstSeenMap.has(key)) this.firstSeenMap.set(key, Date.now());
    return this.firstSeenMap.get(key);
  }

  start() {
    this.poll().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {});
    }, 4000);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  registerDiscoveredAgent(entry) {
    if (!entry || !entry.name) return;
    if (!this.dynamicWatchHints.some((d) => d.name.toLowerCase() === entry.name.toLowerCase())) {
      this.dynamicWatchHints.push({ name: entry.name, hint: entry.processHint || entry.name });
    }
    this.poll().catch(() => {});
  }

  updateFromHook(event) {
    const sid = event.sessionId || event.session_id || 'default';
    const existing = this.hookStates.get(sid) || { startedAt: Date.now(), recentActions: [] };
    const statusMap = {
      PermissionRequest: 'waiting_approval',
      PreToolUse: 'running',
      PostToolUse: 'running',
      Notification: 'waiting_input',
      Stop: 'waiting_input',
    };
    const nextActions = [...(existing.recentActions || [])];
    if (event.summary && nextActions[0] !== event.summary) {
      nextActions.unshift(cleanSnippet(event.summary, 75));
      if (nextActions.length > 3) nextActions.length = 3;
    }
    this.hookStates.set(sid, {
      ...existing,
      agentName: event.agentName || 'Claude Code',
      cwd: event.cwd || existing.cwd || '',
      lastTool: event.toolName || event.tool_name || existing.lastTool || '',
      task: event.summary || event.task || existing.task || '',
      recentActions: nextActions,
      status: statusMap[event.hookEvent] || event.status || existing.status || 'running',
      updatedAt: Date.now(),
    });
    this.poll().catch(() => {});
  }

  upsertCustomAgent(payload) {
    const id = String(payload.id || `custom-${payload.name || 'agent'}`).slice(0, 48);
    const prev = this.customAgents.get(id);
    const what = cleanSnippet(payload.what || payload.task || 'Working on task', 100);
    const why = cleanSnippet(payload.why || payload.goal || payload.assignedTask || 'Assigned agent workflow', 110);
    const how = cleanSnippet(payload.how || (payload.lastTool ? `Using ${payload.lastTool}` : 'Local API connected'), 95);
    this.customAgents.set(id, {
      id,
      agentType: String(payload.agentType || 'custom').slice(0, 32),
      name: String(payload.name || 'AI Agent').slice(0, 48),
      badge: String(payload.badge || 'AGENT').toUpperCase().slice(0, 7),
      accent: /^#[0-9a-fA-F]{6}$/.test(payload.accent || '') ? payload.accent : '#A78BFA',
      status: ['running', 'waiting_approval', 'waiting_input', 'idle'].includes(payload.status) ? payload.status : 'running',
      what,
      how,
      why,
      task: what,
      assignedTask: why,
      recentActions: [],
      subagents: [],
      lastTool: String(payload.lastTool || '').slice(0, 40),
      startedAt: prev?.startedAt || Date.now(),
      turnStartedAt: prev?.turnStartedAt || Date.now(),
      updatedAt: Date.now(),
      processHint: String(payload.processHint || payload.name || '').slice(0, 48),
    });
    this.poll().catch(() => {});
  }

  getAgents() {
    return this.agents;
  }

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const [procs, ollamaRunning] = await Promise.all([scanProcessesFast(), queryOllamaPs()]);
      const livePids = new Set(procs.map((p) => Number(p.Id)));
      const list = [];

      // 1. Antigravity
      const agProcs = procs.filter((p) => /^antigravity$/i.test(p.ProcessName));
      const langSrv = procs.filter((p) => /^language_server/i.test(p.ProcessName));
      const agSessions = summarizeAntigravityBrain();
      if (agSessions.length > 0) {
        for (const s of agSessions) {
          s.processRunning = agProcs.length > 0 || langSrv.length > 0;
          if (!s.processRunning && s.status === 'running') s.status = 'idle';
          list.push(s);
        }
      } else if (agProcs.length > 0) {
        list.push({
          id: 'ag-proc',
          agentType: 'antigravity',
          name: 'Antigravity',
          badge: 'AGY',
          accent: '#38BDF8',
          status: 'running',
          what: `${agProcs.length} active IDE processes`,
          how: 'Desktop workspace & language server',
          why: 'Antigravity AI development session',
          task: `${agProcs.length} active processes`,
          assignedTask: 'Antigravity IDE',
          recentActions: [],
          subagents: [],
          startedAt: Date.now(),
          turnStartedAt: Date.now(),
          updatedAt: Date.now(),
          processHint: 'Antigravity',
        });
      }

      // 2. Claude Code
      const claudeProcs = procs.filter((p) => /^claude/i.test(p.ProcessName));
      const claudeSessions = summarizeClaudeSessions(livePids, this.hookStates);
      if (claudeSessions.length > 0) list.push(...claudeSessions);
      else if (claudeProcs.length > 0) {
        list.push({
          id: `claude-proc-${claudeProcs[0].Id}`,
          agentType: 'claude-code',
          name: 'Claude Code',
          badge: 'CLAUDE',
          accent: '#F59E0B',
          status: 'running',
          what: `CLI running (PID ${claudeProcs[0].Id})`,
          how: 'Claude Code local CLI + hook bridge',
          why: 'Interactive coding assistant',
          task: `CLI running (PID ${claudeProcs[0].Id})`,
          assignedTask: 'Claude Code CLI',
          recentActions: [],
          subagents: [],
          startedAt: Date.now(),
          turnStartedAt: Date.now(),
          updatedAt: Date.now(),
          processHint: 'claude',
        });
      }

      // 3. Live Ollama Local LLM Runtime (shows loaded models in VRAM!)
      const ollamaProcs = procs.filter((p) => /^ollama/i.test(p.ProcessName));
      if (ollamaRunning.length > 0) {
        const names = ollamaRunning.map((m) => m.name).join(', ');
        const vramGB = ollamaRunning.reduce((s, m) => s + (m.size_vram || 0), 0) / (1024 ** 3);
        const seen = this.getFirstSeen('ollama-live');
        list.push({
          id: 'ollama-live',
          agentType: 'ollama',
          name: 'Ollama Local LLM',
          badge: 'LLM',
          accent: '#22D3EE',
          status: 'running',
          priority: 2,
          what: `Serving ${names}`,
          how: `Local loopback 127.0.0.1:11434 (${vramGB.toFixed(1)} GB VRAM)`,
          why: 'Powering local AI inference & PetFish Brain',
          task: `Serving ${names}`,
          assignedTask: 'Local LLM Inference',
          recentActions: [],
          subagents: [],
          startedAt: seen,
          turnStartedAt: seen,
          updatedAt: Date.now(),
          processHint: 'ollama',
        });
      } else if (ollamaProcs.length > 0) {
        const seen = this.getFirstSeen('ollama-idle');
        list.push({
          id: 'ollama-idle',
          agentType: 'ollama',
          name: 'Ollama Engine',
          badge: 'LLM',
          accent: '#22D3EE',
          status: 'idle',
          priority: 2,
          what: 'Ready on 127.0.0.1:11434 (0 GB VRAM loaded)',
          how: 'Auto-loads qwen3.5:2b on demand',
          why: 'Local private LLM runtime for PetFish & agents',
          task: 'Ready on :11434',
          assignedTask: 'Local LLM Server',
          recentActions: [],
          subagents: [],
          startedAt: seen,
          turnStartedAt: seen,
          updatedAt: Date.now(),
          processHint: 'ollama',
        });
      }

      // 4. Universal Auto-Connect AI Agents & IDEs
      const universalDefs = [
        { regex: /^codex/i, id: 'codex', name: 'Codex', badge: 'CODEX', accent: '#34D399', hint: 'codex' },
        { regex: /^cursor/i, id: 'cursor', name: 'Cursor', badge: 'CURSOR', accent: '#A78BFA', hint: 'Cursor' },
        { regex: /^windsurf/i, id: 'windsurf', name: 'Windsurf', badge: 'SURF', accent: '#2DD4BF', hint: 'Windsurf' },
        { regex: /^lm studio/i, id: 'lmstudio', name: 'LM Studio', badge: 'LMS', accent: '#818CF8', hint: 'LM Studio' },
        { regex: /^aider/i, id: 'aider', name: 'Aider', badge: 'AIDER', accent: '#F472B6', hint: 'aider' },
        { regex: /^opencode/i, id: 'opencode', name: 'OpenCode', badge: 'OPEN', accent: '#60A5FA', hint: 'opencode' },
        { regex: /^gemini$/i, id: 'gemini-cli', name: 'Gemini CLI', badge: 'GEMINI', accent: '#60A5FA', hint: 'gemini' },
        { regex: /^goose/i, id: 'goose', name: 'Goose Agent', badge: 'GOOSE', accent: '#FBBF24', hint: 'goose' },
        { regex: /^kiro/i, id: 'kiro', name: 'Kiro IDE', badge: 'KIRO', accent: '#C084FC', hint: 'Kiro' },
        { regex: /^trae/i, id: 'trae', name: 'Trae IDE', badge: 'TRAE', accent: '#FB7185', hint: 'Trae' },
        { regex: /^zed/i, id: 'zed', name: 'Zed AI', badge: 'ZED', accent: '#38BDF8', hint: 'Zed' },
        { regex: /^jan$/i, id: 'jan', name: 'Jan AI', badge: 'JAN', accent: '#34D399', hint: 'Jan' },
      ];

      for (const def of universalDefs) {
        const matched = procs.filter((p) => def.regex.test(p.ProcessName));
        if (matched.length > 0) {
          const isServiceOnly = matched.every((p) => /service|sandbox/i.test(p.ProcessName));
          const what = isServiceOnly ? 'Background sandbox service ready' : `${matched.length} active process(es)`;
          const seen = this.getFirstSeen(`${def.id}-${matched[0].Id}`);
          list.push({
            id: `${def.id}-${matched[0].Id}`,
            agentType: def.id,
            name: def.name,
            badge: def.badge,
            accent: def.accent,
            status: isServiceOnly ? 'idle' : 'running',
            priority: def.id === 'lmstudio' ? 2 : 1,
            what,
            how: `Auto-connected local process (PID ${matched[0].Id})`,
            why: isServiceOnly ? 'Isolated sandbox runtime for agent tasks' : `${def.name} active coding workflow`,
            task: what,
            assignedTask: isServiceOnly ? 'Local sandbox runtime' : `${def.name} session`,
            recentActions: [],
            subagents: [],
            startedAt: seen,
            turnStartedAt: seen,
            updatedAt: Date.now(),
            processHint: def.hint,
          });
        }
      }

      // 5. Custom API-reported agents
      const now = Date.now();
      for (const [id, agent] of this.customAgents.entries()) {
        if (now - agent.updatedAt > 15 * 60 * 1000) {
          this.customAgents.delete(id);
          continue;
        }
        list.push(agent);
      }

      const rank = { waiting_approval: 0, running: 1, waiting_input: 2, idle: 3 };
      list.sort((a, b) => {
        const ra = rank[a.status] ?? 4;
        const rb = rank[b.status] ?? 4;
        if (ra !== rb) return ra - rb;
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pa !== pb) return pa - pb;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      this.agents = list;
      this.emit('update', this.agents);
    } catch {
      // Non-fatal
    } finally {
      this.isPolling = false;
    }
  }
}

module.exports = { AgentMonitor, extractPendingQuestionFromRecords };
