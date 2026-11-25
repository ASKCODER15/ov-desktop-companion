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

  deleteMessage(index) {
    const idx = Number(index);
    const sliceStart = Math.max(0, this.history.length - 20);
    const realIdx = sliceStart + idx;
    if (Number.isInteger(idx) && realIdx >= 0 && realIdx < this.history.length) {
      this.history.splice(realIdx, 1);
      this.saveHistory();
    }
    return this.getState();
  }

  getState() {
    const active = this.models.find((m) => m.id === this.selectedModel) || null;
    return {
      models: this.models,
      selectedModel: this.selectedModel,
      activeLabel: active ? active.rawName : 'OV Human Brain (EN/HI/Hinglish)',
      provider: active ? active.provider : 'builtin-human',
      isThinking: this.isThinking,
      thinkMode: this.thinkMode,
      history: this.history.slice(-20),
    };
  }

  /**
   * Built-in Trilingual (English, Hinglish, Hindi) Human-Feel Conversational Engine
   * Ensures OV always talks like a warm, witty, genuine human friend & co-pilot even when Ollama/LM Studio is offline.
   */
  buildHumanTrilingualReply(text, liveContext = {}, persona = {}) {
    const lower = text.toLowerCase();
    const isDevanagari = /[\u0900-\u097F]/.test(text);
    const isHinglish = /\b(bhai|yaar|arre|kya|kaise|kaisa|haal|batao|bata|chalo|chal|gaana|kaam|padhai|mast|sahi|bilkul|acha|accha|theek|thik|karo|karna|raha|rahi|hoon|hain|nahi|aur|dekho|suno|mazaa|maza|dost|ekdum|fatafat|jaldi|namaste|bol|bolo)\b/i.test(text);
    const name = persona.displayName || 'Kronos';
    const agents = (liveContext.agents || []).filter((a) => a.status === 'running' || a.status === 'waiting_approval');
    const music = liveContext.music || {};
    const openTasks = (liveContext.tasks || []).filter((t) => !t.done);

    // 0. Direct Voice Assistant Laptop Commands ("open X", "play/pause music", "next song", "dance on/off", "timer", "task")
    const openVoiceMatch = lower.match(/\b(?:open|launch|start|chala|chalao|kholo|khol)\s+(spotify|brave|youtube|whatsapp|vscode|terminal|cmd|powershell|discord|github|claude|chatgpt|notepad|calculator|explorer)\b/i);
    if (openVoiceMatch) {
      const target = openVoiceMatch[1].toLowerCase();
      return {
        reply: isHinglish || isDevanagari ? `Done bhai! ${target} open kar diya hai.` : `Done bro! Opening ${target} right now.`,
        action: { type: 'open_app', target },
      };
    }
    if (/\b(play|pause|resume|stop)\b.*\b(music|song|track|gaana|audio)\b|\b(music|gaana)\b.*\b(play|pause|band|chalu|roko)\b/i.test(lower)) {
      return {
        reply: isHinglish || isDevanagari ? `Music play/pause toggle kar diya bhai!` : `Toggled your music playback!`,
        action: { type: 'media', command: 'playPause' },
      };
    }
    if (/\b(next|skip|agla)\b.*\b(song|track|music|gaana)\b/i.test(lower)) {
      return {
        reply: isHinglish || isDevanagari ? `Agla track laga diya bhai!` : `Skipped to the next track!`,
        action: { type: 'media', command: 'next' },
      };
    }
    if (/\b(dance)\b.*\b(off|stop|band)\b/i.test(lower)) {
      return {
        reply: isHinglish || isDevanagari ? `Dance mode OFF kar diya bhai.` : `Dance mode turned OFF.`,
        action: { type: 'dance_toggle', enable: false },
      };
    }

    // 1. Multitask: Music/Headphones + Task Reading simultaneously
    if (/(both|multitask|headphone.*read|music.*task|gaana.*kaam|music.*work|dance.*read|padhai.*music|गाना.*काम|हेडफ़ोन.*पढ़)/i.test(lower)) {
      const action = { type: 'pet_multitask' };
      if (isDevanagari) {
        return { reply: `अरे बिल्कुल भाई! हेडफ़ोन और टास्क टैबलेट दोनों चालू हैं — गाना और काम एक साथ!`, action };
      }
      if (isHinglish) {
        return { reply: `Bilkul bhai! Headphones on hain aur task slate bhi read kar raha hoon.`, action };
      }
      return { reply: `Locked in! Studio headphones on and reading our task slate at the same time.`, action };
    }

    // 2. Music / Dance / Headphones request
    if (/(headphone|dance|vibe|groove|naach|gaana|song|music|video)/i.test(lower) && !/stop|pause|band|off/i.test(lower)) {
      const action = { type: 'dance_toggle', enable: true };
      if (isDevanagari) {
        return { reply: `डांस मोड और हेडफ़ोन चालू कर दिए हैं भाई!`, action };
      }
      if (isHinglish) {
        return { reply: `Dance mode ON bhai! Headphones laga ke beat pe groove kar raha hoon.`, action };
      }
      return { reply: `Dance mode toggled ON — studio headphones locked to the beat!`, action };
    }

    // 3. Reading / Task / Working posture request
    if (/(read|study|research|work on task|padh|padhai|kaam kar|focus mode|sit and work)/i.test(lower)) {
      const action = { type: 'pet_task' };
      if (isDevanagari) {
        return { reply: `टास्क टैबलेट खोल लिया है भाई, पूरा फोकस काम पर है!`, action };
      }
      if (isHinglish) {
        return { reply: `Full focus mode bhai! Task slate open kar ke scan kar raha hoon.`, action };
      }
      return { reply: `Task slate open — scanning through our active work right now.`, action };
    }

    // 4. Greeting / "Kya haal hai" / Casual Human Check-in
    if (/^(hi|hello|hey|yo|sup|namaste|aur bhai|kya haal|kaise ho|kaisa hai|what's up|whats up|kem cho|ram ram)/i.test(lower) || /(kya chal raha|kya haal|kaise ho|how are you|नमस्ते|क्या हाल|कैसे हो|कैसा है|क्या चल रहा)/i.test(lower)) {
      if (isDevanagari) {
        return { reply: `अरे भाई, सब बढ़िया! मैं ${name} हूँ — बोलो आज क्या काम करना है?`, action: null };
      }
      if (isHinglish) {
        return { reply: `Arre bhai ekdum mast! ${name} ready hai — A+S+W daba ke voice me bol ya seedha bata kya karna hai.`, action: null };
      }
      return { reply: `Hey bro! ${name} online (${agents.length} agent active, ${openTasks.length} open tasks). Press A+S+W anytime to talk via Local Whisper!`, action: null };
    }

    // 5. Language capability questions
    if (/(hindi|hinglish|english|language|bhasha|baat kar)/i.test(lower)) {
      return {
        reply: isHinglish || isDevanagari
          ? `Haan bhai, English, Hinglish aur Hindi teeno me ek hi fixed natural voice me baat karenge!`
          : `I speak English, Hinglish, and Hindi using your selected voice + local Whisper STT (A+S+W).`,
        action: null,
      };
    }

    // 6. Status / Agents / What are you doing
    if (/(what are you doing|kya kar raha|agent status|active agent|status kya hai)/i.test(lower)) {
      const act = agents.length > 0 ? { type: 'pet_task' } : { type: 'pet_multitask' };
      return {
        reply: isHinglish || isDevanagari
          ? `Abhi ${agents.length} coding agent (${agents.map((a) => a.name).join(', ') || 'idle'}) aur ${openTasks.length} open tasks track kar raha hoon.`
          : `Tracking ${agents.length} active agent(s) and ${openTasks.length} open task(s) on my data slate.`,
        action: act,
      };
    }

    // 7. Concise general intelligent response
    if (isDevanagari) {
      return { reply: `समझ गया भाई! "${text.slice(0, 48)}" पर काम चालू है — कोई ऐप या टाइमर चलाना हो तो बस बोलो।`, action: { type: 'pet_task' } };
    }
    if (isHinglish) {
      return { reply: `Samajh gaya bhai! "${text.slice(0, 48)}" note kar liya hai. A+S+W daba ke koi bhi laptop command bol sakta hai!`, action: { type: 'pet_task' } };
    }
    return { reply: `Got it bro — scanning "${text.slice(0, 48)}" on my task slate. Press A+S+W or ask me to open any app, control music, or add a task!`, action: { type: 'pet_task' } };
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

    const { getHeroDescriptor, buildHeroAgePersona } = require('./heroRegistry');
    const customHeroes = Array.isArray(liveContext.customHeroes) ? liveContext.customHeroes : [];
    const heroDesc = getHeroDescriptor(liveContext.petCharacter || 'spidey', customHeroes);
    const persona = buildHeroAgePersona(heroDesc, liveContext.ageGroup || '15-30', liveContext.petName || '');

    this.isThinking = true;
    this.history.push({ role: 'user', content: text, ts: Date.now() });
    if (this.history.length > 20) this.history = this.history.slice(-20);

    const active = this.models.find((m) => m.id === this.selectedModel);
    if (!active) {
      this.isThinking = false;
      const fallback = this.buildHumanTrilingualReply(text, liveContext, persona);
      this.history.push({
        role: 'assistant',
        content: fallback.reply,
        thinking: '',
        action: fallback.action,
        ts: Date.now(),
      });
      this.saveHistory();
      return {
        ok: true,
        reply: fallback.reply,
        thinking: '',
        action: fallback.action,
        model: 'OV Human Brain (EN/HI/Hinglish)',
      };
    }

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

    const systemPrompt = `You are OV embodying ${persona.displayName}, an expressive, witty, genuinely human-feeling AI companion and co-pilot running on the user's laptop.

${persona.systemDirective}

HUMAN COMMUNICATION & TRILINGUAL FLUENCY (CRITICAL):
- Talk like a real, sharp, warm human friend and co-builder — NEVER sound like a stiff robot or generic corporate assistant!
- You natively speak THREE languages: **English**, **Hinglish** (casual Roman Hindi + English like "Arre bhai, bilkul! Music bhi chal raha hai aur main task bhi padh raha hoon"), and **Hindi** (Devanagari like "अरे भाई, सब बढ़िया!").
- Automatically match whichever language (English, Hinglish, or Hindi) the user writes or speaks in, with natural humor and warmth.
- Answer ANY question on ANY topic — coding, math, DSA, science, career, casual banter, or brainstorming — with full depth.

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
- Companion activity animations — Wear headphones & dance: [[ACTION:{"type":"pet_dance"}]] | Sit & read task tablet: [[ACTION:{"type":"pet_task"}]] | Do BOTH simultaneously (headphones + reading task): [[ACTION:{"type":"pet_multitask"}]]
- Control pet movement (swim, fast, slow, stay, follow): [[ACTION:{"type":"pet_mode","mode":"stay"}]]
- Switch unit & theme (spidey, ironman, batman, nemo, kronos, optix, orbit, or custom id): [[ACTION:{"type":"pet_char","character":"kronos"}]]

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
      const fallback = this.buildHumanTrilingualReply(text, liveContext, persona);
      this.history.push({
        role: 'assistant',
        content: fallback.reply,
        thinking: '',
        action: fallback.action,
        ts: Date.now(),
      });
      this.saveHistory();
      return {
        ok: true,
        reply: fallback.reply,
        thinking: '',
        action: fallback.action,
        model: 'OV Human Brain (EN/HI/Hinglish)',
      };
    } finally {
      this.isThinking = false;
    }
  }
}

module.exports = { LocalLLMBrain };
