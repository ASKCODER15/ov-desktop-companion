const http = require('http');
const fs = require('fs');
const path = require('path');
const { getPrivateDataDir } = require('./security');

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const LMSTUDIO_HOST = '127.0.0.1';
const LMSTUDIO_PORT = 1234;

// Preferred lightweight, ultra-fast models (keeps laptop snappy & low RAM/VRAM!)
const PREFERRED_MODEL_ORDER = [
  'qwen3.5:2b',
  'qwen2.5:3b',
  'llama3.2:3b',
  'qwen2.5:7b',
  'qwen3.5:9b',
  'gemma4:12b',
];

function httpJson({ host, port, path, method = 'GET', body = null, timeout = 3500 }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: host,
        port,
        path,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 120)}`));
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

class LocalLLMBrain {
  constructor() {
    this.models = []; // { id, label, provider: 'ollama' | 'lmstudio', sizeGB }
    this.selectedModel = null; // 'ollama::qwen3.5:2b'
    this.historyFile = path.join(getPrivateDataDir(), 'chat-history.json');
    this.history = []; // { role, content, thinking, action, ts }
    this.isThinking = false;
    this.thinkMode = false; // Fast vs Deep Thinking Model!
    this.loadHistory();
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const d = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        if (Array.isArray(d)) this.history = d.slice(-24);
      }
    } catch {}
  }

  saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history.slice(-24), null, 2), 'utf8');
    } catch {}
  }

  setThinkMode(enabled) {
    this.thinkMode = Boolean(enabled);
    return this.getState();
  }

  async discoverModels() {
    const found = [];

    // 1. Discover Ollama local models (127.0.0.1:11434)
    try {
      const res = await httpJson({ host: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/tags', timeout: 1800 });
      for (const m of res.models || []) {
        if (!m.name || /embed/i.test(m.name)) continue;
        const sizeGB = m.size ? +(m.size / (1024 ** 3)).toFixed(1) : null;
        found.push({
          id: `ollama::${m.name}`,
          rawName: m.name,
          label: `${m.name}${sizeGB ? ` (${sizeGB}GB)` : ''}`,
          provider: 'ollama',
          sizeGB,
        });
      }
    } catch {}

    // 2. Discover LM Studio local models (127.0.0.1:1234)
    try {
      const res = await httpJson({ host: LMSTUDIO_HOST, port: LMSTUDIO_PORT, path: '/v1/models', timeout: 1500 });
      for (const m of res.data || []) {
        if (!m.id || /embed/i.test(m.id)) continue;
        found.push({
          id: `lmstudio::${m.id}`,
          rawName: m.id,
          label: `${m.id} (LM Studio)`,
          provider: 'lmstudio',
          sizeGB: null,
        });
      }
    } catch {}

    this.models = found;

    // Auto-select the fastest recommended local model (qwen3.5:2b first!)
    if (!this.selectedModel || !found.some((m) => m.id === this.selectedModel)) {
      let pick = null;
      for (const pref of PREFERRED_MODEL_ORDER) {
        pick = found.find((m) => m.provider === 'ollama' && m.rawName.toLowerCase() === pref);
        if (pick) break;
      }
      if (!pick) pick = found.find((m) => m.provider === 'ollama') || found[0] || null;
      this.selectedModel = pick ? pick.id : null;
    }

    return this.getState();
  }

  async getRunningOllamaModels() {
    try {
      const res = await httpJson({ host: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/ps', timeout: 1200 });
      return (res.models || []).map((m) => ({
        name: m.name,
        vramGB: m.size_vram ? +(m.size_vram / (1024 ** 3)).toFixed(1) : 0,
      }));
    } catch {
      return [];
    }
  }

  setSelectedModel(modelId) {
    if (this.models.some((m) => m.id === modelId)) {
      this.selectedModel = modelId;
    }
    return this.getState();
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    return this.getState();
  }

  getState() {
    const active = this.models.find((m) => m.id === this.selectedModel) || null;
    return {
      models: this.models,
      selectedModel: this.selectedModel,
      activeLabel: active ? active.rawName : 'Offline',
      provider: active ? active.provider : null,
      isThinking: this.isThinking,
      thinkMode: this.thinkMode,
      history: this.history.slice(-20),
    };
  }

  /**
   * Parses an optional structured action tag emitted by the local LLM:
   * Supports both [[ACTION:{"type":"open_app","target":"spotify"}]] and single-bracket [ACTION:{...}]!
   */
  extractAction(text) {
    const raw = String(text || '');
    const m = raw.match(/\[{1,2}\s*ACTION\s*:\s*(\{[\s\S]*?\})\s*\]{1,2}/i);
    if (!m) return { cleanText: raw.trim(), action: null };
    let action = null;
    try {
      action = JSON.parse(m[1]);
    } catch {}
    const cleanText = raw.replace(m[0], '').replace(/[\s,:-]+$/, '').trim();
    return { cleanText, action };
  }

  async ask(userMessage, liveContext = {}) {
    const text = String(userMessage || '').trim().slice(0, 600);
    if (!text) return { ok: false, reply: 'Ask me anything!' };

    if (this.models.length === 0) {
      await this.discoverModels();
    }

    const active = this.models.find((m) => m.id === this.selectedModel);
    if (!active) {
      return {
        ok: false,
        reply: 'No local LLM server responded (checked Ollama :11434 & LM Studio :1234). Start Ollama and retry!',
      };
    }

    this.isThinking = true;
    this.history.push({ role: 'user', content: text, ts: Date.now() });
    if (this.history.length > 20) this.history = this.history.slice(-20);

    const agentSummary = (liveContext.agents || [])
      .slice(0, 4)
      .map((a) => `${a.name} (${a.status}): NOW="${a.task || ''}" | WHY="${a.assignedTask || ''}"`)
      .join('\n');

    const sys = liveContext.sys || {};
    const btConnected = (sys.bluetoothDevices || []).filter((d) => d.connected).map((d) => d.name).join(', ') || 'None';
    const music = liveContext.music || {};
    const taskList = (liveContext.tasks || [])
      .slice(0, 8)
      .map((t) => `[${t.done ? 'x' : ' '}] ${t.text}`)
      .join(' | ');

    const { normalizeCharacterId, DEFAULT_CHAR_NAMES } = require('./security');
    const charKey = normalizeCharacterId(liveContext.petCharacter) || 'vesper';
    const customName = liveContext.petName || DEFAULT_CHAR_NAMES[charKey] || 'OV';
    const ageGroup = liveContext.ageGroup || '15-30';
    const personaMap = {
      vesper: `${customName} (agile, witty, encouraging acrobat companion)`,
      vector: `${customName} (sharp, confident, high-tech aero-mech companion)`,
      core: `${customName} (calm, articulate, precision holographic AI strategist)`,
      coral: `${customName} (warm, cheerful, bright reef companion)`,
    };
    const ageTone =
      ageGroup === '0-15'
        ? 'Use fun, clear, encouraging explanations suitable for young learners.'
        : ageGroup === '30-60'
          ? 'Keep tone crisp, executive, calm, and high-signal.'
          : 'Keep tone sharp, aesthetic, relatable for a student & AI engineer (match English or Hinglish naturally).';

    const systemPrompt = `You are OV embodying ${personaMap[charKey] || personaMap.vesper}, an unrestricted local AI brain and desktop companion running directly on the user's laptop.

