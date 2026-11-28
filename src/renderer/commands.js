(function () {
  /**
   * Fast instant deterministic command matcher (< 1ms).
   * Handles Pet switches, System Controls (Wi-Fi, Bluetooth, Flight Mode),
   * Universal App + Website opening (CMD, PowerShell, Terminal, any installed app, any website / Brave App Mode),
   * Tasks/Timers/Movement — while routing conversational Hinglish/English prompts to Local LLM (qwen3.5:2b)!
   */
  function parsePetCommand(raw) {
    const text = String(raw || '').trim();
    const lower = text.toLowerCase();
    if (!lower) return null;

    const words = lower.split(/\s+/);
    const isShort = words.length <= 6;

    // 0. Route complex, multi-step, or JARVIS autonomous commands straight to JarvisAgent + Local LLM!
    if (
      /\b(antigravity|anti\s*gravity|vs\s*code|vscode|cursor|make\s+(?:a\s+)?folder|create\s+(?:a\s+)?folder|delete|remove|trash|download|install|clone|screenshot|volume|and\s+then|tell\s+him|ask\s+him|find|locate|where\s+is|dhoondo|dhundho|khojo|show\s+me|pause\s+voice|stop\s+talking|stop\s+voice|shut\s*up|chup)\b/i.test(lower) ||
      (/\b(youtube|yt)\b/i.test(lower) && /\b(play|bajao|chalao|lagao)\b/i.test(lower))
    ) {
      return { action: 'ask-llm', prompt: text };
    }

    // 1. Robot Agent & Theme Switching (Kronos 4-Slab Monolith, Aegis Field Mech, Optix Research Rover, Orbit Synth Pod!)
    if (isShort && /^(kronos|monolith|tars|interstellar|heavy\s*bot|switch to kronos|kronos theme|vesper|acrobat|spidey|spider[\s-]*man|spiderman)$/i.test(lower)) {
      return { action: 'character', character: 'kronos', reply: 'Kronos 4-Slab Interstellar Monolith online.' };
    }
    if (isShort && /^(aegis|mech|field\s*mech|switch to aegis|aegis theme|vector|iron[\s-]*man|ironman)$/i.test(lower)) {
      return { action: 'character', character: 'aegis', reply: 'Aegis Bipedal Field Mech online.' };
    }
    if (isShort && /^(optix|rover|research\s*bot|scout|switch to optix|optix theme|umbra|guardian|batman|bat|core)$/i.test(lower)) {
      return { action: 'character', character: 'optix', reply: 'Optix Deep Research Rover deployed.' };
    }
    if (isShort && /^(orbit|synth|drone|switch to orbit|orbit theme|coral|reef|nemo|fish|machli)$/i.test(lower)) {
      return { action: 'character', character: 'orbit', reply: 'Orbit Autonomous Synth Pod engaged.' };
    }

    // 1b. Smart Reminders ("bro remind me in 10 min to drink water" / "remind me to submit lab")
    const remMatch = text.match(/^(?:bro\s+)?(?:remind\s+me|yaad\s+dilana|reminder)\s+(?:in\s+(\d+)\s*(?:m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s+)?(?:to\s+|about\s+|ki\s+)?(.+)$/i);
    if (remMatch) {
      let mins = Number(remMatch[1] || 10);
      if (/\b(?:h|hr|hrs|hour|hours)\b/i.test(text)) mins *= 60;
      const body = remMatch[2].replace(/\s+in\s+\d+\s*(?:m|min|mins|minute|minutes)$/i, '').trim();
      const tailMin = remMatch[2].match(/\bin\s+(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
      if (!remMatch[1] && tailMin) mins = Number(tailMin[1]);
      if (body) return { action: 'add-reminder', text: body, minutes: mins, reply: `Reminder set (${mins}m): "${body}"` };
    }

    // 1c. Media Player & Clipboard Lens shortcuts
    if (isShort && /^(play|pause|play\s*pause|resume\s*music|stop\s*music)$/i.test(lower)) {
      return { action: 'media', command: 'playPause', reply: 'Toggled music playback.' };
    }
    if (isShort && /^(next|next\s*song|next\s*track|skip)$/i.test(lower)) {
      return { action: 'media', command: 'next', reply: 'Skipped to next track.' };
    }
    if (isShort && /^(prev|previous|prev\s*song|previous\s*track)$/i.test(lower)) {
      return { action: 'media', command: 'prev', reply: 'Previous track.' };
    }
    if (isShort && /^(explain\s*clipboard|explain\s*copied|lens|focus\s*lens)$/i.test(lower)) {
      return { action: 'explain-clipboard', reply: 'Analyzing copied snippet with AI Lens...' };
    }

    // 2. System Controls: Flight Mode, Wi-Fi ON/OFF/Connect, Bluetooth ON/OFF/Connect, Mute, Lock
    if (isShort && /^(?:flight|airplane|aeroplane)\s*mode(?:\s+(on|off|enable|disable|chalu|band))?$/i.test(lower)) {
      const m = lower.match(/(on|off|enable|disable|chalu|band)$/i);
      const enable = m ? /^(on|enable|chalu)$/i.test(m[1]) : 'toggle';
      return { action: 'sys-flight', enable, reply: enable === false ? 'Turning Flight Mode OFF...' : 'Toggling Flight Mode...' };
    }

    const wifiToggle = lower.match(/^(?:turn\s+)?(on|off|enable|disable)\s+wi-?fi$/i) || lower.match(/^wi-?fi\s+(on|off|enable|disable|chalu|band|karo)$/i);
    if (isShort && wifiToggle) {
      const token = (wifiToggle[1] || '').toLowerCase();
      if (token !== 'karo') {
        const enable = /^(on|enable|chalu)$/.test(token);
        return { action: 'sys-wifi', enable, reply: `Turning Wi-Fi ${enable ? 'ON' : 'OFF'}...` };
      }
    }

    const wifiConnect = text.match(/^(?:connect(?:\s+to)?\s+wi-?fi|wi-?fi\s+connect)\s+(.+)$/i);
    if (wifiConnect) {
      const ssid = wifiConnect[1].trim();
      return { action: 'sys-wifi-connect', ssid, reply: `Connecting Wi-Fi to "${ssid}"...` };
    }
    if (isShort && /^(?:disconnect\s+wi-?fi|wi-?fi\s+disconnect)$/i.test(lower)) {
      return { action: 'sys-wifi-disconnect', reply: 'Disconnecting Wi-Fi...' };
    }

    const btToggle = lower.match(/^(?:turn\s+)?(on|off|enable|disable)\s+(?:bluetooth|bt)$/i) || lower.match(/^(?:bluetooth|bt)\s+(on|off|enable|disable|chalu|band)$/i);
    if (isShort && btToggle) {
      const enable = /^(on|enable|chalu)$/i.test(btToggle[1]);
      return { action: 'sys-bt', enable, reply: `Turning Bluetooth ${enable ? 'ON' : 'OFF'}...` };
    }

    const btConnect = text.match(/^(?:connect(?:\s+to)?\s+(?:bluetooth|bt)|(?:bluetooth|bt)\s+connect)(?:\s+(.+))?$/i);
    if (btConnect) {
      const target = (btConnect[1] || '').trim();
      return { action: 'sys-bt-connect', target, reply: target ? `Connecting Bluetooth: ${target}...` : 'Opening Bluetooth devices...' };
    }

    if (isShort && /^(mute|unmute|mute audio|toggle mute)$/i.test(lower)) {
      return { action: 'sys-mute', reply: 'Toggled system audio mute.' };
    }
    if (isShort && /^(lock|lock pc|lock screen)$/i.test(lower)) {
      return { action: 'sys-lock', reply: 'Locking PC...' };
    }

    // 3. Direct Web / Multi-Topic / YouTube / Reddit search shortcuts
    const ytSearch = text.match(/^(?:youtube|yt)\s+(?:search\s+)?(.+)$/i);
    if (ytSearch && !/^(open|kholo|as app)$/i.test(ytSearch[1].trim())) {
      return { action: 'search-brave', engine: 'youtube', query: ytSearch[1].trim(), reply: `Searching YouTube in Brave: "${ytSearch[1].trim()}"` };
    }
    const rdSearch = text.match(/^reddit\s+(?:search\s+)?(.+)$/i);
    if (rdSearch && !/^(open|kholo|as app)$/i.test(rdSearch[1].trim())) {
      return { action: 'search-brave', engine: 'reddit', query: rdSearch[1].trim(), reply: `Searching Reddit in Brave: "${rdSearch[1].trim()}"` };
    }
    const webSearch = text.match(/^(?:search(?:\s+for|\s+web)?|google|brave\s+search)\s+(.+)$/i);
    if (webSearch && webSearch[1].trim()) {
      const queries = webSearch[1]
        .split(/\s*(?:,|;|\band\b|\baur\b)\s*/i)
        .map((q) => q.trim())
        .filter((q) => q.length >= 2)
        .slice(0, 4);
      if (queries.length > 1) {
        return { action: 'search-multi', queries, reply: `Searching ${queries.length} topics in Brave...` };
      }
      return { action: 'search-brave', engine: 'web', query: webSearch[1].trim(), reply: `Searching Brave: "${webSearch[1].trim()}"` };
    }

    // 4. Bare website domain / URL typed directly (e.g. "chatgpt.com", "https://vercel.com", "instagram.com as app")
    const bareUrlMatch = text.match(/^(https?:\/\/[^\s]+|(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,14})+(?:\/[^\s]*)?)(?:\s+(?:as\s+app|app\s+mode))?$/i);
    if (bareUrlMatch) {
      const asApp = /\b(?:as\s+app|app\s+mode)\b/i.test(text);
      return { action: 'open-app', appKey: bareUrlMatch[1].trim(), asApp, reply: `Opening ${bareUrlMatch[1].trim()}...` };
    }

    // 5. Direct Universal App OR Website launch ("open cmd", "open powershell", "open discord", "open instagram.com", "open notion as app", "spotify chalao")
    const openMatch =
      text.match(/^(?:open|launch|start|run|play|go\s+to|visit|kholo|khol|chalao)\s+(.+)$/i) ||
      text.match(/^(.+?)\s+(?:kholo|khol|chalao|open\s*karo|open\s*kar\s*do)$/i);
    if (openMatch && words.length <= 6) {
      let target = openMatch[1].trim();
      const asApp = /\b(?:as\s+(?:an?\s+)?app|in\s+app\s+mode|app\s+mode)\b/i.test(target);
      target = target.replace(/\b(?:as\s+(?:an?\s+)?app|in\s+app\s+mode|app\s+mode)\b/gi, '').trim();

      const portMatch = target.match(/^(?:localhost|127\.0\.0\.1)?:?(\d{4,5})$/);
      if (portMatch) {
        return { action: 'open-port', port: Number(portMatch[1]), reply: `Opening localhost:${portMatch[1]} in Brave...` };
      }
      if (target) {
        return { action: 'open-app', appKey: target, asApp, reply: `Opening ${target}...` };
      }
    }

    // 6. Appoint task / timer
    const taskMatch = text.match(/^(?:task|todo|appoint)\s+(.+)$/i);
    if (taskMatch) return { action: 'add-task', text: taskMatch[1].trim(), reply: `Appointed task: "${taskMatch[1].trim()}"` };

    const timerMatch = text.match(/^(?:timer|sprint|pomodoro|remind)\s+(\d+)\s*(?:m|min|mins|minute|minutes)?\s*(.*)$/i);
    if (timerMatch) {
      const mins = Number(timerMatch[1]);
      const label = timerMatch[2]?.trim() || 'Vibe Sprint';
      return { action: 'start-timer', minutes: mins, label, reply: `Started ${mins}m timer: ${label}` };
    }

    // 7. Pet movement & display toggles
    if (isShort) {
      if (/(privacy|blur|mask)/.test(lower)) {
        const disable = /(off|unblur|show|disable)/.test(lower);
        return { action: 'privacy', enabled: !disable, reply: disable ? 'Privacy mask OFF.' : 'Privacy mask ON.' };
      }
      if (/(desktop\s*only|sirf\s*desktop)/.test(lower)) return { action: 'display-mode', displayMode: 'desktop-only', reply: 'Desktop-Only mode ON.' };
      if (/(always\s*on\s*top|floating)/.test(lower)) return { action: 'display-mode', displayMode: 'floating', reply: 'Always Floating mode ON.' };
      if (/^(top[\s-]*right|upar[\s-]*right)$/.test(lower)) return { action: 'corner', corner: 'top-right', thenStay: true, reply: 'Heading to top-right!' };
      if (/^(top[\s-]*left|upar[\s-]*left)$/.test(lower)) return { action: 'corner', corner: 'top-left', thenStay: true, reply: 'Heading to top-left!' };
      if (/^(bottom[\s-]*left|niche[\s-]*left)$/.test(lower)) return { action: 'corner', corner: 'bottom-left', thenStay: true, reply: 'Heading to bottom-left!' };
      if (/^(bottom[\s-]*right|niche[\s-]*right|corner)$/.test(lower)) return { action: 'corner', corner: 'bottom-right', thenStay: true, reply: 'Heading to bottom-right!' };
      if (/^(center|middle|beech)$/.test(lower)) return { action: 'corner', corner: 'center', thenStay: false, reply: 'Heading to center!' };
      if (/^(pick|spot|udhar\s*jao|wahan\s*jao|go\s*there)$/.test(lower)) return { action: 'pick-spot', reply: 'Click anywhere on screen!' };
      if (/^(stop|stay|hang|ruko|ruk\s*jao|yahin\s*ruko|freeze|pause)$/.test(lower)) return { action: 'mode', mode: 'stay', reply: 'Staying right here!' };
      if (/^(bhaago|bhago|fast|zoom|zoomies|run|tez)$/.test(lower)) return { action: 'mode', mode: 'fast', reply: 'Full speed!' };
      if (/^(dheere|slow|walk|chill)$/.test(lower)) return { action: 'mode', mode: 'slow', reply: 'Slow cruise.' };
      if (/^(follow|chase|come\s*here|idhar\s*aao|aao)$/.test(lower)) return { action: 'mode', mode: 'follow', reply: 'Following your cursor!' };
      if (/^(swim|swing|chalo|chal|ghoomo|roam|move|free)$/.test(lower)) return { action: 'mode', mode: 'swim', reply: 'Roaming freely!' };
      if (/^(dance|naacho|nacho|vibe|groove|party|headphones)$/.test(lower)) return { action: 'pet-dance', reply: 'Headphones on & vibing to the beat!' };
      if (/^(pet|good\s*boy|cute|pyaar)$/.test(lower)) return { action: 'pet', reply: 'Happy wiggle!' };
    }

    // 8. Anything conversational or complex goes straight to Local LLM Brain (qwen3.5:2b)!
    return { action: 'ask-llm', prompt: text };
  }

  window.parsePetCommand = parsePetCommand;
})();
