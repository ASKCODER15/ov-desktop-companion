(function () {
  const api = window.petFishAPI;
  const root = document.getElementById('mini-toast');
  const tagEl = document.getElementById('mini-toast-tag');
  const titleEl = document.getElementById('mini-toast-title');
  const bodyEl = document.getElementById('mini-toast-body');
  const actionsEl = document.getElementById('mini-toast-actions');
  let targetTab = 'alerts';
  let currentNotif = null;

  api.onToastShow((payload) => {
    if (!payload) return;
    targetTab = payload.tabTarget || 'alerts';
    currentNotif = payload.notifItem || null;
    document.body.dataset.theme = ['vesper', 'vector', 'core', 'coral'].includes(payload.petCharacter) ? payload.petCharacter : 'vesper';
    document.body.classList.toggle('privacy-masked', Boolean(payload.privacyMask));
    tagEl.textContent = payload.tag || 'OV';
    tagEl.className = `mini-toast-tag ${payload.tagClass || ''}`;
    titleEl.textContent = payload.title || '';
    bodyEl.textContent = payload.body || '';

    actionsEl.innerHTML = '';
    if (payload.approvalItem) {
      const item = payload.approvalItem;
      actionsEl.classList.remove('hidden');

      const allowBtn = document.createElement('button');
      allowBtn.className = 'mini-btn allow';
      allowBtn.textContent = item.canRespondDirectly ? 'Allow' : 'Open & Allow';
      allowBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.resolveApproval(item.id, 'allow');
      });

      const denyBtn = document.createElement('button');
      denyBtn.className = 'mini-btn deny';
      denyBtn.textContent = 'Deny';
      denyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api.resolveApproval(item.id, 'deny');
      });
      actionsEl.append(allowBtn, denyBtn);
    } else {
      actionsEl.classList.add('hidden');
    }
  });

  root.addEventListener('click', async () => {
    api.closeToast();
    // If toast is a message from a real app (WhatsApp, Brave, etc.), open that EXACT app!
    if (currentNotif) {
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