IMPORTANT — FULL GENERAL INTELLIGENCE:
- Answer ANY question on ANY topic — coding, math, DSA, science, history, career, casual chat, off-topic questions, or brainstorming — with full depth! NEVER refuse off-topic questions.
- ${ageTone}

Live PC Context (use when relevant):
- Active Agents:
${agentSummary || 'None running'}
- Appointed Tasks: ${taskList || 'None'}
- Music Playing: ${music.isPlaying ? `${music.title || 'Playing'}${music.artist ? ` — ${music.artist}` : ''} (${music.source})` : 'Paused/None'}
- System Controls: Wi-Fi=${sys.wifiOn ? `ON (${sys.connectedSsid || 'not connected'})` : 'OFF'} | Bluetooth=${sys.bluetoothOn ? `ON (Connected: ${btConnected})` : 'OFF'} | FlightMode=${sys.flightMode ? 'ON' : 'OFF'}
- Unread Notifications: ${liveContext.unreadCount || 0} (WhatsApp: ${liveContext.waCount || 0}) | Pending Approvals: ${liveContext.approvalCount || 0}

Desktop Actions (ONLY append ONE single action tag at the very end IF the user asks for an action, reminder, or search):
- Open ANY installed app (brave, spotify, youtube, reddit, whatsapp, vscode, terminal, cmd, powershell, gitbash, antigravity, cursor, discord, claude, chatgpt, wispr, notepad, calculator, settings, explorer, etc.): [[ACTION:{"type":"open_app","target":"powershell"}]]
- Open ANY website in Brave (set "asApp":true for standalone desktop app window): [[ACTION:{"type":"open_url","url":"https://instagram.com","asApp":false}]]
- Search the web in Brave (1 or multiple topics): [[ACTION:{"type":"search_multi","queries":["topic 1","topic 2"]}]]
- Search YouTube / Reddit in Brave: [[ACTION:{"type":"search_youtube","query":"..."}]] or [[ACTION:{"type":"search_reddit","query":"..."}]]
- Remind user & add to-do ("remind me in 10 min to ..."): [[ACTION:{"type":"add_reminder","text":"...","minutes":10}]]
- Add task: [[ACTION:{"type":"add_task","text":"..."}]]
- Start sprint timer: [[ACTION:{"type":"start_timer","minutes":25,"label":"Study Sprint"}]]
- Music control (playPause, next, prev): [[ACTION:{"type":"media","command":"playPause"}]]
- Wi-Fi / Bluetooth / Flight / Mute: [[ACTION:{"type":"wifi","enable":true}]] | [[ACTION:{"type":"bluetooth","enable":true}]] | [[ACTION:{"type":"flight_mode","enable":true}]] | [[ACTION:{"type":"mute"}]]
- Control pet (swim, fast, slow, stay, follow) or Dance: [[ACTION:{"type":"pet_mode","mode":"stay"}]] | [[ACTION:{"type":"pet_dance"}]]
- Switch character & theme (vesper, vector, core, coral): [[ACTION:{"type":"pet_char","character":"core"}]]

