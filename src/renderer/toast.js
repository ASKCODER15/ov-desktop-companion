(function () {
  const api = window.petFishAPI;
  const root = document.getElementById('mini-toast');
  const tagEl = document.getElementById('mini-toast-tag');
  const timerEl = document.getElementById('mini-toast-timer');
  const titleEl = document.getElementById('mini-toast-title');
  const bodyEl = document.getElementById('mini-toast-body');
  const copyBtn = document.getElementById('mini-toast-copy');
  const pauseBtn = document.getElementById('mini-toast-pause');
  const optionsEl = document.getElementById('mini-toast-options');
  const actionsEl = document.getElementById('mini-toast-actions');
  let targetTab = 'agents';
  let currentNotif = null;
  let currentQuestion = null;
  let startedAtTs = 0;
  let timerInterval = null;

  function formatMMSS(startTs) {
    if (!startTs) return '00:00';
    const sec = Math.max(0, Math.floor((Date.now() - startTs) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  api.onToastShow((payload) => {
    if (!payload) return;
    targetTab = payload.tabTarget || 'agents';
    currentNotif = payload.notifItem || null;
    currentQuestion = payload.questionItem || null;
    document.body.dataset.theme = ['kronos', 'aegis', 'optix', 'orbit'].includes(payload.petCharacter)
      ? payload.petCharacter
      : 'kronos';
    document.body.classList.toggle('privacy-masked', Boolean(payload.privacyMask));
    tagEl.textContent = payload.tag || 'KRONOS';
    titleEl.textContent = payload.title || '';
    bodyEl.textContent = payload.body || '';

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    startedAtTs = Number(payload.startedAt) || 0;
    if (startedAtTs > 0 || payload.timerText) {
      timerEl.classList.remove('hidden');
      timerEl.textContent = payload.timerText || formatMMSS(startedAtTs);
      if (startedAtTs > 0) {
        timerInterval = setInterval(() => {
          timerEl.textContent = formatMMSS(startedAtTs);
        }, 1000);
      }
    } else {
      timerEl.classList.add('hidden');
    }

    if (optionsEl) {
      optionsEl.innerHTML = '';
      const opts = payload.questionItem?.options;
      if (Array.isArray(opts) && opts.length > 0) {
        optionsEl.classList.remove('hidden');
        opts.forEach((optText, idx) => {
          const pill = document.createElement('span');
          pill.className = 'toast-opt-pill';
          pill.textContent = `${idx + 1}. ${optText}`;
          optionsEl.appendChild(pill);
        });
      } else {
        optionsEl.classList.add('hidden');
      }
    }

    actionsEl.innerHTML = '';
    if (payload.approvalItem) {
      const item = payload.approvalItem;
      actionsEl.classList.remove('hidden');

      const allowBtn = document.createElement('button');
      allowBtn.className = 'mini-btn allow';
      allowBtn.textContent = item.canRespondDirectly ? 'ALLOW' : 'OPEN & ALLOW';
      allowBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.resolveApproval(item.id, 'allow');
      });

      const denyBtn = document.createElement('button');
      denyBtn.className = 'mini-btn deny';
      denyBtn.textContent = 'DENY';
      denyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.resolveApproval(item.id, 'deny');
      });
      actionsEl.append(allowBtn, denyBtn);
    } else if (payload.questionItem) {
      const q = payload.questionItem;
      actionsEl.classList.remove('hidden');

      const openBtn = document.createElement('button');
      openBtn.className = 'mini-btn primary';
      openBtn.textContent = `OPEN ${(q.agentName || 'ANTIGRAVITY').toUpperCase()}`;
      openBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        api.closeToast();
        await api.focusApp(q.processHint || q.agentName || 'Antigravity');
      });

      const speakBtn = document.createElement('button');
      speakBtn.className = 'mini-btn';
      speakBtn.textContent = 'SPEAK';
      speakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        api.speakText(`${q.agentName || 'Antigravity'} asks: ${q.question || bodyEl.textContent}`);
      });
      actionsEl.append(openBtn, speakBtn);
    } else {
      actionsEl.classList.add('hidden');
    }
  });

  if (pauseBtn) {
    pauseBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (api.pauseVoice) {
        const res = await api.pauseVoice();
        const paused = Boolean(res?.paused);
        pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
        pauseBtn.style.background = paused ? '#ff5500' : '';
        pauseBtn.style.color = paused ? '#111215' : '';
      }
    });
  }

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const fullText = `${titleEl.textContent ? `${titleEl.textContent}: ` : ''}${bodyEl.textContent || ''}`.trim();
    if (api.copyText) {
      await api.copyText(fullText);
    } else {
      try { await navigator.clipboard.writeText(fullText); } catch {}
    }
    copyBtn.textContent = 'COPIED';
    setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1400);
  });

  root.addEventListener('click', async () => {
    api.closeToast();
    if (currentQuestion) {
      await api.focusApp(currentQuestion.processHint || currentQuestion.agentName || 'Antigravity');
    } else if (currentNotif) {
      await api.openNotificationApp(currentNotif);
    } else {
      api.openHudTab(targetTab, 'deep');
    }
  });

  document.getElementById('mini-toast-close').addEventListener('click', (e) => {
    e.stopPropagation();
    api.closeToast();
  });
})();