For general/off-topic questions with NO desktop action requested, just answer naturally with NO [[ACTION:...]] tag!`;

    const recentMsgs = this.history.slice(-8).map((h) => ({ role: h.role, content: h.content }));
    const useThink = Boolean(liveContext.thinkMode ?? this.thinkMode);

    try {
      let rawReply = '';
      let thinkingText = '';
      if (active.provider === 'ollama') {
        const res = await httpJson({
          host: OLLAMA_HOST,
          port: OLLAMA_PORT,
          path: '/api/chat',
          method: 'POST',
          timeout: useThink ? 90000 : 55000,
          body: {
            model: active.rawName,
            stream: false,
            think: useThink,
            keep_alive: '2m',
            options: { temperature: useThink ? 0.55 : 0.65, num_predict: useThink ? 900 : 512 },
            messages: [{ role: 'system', content: systemPrompt }, ...recentMsgs],
          },
        });
        rawReply = res?.message?.content || '';
        thinkingText = String(res?.message?.thinking || '').trim();
      } else {
        const res = await httpJson({
          host: LMSTUDIO_HOST,
          port: LMSTUDIO_PORT,
          path: '/v1/chat/completions',
          method: 'POST',
          timeout: useThink ? 90000 : 55000,
          body: {
            model: active.rawName,
            temperature: useThink ? 0.55 : 0.65,
            max_tokens: useThink ? 900 : 512,
            messages: [{ role: 'system', content: systemPrompt }, ...recentMsgs],
          },
        });
        rawReply = res?.choices?.[0]?.message?.content || '';
      }

      // Capture <think>...</think> blocks if model outputs inline reasoning
      const thinkMatch = rawReply.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch && !thinkingText) thinkingText = thinkMatch[1].trim();
      rawReply = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      const { cleanText, action } = this.extractAction(rawReply);
      const reply = cleanText || (action ? 'Done!' : 'Got it!');

      this.history.push({
        role: 'assistant',
        content: reply,
        thinking: thinkingText ? thinkingText.slice(0, 1200) : '',
        action,
        ts: Date.now(),
      });
      this.saveHistory();
      return { ok: true, reply, thinking: thinkingText, action, model: active.rawName };
    } catch (err) {
      const msg = `Local model (${active.rawName}) busy or timed out: ${err.message}`;
      this.history.push({ role: 'assistant', content: msg, ts: Date.now() });
      this.saveHistory();
      return { ok: false, reply: msg, thinking: '', action: null };
    } finally {
      this.isThinking = false;
    }
  }
}

module.exports = { LocalLLMBrain };
