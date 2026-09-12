import { BallRenderer } from './ball-renderer.js';
import { locales } from './locales.js';
import { StickyNotesController } from './sticky-notes.js';

// Detect if running in Electron environment via Preload ContextBridge or fallback
let ipcRenderer = window.electronAPI || window.ipcRenderer || null;
if (!ipcRenderer) {
  try {
    if (window.require) {
      const electron = window.require('electron');
      ipcRenderer = electron.ipcRenderer;
    }
  } catch (e) { }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize 3D WebGL Ball Renderer
  const ballRenderer = new BallRenderer('ball-canvas', speed => {
    ipcRenderer?.send('ball-speed-changed', speed);
  });

  // 2. Elements
  const petContainer = document.getElementById('pet-container');
  const bearCharacter = document.getElementById('bear-character');
  const speechBubble = document.getElementById('speech-bubble');
  const speechText = document.getElementById('speech-text');
  const ballContainer = document.getElementById('ball-canvas-container');
  const mailContainer = document.getElementById('mail-opened-container');
  const waterContainer = document.getElementById('water-bottle-container');
  const calendarContainer = document.getElementById('calendar-orb-container');
  const calendarStickyBoard = document.getElementById('calendar-sticky-board');
  const calendarStickyList = document.getElementById('calendar-sticky-list');
  const calendarStickyCount = document.getElementById('calendar-sticky-count');
  const emailStickyBoard = document.getElementById('email-sticky-board');
  const emailStickyList = document.getElementById('email-sticky-list');
  const emailStickyCount = document.getElementById('email-sticky-count');
  const triviaContainer = document.getElementById('trivia-orb-container');
  const alarmContainer = document.getElementById('alarm-orb-container');
  const stickyNotesBoard = document.getElementById('sticky-notes-board');
  const stickyReopenTab = document.getElementById('sticky-reopen-tab');
  const laptopNotesTrigger = document.getElementById('laptop-notes-trigger');
  const laptopQuickMenu = document.getElementById('laptop-quick-menu');
  const laptopQuickMenuHome = laptopQuickMenu?.parentElement || null;
  // Reserve the bubble's full layout height, independent of its entrance scale.
  // Observers also cover replacement notifications, font changes and resizing.
  let dialogueFadeTimer = null;
  const syncDialogueSpace = () => {
    const shown = speechBubble.classList.contains('show');
    // Keep the space until the fading bubble has actually disappeared.
    if (!shown && Number.parseFloat(getComputedStyle(speechBubble).opacity) > 0) {
      // Hidden Electron windows may skip transitionend. Match the 300ms CSS
      // fade with a fallback, cancelled if another notification replaces it.
      if (dialogueFadeTimer === null) dialogueFadeTimer = setTimeout(() => {
        dialogueFadeTimer = null;
        if (!speechBubble.classList.contains('show')) petContainer.style.setProperty('--dialogue-space', '0px');
      }, 350);
      return;
    }
    clearTimeout(dialogueFadeTimer);
    dialogueFadeTimer = null;
    const space = shown ? speechBubble.offsetHeight + 10 : 0;
    petContainer.style.setProperty('--dialogue-space', `${space}px`);
  };
  speechBubble.addEventListener('transitionend', event => {
    if (event.target === speechBubble && event.propertyName === 'opacity') syncDialogueSpace();
  });
  new ResizeObserver(syncDialogueSpace).observe(speechBubble);
  new MutationObserver(syncDialogueSpace).observe(speechBubble, {
    attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true
  });
  syncDialogueSpace();
  let stickyNotesController = null;
  let currentAssistantSize = 'std';
  let laptopShortcutOrder = [];
  let draggedLaptopShortcutKey = '';
  let suppressLaptopShortcutClick = false;
  let laptopDragOriginalOrder = [];
  let laptopDragCommitted = false;
  let laptopDragPreviewIndex = -1;
  let isAssistantVisible = true;

  // Language state
  let currentLang = 'zh-TW';
  const getLoc = () => locales[currentLang] || locales['zh-TW'];

  const applyLanguage = (lang) => {
    if (lang !== 'zh-TW' && lang !== 'en') lang = 'zh-TW';
    currentLang = lang;
    const loc = getLoc();

    document.title = loc.appName;
    if (bearCharacter) bearCharacter.setAttribute('title', loc.tooltips.bear);
    if (ballContainer) ballContainer.setAttribute('title', loc.tooltips.ball);
    if (mailContainer) mailContainer.setAttribute('title', loc.tooltips.mail);
    if (waterContainer) waterContainer.setAttribute('title', loc.tooltips.water);
    if (calendarContainer) calendarContainer.setAttribute('title', loc.tooltips.calendar);
    if (triviaContainer) triviaContainer.setAttribute('title', loc.tooltips.trivia);
    if (alarmContainer) alarmContainer.setAttribute('title', currentLang === 'en' ? 'Click to stop alarm' : '點擊停止鬧鐘並恢復科技球');
    if (laptopNotesTrigger) {
      const title = currentLang === 'en' ? 'Open laptop shortcuts' : '開啟筆電快捷功能';
      laptopNotesTrigger.title = title;
      laptopNotesTrigger.setAttribute('aria-label', title);
    }
    const laptopLabels = currentLang === 'en'
      ? { sticky: 'Sticky note' }
      : { sticky: '便利貼' };
    for (const button of laptopQuickMenu?.querySelectorAll('[data-laptop-action]') || []) {
      const label = button.querySelector('.laptop-action-label');
      const text = laptopLabels[button.dataset.laptopAction] || '';
      if (label) label.textContent = text;
      if (text) {
        button.dataset.fullLabel = text;
        button.dataset.largeLabel = text;
        button.title = text;
        button.setAttribute('aria-label', text);
      }
    }
    updateLaptopLabelDisplay();
    if (stickyNotesController) stickyNotesController.applyLanguage();
  };

  // Helper for safe HTML escaping
  const escapeHtml = (str) => {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  stickyNotesController = new StickyNotesController(ipcRenderer, () => currentLang);
  stickyNotesController.init();

  const closeLaptopMenu = (forceClose = false) => {
    if (!isAssistantVisible && forceClose !== true) return;
    laptopQuickMenu?.classList.remove('visible');
    bearCharacter?.classList.remove('shortcut-menu-open');
    laptopNotesTrigger?.setAttribute('aria-expanded', 'false');
  };

  function updateLaptopLabelDisplay() {
    const usesCompactLargeGrid = currentAssistantSize === 'lg' && laptopQuickMenu?.classList.contains('compact-overflow-actions');
    const showLabel = currentAssistantSize === 'lg' && !usesCompactLargeGrid;
    for (const button of laptopQuickMenu?.querySelectorAll('.laptop-quick-action') || []) {
      const labelNode = button.querySelector('.laptop-action-label');
      const fullLabel = button.dataset.fullLabel || button.title || labelNode?.textContent || '';
      if (!fullLabel || !labelNode) continue;
      button.dataset.fullLabel = fullLabel;
      const displayLabel = currentAssistantSize === 'lg' && button.dataset.largeLabel
        ? button.dataset.largeLabel
        : fullLabel;
      labelNode.textContent = showLabel ? displayLabel : '';
      button.title = fullLabel;
      button.setAttribute('aria-label', fullLabel);
    }
  }

  function updateLaptopGridPlacement() {
    const actions = [...(laptopQuickMenu?.querySelectorAll('.laptop-quick-action') || [])];
    const orderIndex = new Map(laptopShortcutOrder.map((key, index) => [key, index]));
    actions.sort((left, right) => {
      const leftIndex = orderIndex.has(left.dataset.shortcutOrderKey) ? orderIndex.get(left.dataset.shortcutOrderKey) : Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.has(right.dataset.shortcutOrderKey) ? orderIndex.get(right.dataset.shortcutOrderKey) : Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
    laptopShortcutOrder = actions.map(button => button.dataset.shortcutOrderKey);
    const isLarge = currentAssistantSize === 'lg';
    const usesCompactLargeGrid = isLarge && actions.length > 9;
    const rowLimit = isLarge ? 9 : 5;
    const cellWidth = usesCompactLargeGrid ? 24 : (isLarge ? 104 : (currentAssistantSize === 'mini' ? 24 : 25));
    const cellHeight = usesCompactLargeGrid ? 24 : (isLarge ? 25 : cellWidth);
    const gap = isLarge ? 2 : 3;
    const columnCount = Math.max(1, Math.ceil(actions.length / rowLimit));
    const menuWidth = (columnCount * cellWidth) + ((columnCount - 1) * gap) + 8;
    laptopQuickMenu?.classList.toggle('has-overflow-actions', columnCount > 1);
    laptopQuickMenu?.classList.toggle('compact-overflow-actions', usesCompactLargeGrid);
    if (laptopQuickMenu) {
      laptopQuickMenu.style.width = `${menuWidth}px`;
      laptopQuickMenu.style.gridTemplateColumns = `repeat(${columnCount}, ${cellWidth}px)`;
      laptopQuickMenu.style.gridAutoRows = `${cellHeight}px`;
      laptopQuickMenu.style.gap = `${gap}px`;
    }
    actions.forEach((button, index) => {
      const row = (index % rowLimit) + 1;
      const column = columnCount - Math.floor(index / rowLimit);
      button.style.setProperty('--shortcut-grid-row', String(row));
      button.style.setProperty('--shortcut-grid-column', String(column));
      button.style.gridRow = String(row);
      button.style.gridColumn = String(column);
      button.style.order = String(index);
    });
    updateLaptopLabelDisplay();
  }

  const getShortcutTextColor = color => {
    const hex = String(color || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return (red * 299 + green * 587 + blue * 114) / 1000 > 170 ? '#0f172a' : '#ffffff';
  };

  const createLaptopActionButton = ({ label, largeLabel = '', icon, iconColor = '', iconImageUrl = '', className = '', dataset = {} }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `laptop-quick-action ${className}`.trim();
    button.setAttribute('role', 'menuitem');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset.fullLabel = label;
    button.draggable = true;
    if (largeLabel) button.dataset.largeLabel = largeLabel;
    Object.assign(button.dataset, dataset);
    const iconNode = document.createElement('span');
    iconNode.className = 'laptop-action-icon';
    iconNode.setAttribute('aria-hidden', 'true');
    if (iconImageUrl) {
      const image = document.createElement('img');
      image.src = iconImageUrl;
      image.alt = '';
      image.draggable = false;
      iconNode.classList.add('has-image');
      iconNode.appendChild(image);
    } else {
      iconNode.textContent = icon;
    }
    if (iconColor) {
      iconNode.style.setProperty('--shortcut-logo-color', iconColor);
      iconNode.style.setProperty('--shortcut-logo-foreground', getShortcutTextColor(iconColor));
    }
    const labelNode = document.createElement('span');
    labelNode.className = 'laptop-action-label';
    const showLabel = currentAssistantSize === 'lg';
    const displayLabel = currentAssistantSize === 'lg' && largeLabel ? largeLabel : label;
    labelNode.textContent = showLabel ? displayLabel : '';
    button.append(iconNode, labelNode);
    return button;
  };

  const refreshLaptopShortcuts = async () => {
    if (!ipcRenderer || !laptopQuickMenu) return;
    try {
      const data = await ipcRenderer.invoke('laptop-get-shortcuts');
      const stickyIcon = laptopQuickMenu.querySelector('[data-laptop-action="sticky"] .laptop-action-icon');
      if (stickyIcon) {
        stickyIcon.replaceChildren();
        stickyIcon.classList.toggle('has-image', !!data?.fixedLogos?.sticky);
        if (data?.fixedLogos?.sticky) {
          const image = document.createElement('img');
          image.src = data.fixedLogos.sticky;
          image.alt = '';
          image.draggable = false;
          stickyIcon.appendChild(image);
        } else stickyIcon.textContent = '📝';
      }
      laptopShortcutOrder = Array.isArray(data?.order) ? data.order.map(String) : [];
      const accountActions = document.getElementById('laptop-account-actions');
      const shortcutActions = document.getElementById('laptop-shortcut-actions');
      accountActions?.replaceChildren();
      shortcutActions?.replaceChildren();
      for (const [index, account] of (data?.emailAccounts || []).entries()) {
        accountActions?.appendChild(createLaptopActionButton({
          label: account.name,
          icon: '✉',
          iconImageUrl: data?.fixedLogos?.[`email:${account.id}`] || '',
          className: 'action-email',
          dataset: { laptopAccountType: 'email', laptopAccountId: account.id, shortcutOrderKey: `email:${account.id}` }
        }));
      }
      for (const [index, calendar] of (data?.calendars || []).entries()) {
        accountActions?.appendChild(createLaptopActionButton({
          label: calendar.name,
          icon: '▦',
          iconImageUrl: data?.fixedLogos?.[`calendar:${calendar.id}`] || '',
          className: 'action-calendar',
          dataset: { laptopAccountType: 'calendar', laptopAccountId: calendar.id, shortcutOrderKey: `calendar:${calendar.id}` }
        }));
      }
      for (const shortcut of data?.shortcuts || []) {
        shortcutActions?.appendChild(createLaptopActionButton({
          label: shortcut.name,
          icon: shortcut.letter || 'A',
          iconColor: shortcut.color || '#0ea5e9',
          iconImageUrl: shortcut.logoUrl || '',
          className: 'action-custom',
          dataset: { shortcutId: shortcut.id, shortcutOrderKey: `custom:${shortcut.id}` }
        }));
      }
      updateLaptopGridPlacement();
    } catch (error) {
      console.warn('Unable to load laptop shortcuts:', error);
    }
  };

  const applyAssistantVisibility = (visible) => {
    isAssistantVisible = visible !== false;
    document.body.classList.toggle('assistant-hidden', !isAssistantVisible);
    document.querySelector('.assistant-visual-layer')?.setAttribute('aria-hidden', String(!isAssistantVisible));
    if (!isAssistantVisible) {
      if (laptopQuickMenu && laptopQuickMenu.parentElement !== petContainer) {
        petContainer.appendChild(laptopQuickMenu);
      }
      refreshLaptopShortcuts();
      laptopQuickMenu?.classList.add('visible');
      bearCharacter?.classList.add('shortcut-menu-open');
      laptopNotesTrigger?.setAttribute('aria-expanded', 'true');
    } else {
      if (laptopQuickMenu && laptopQuickMenuHome && laptopQuickMenu.parentElement !== laptopQuickMenuHome) {
        laptopQuickMenuHome.insertBefore(laptopQuickMenu, laptopNotesTrigger || null);
      }
      closeLaptopMenu(true);
    }
  };

  laptopNotesTrigger?.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = !laptopQuickMenu?.classList.contains('visible');
    laptopQuickMenu?.classList.toggle('visible', willOpen);
    bearCharacter?.classList.toggle('shortcut-menu-open', willOpen);
    laptopNotesTrigger.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
      refreshLaptopShortcuts();
      laptopQuickMenu?.querySelector('.laptop-quick-action')?.focus();
    }
  });

  laptopQuickMenu?.addEventListener('click', async event => {
    event.stopPropagation();
    if (suppressLaptopShortcutClick) {
      suppressLaptopShortcutClick = false;
      return;
    }
    const shortcutButton = event.target.closest('[data-shortcut-id]');
    if (shortcutButton && ipcRenderer) {
      const result = await ipcRenderer.invoke('laptop-open-shortcut', shortcutButton.dataset.shortcutId);
      if (!result?.ok) say(currentLang === 'en' ? 'Unable to open that shortcut.' : '無法開啟這個捷徑。', 2600);
      closeLaptopMenu();
      return;
    }
    const accountButton = event.target.closest('[data-laptop-account-id]');
    if (accountButton && ipcRenderer) {
      const result = await ipcRenderer.invoke('laptop-open-account', {
        type: accountButton.dataset.laptopAccountType,
        id: accountButton.dataset.laptopAccountId
      });
      if (!result?.ok) say(currentLang === 'en' ? 'Unable to open that account.' : '無法開啟這個帳號。', 2600);
      closeLaptopMenu();
      return;
    }
    const button = event.target.closest('[data-laptop-action]');
    if (!button) return;
    const action = button.dataset.laptopAction;
    closeLaptopMenu();
    if (action === 'sticky') {
      stickyNotesController?.openComposer();
      return;
    }
    if (!ipcRenderer) return;
    try {
      const result = await ipcRenderer.invoke('laptop-open-action', action);
      if (!result?.ok) throw new Error(result?.error || 'Unable to open shortcut');
    } catch (error) {
      console.error('Laptop shortcut failed:', error);
      say(currentLang === 'en' ? 'Unable to open that shortcut.' : '無法開啟這個快捷功能。', 2600);
    }
  });

  laptopQuickMenu?.addEventListener('dragstart', event => {
    const button = event.target.closest('.laptop-quick-action[data-shortcut-order-key]');
    if (!button) return;
    draggedLaptopShortcutKey = button.dataset.shortcutOrderKey;
    laptopDragOriginalOrder = [...laptopShortcutOrder];
    laptopDragCommitted = false;
    laptopDragPreviewIndex = laptopShortcutOrder.indexOf(draggedLaptopShortcutKey);
    button.classList.add('shortcut-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedLaptopShortcutKey);
  });

  laptopQuickMenu?.addEventListener('dragover', event => {
    if (!draggedLaptopShortcutKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const buttons = [...laptopQuickMenu.querySelectorAll('.laptop-quick-action[data-shortcut-order-key]')];
    if (!buttons.length) return;
    const closest = buttons.reduce((best, button) => {
      const rect = button.getBoundingClientRect();
      const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      return distance < best.distance ? { button, distance } : best;
    }, { button: buttons[0], distance: Number.POSITIVE_INFINITY }).button;
    let targetIndex = laptopShortcutOrder.indexOf(closest.dataset.shortcutOrderKey);
    targetIndex = Math.max(0, Math.min(buttons.length - 1, targetIndex));
    if (targetIndex === laptopDragPreviewIndex) return;
    const preview = laptopDragOriginalOrder.filter(key => key !== draggedLaptopShortcutKey);
    preview.splice(targetIndex, 0, draggedLaptopShortcutKey);
    laptopShortcutOrder = preview;
    laptopDragPreviewIndex = targetIndex;
    updateLaptopGridPlacement();
    laptopQuickMenu.querySelectorAll('.shortcut-drag-target').forEach(item => item.classList.remove('shortcut-drag-target'));
    buttons.find(button => button.dataset.shortcutOrderKey === draggedLaptopShortcutKey)?.classList.add('shortcut-drag-target');
  });

  laptopQuickMenu?.addEventListener('drop', async event => {
    if (!draggedLaptopShortcutKey) return;
    event.preventDefault();
    const keys = [...laptopShortcutOrder];
    laptopDragCommitted = true;
    suppressLaptopShortcutClick = true;
    if (ipcRenderer) await ipcRenderer.invoke('laptop-save-shortcut-order', keys);
  });

  laptopQuickMenu?.addEventListener('dragend', () => {
    if (!laptopDragCommitted && laptopDragOriginalOrder.length) {
      laptopShortcutOrder = [...laptopDragOriginalOrder];
      updateLaptopGridPlacement();
    }
    laptopQuickMenu.querySelectorAll('.shortcut-dragging, .shortcut-drag-target').forEach(item => {
      item.classList.remove('shortcut-dragging', 'shortcut-drag-target');
    });
    draggedLaptopShortcutKey = '';
    laptopDragOriginalOrder = [];
    laptopDragCommitted = false;
    laptopDragPreviewIndex = -1;
    window.setTimeout(() => { suppressLaptopShortcutClick = false; }, 120);
  });

  document.addEventListener('click', () => closeLaptopMenu());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeLaptopMenu();
  });

  const renderCalendarSticky = payload => {
    if (!calendarStickyBoard || !calendarStickyList) return;
    const events = Array.isArray(payload?.events) ? payload.events : [];
    calendarStickyCount.textContent = String(events.length);
    calendarStickyList.replaceChildren();
    for (const event of events) {
      const item = document.createElement('article');
      item.className = 'calendar-sticky-event';
      const when = document.createElement('div');
      when.className = 'calendar-sticky-when';
      when.textContent = `${event.date || ''}  ${event.time || ''}`.trim();
      const subject = document.createElement('strong');
      subject.className = 'calendar-sticky-subject';
      subject.textContent = event.summary || (currentLang === 'en' ? 'Untitled event' : '無標題行程');
      item.append(when, subject);
      if (event.description) {
        const description = document.createElement('p');
        description.className = 'calendar-sticky-description';
        description.textContent = event.description;
        item.appendChild(description);
      }
      calendarStickyList.appendChild(item);
    }
    calendarStickyBoard.classList.toggle('visible', payload?.enabled === true && events.length > 0);
  };

  const renderEmailSticky = payload => {
    if (!emailStickyBoard || !emailStickyList || !emailStickyCount) return;
    const emails = Array.isArray(payload?.emails) ? payload.emails : [];
    emailStickyCount.textContent = String(emails.length);
    emailStickyList.replaceChildren();
    for (const email of emails) {
      const item = document.createElement('article');
      item.className = 'email-sticky-item';
      item.classList.toggle('is-read', email.isUnread === false);
      const meta = document.createElement('div');
      meta.className = 'email-sticky-meta';
      const account = document.createElement('span');
      account.className = 'email-sticky-account';
      const accountName = email.accountName || (currentLang === 'en' ? 'Inbox' : '信箱');
      const readState = email.isUnread === false
        ? (currentLang === 'en' ? 'Read' : '已讀')
        : (currentLang === 'en' ? 'Unread' : '未讀');
      const categoryLabels = currentLang === 'en'
        ? { primary:'Primary', purchases:'Purchases', social:'Social', updates:'Updates', promotions:'Promotions', forums:'Forums' }
        : { primary:'主要郵件', purchases:'購物交易', social:'社群網路', updates:'最新快訊', promotions:'促銷內容', forums:'論壇' };
      const categoryText = categoryLabels[email.category];
      const customLabelText = Array.isArray(email.matchedCustomLabels) && email.matchedCustomLabels.length
        ? ` · 🏷 ${email.matchedCustomLabels.slice(0, 2).join('、')}`
        : '';
      account.textContent = `${accountName} · ${readState}${categoryText ? ` · ${categoryText}` : ''}${customLabelText}`;
      const time = document.createElement('time');
      const receivedAt = new Date(email.date);
      time.textContent = Number.isNaN(receivedAt.getTime()) ? '' : receivedAt.toLocaleString([], { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      meta.append(account, time);
      const from = document.createElement('span');
      from.className = 'email-sticky-from';
      from.textContent = email.fromName || email.fromAddress || (currentLang === 'en' ? 'Unknown sender' : '未知寄件者');
      const subject = document.createElement('strong');
      subject.className = 'email-sticky-subject';
      subject.textContent = email.subject || (currentLang === 'en' ? '(No subject)' : '（無主旨）');
      item.append(meta, from, subject);
      if (email.preview) {
        const preview = document.createElement('p');
        preview.className = 'email-sticky-preview';
        preview.textContent = email.preview;
        item.appendChild(preview);
      }
      emailStickyList.appendChild(item);
    }
    emailStickyBoard.classList.toggle('visible', payload?.enabled === true && emails.length > 0);
  };

  // 3. Audio Chime Synthesizers (Mail & Water Droplet - No external files needed)
  let audioCtx = null;
  const getAudioContext = () => {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioCtxClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  };

  const playMailChime = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      // Two-tone pleasant notification chime (659.25Hz -> 880Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.2, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);
    } catch (e) { }
  };

  const playWaterChime = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      // Crisp 3-tone water droplet pop / hydro chime
      [
        { freq: 880, start: 0, dur: 0.18 },
        { freq: 1174.66, start: 0.1, dur: 0.22 },
        { freq: 1760, start: 0.2, dur: 0.35 }
      ].forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(0.18, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } catch (e) { }
  };

  const playCalendarChime = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      // Gentle executive chime chord (E5, G#5, B5)
      [
        { freq: 659.25, start: 0, dur: 0.35, vol: 0.15 },
        { freq: 830.61, start: 0.08, dur: 0.4, vol: 0.18 },
        { freq: 987.77, start: 0.16, dur: 0.6, vol: 0.22 }
      ].forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(note.vol, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } catch (e) { }
  };

  const playTriviaChime = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      // Playful discovery chime (C5 -> E5 -> G5 -> C6 sparkle)
      [
        { freq: 523.25, start: 0, dur: 0.2, vol: 0.15 },
        { freq: 659.25, start: 0.08, dur: 0.2, vol: 0.16 },
        { freq: 783.99, start: 0.16, dur: 0.25, vol: 0.18 },
        { freq: 1046.50, start: 0.24, dur: 0.45, vol: 0.20 }
      ].forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(note.vol, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } catch (e) { }
  };

  // 4. Dynamic Click-Through Management (only feature controls are interactive)
  let isMoveModeActive = false;
  let lastInteractiveState = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  if (ipcRenderer) {
    window.addEventListener('mousemove', (e) => {
      const isOverFeatureControl = !!e.target.closest('#ball-canvas-container') ||
        !!e.target.closest('#mail-opened-container') ||
        !!e.target.closest('#water-bottle-container') ||
        !!e.target.closest('#calendar-orb-container') ||
        !!e.target.closest('#trivia-orb-container') ||
        !!e.target.closest('#alarm-orb-container') ||
        !!e.target.closest('#laptop-notes-trigger') ||
        !!e.target.closest('#laptop-quick-menu') ||
        !!e.target.closest('#sticky-notes-board') ||
        !!e.target.closest('#email-sticky-board') ||
        !!e.target.closest('#calendar-sticky-board') ||
        !!e.target.closest('#sticky-reopen-tab') ||
        !!e.target.closest('#speech-bubble');
      const isOverInteractive = isOverFeatureControl ||
        (isAssistantVisible && isMoveModeActive && (isDragging || !!e.target.closest('#bear-character')));

      if (isOverInteractive !== lastInteractiveState) {
        lastInteractiveState = isOverInteractive;
        if (isOverInteractive) {
          ipcRenderer.send('set-ignore-mouse-events', false);
        } else {
          ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        }
      }
    });

    const addInteractiveListeners = (el) => {
      if (!el) return;
      el.addEventListener('mouseenter', () => {
        if (!isMoveModeActive) {
          lastInteractiveState = true;
          ipcRenderer.send('set-ignore-mouse-events', false);
        }
      });
      el.addEventListener('mouseleave', () => {
        if (!isMoveModeActive) {
          lastInteractiveState = false;
          ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        }
      });
    };

    addInteractiveListeners(ballContainer);
    addInteractiveListeners(mailContainer);
    addInteractiveListeners(waterContainer);
    addInteractiveListeners(calendarContainer);
    addInteractiveListeners(triviaContainer);
    addInteractiveListeners(laptopNotesTrigger);
    addInteractiveListeners(laptopQuickMenu);
    addInteractiveListeners(stickyNotesBoard);
    addInteractiveListeners(emailStickyBoard);
    addInteractiveListeners(calendarStickyBoard);
    addInteractiveListeners(stickyReopenTab);
    addInteractiveListeners(alarmContainer);
    addInteractiveListeners(speechBubble);
  }

  // 5. Native Window Dragging for Desktop Pet (Active in Move Mode)
  bearCharacter?.addEventListener('mousedown', (e) => {
    if (!isAssistantVisible || !isMoveModeActive) return;
    if (e.target.closest('.ball-container') ||
        e.target.closest('.mail-opened-container') ||
        e.target.closest('.water-bottle-container') ||
        e.target.closest('.calendar-orb-container') ||
        e.target.closest('.trivia-orb-container') ||
        e.target.closest('.alarm-orb-container') ||
        e.target.closest('.laptop-notes-trigger') ||
        e.target.closest('.laptop-quick-menu') ||
        e.target.closest('.sticky-notes-board') ||
        e.target.closest('.email-sticky-board') ||
        e.target.closest('.calendar-sticky-board') ||
        e.target.closest('.sticky-reopen-tab') ||
        e.button !== 0) return;

    isDragging = true;
    dragOffset = { x: e.clientX, y: e.clientY };
    if (ipcRenderer) {
      ipcRenderer.send('window-drag-start', {
        mouseX: e.clientX,
        mouseY: e.clientY
      });
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    if (ipcRenderer) {
      ipcRenderer.send('window-move', {
        mouseX: dragOffset.x,
        mouseY: dragOffset.y
      });
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 6. Speech Bubble System
  let hideBubbleTimer = null;
  let bubbleEnabled = true;

  const say = (text, duration = 3500) => {
    if (!bubbleEnabled || !speechBubble || !speechText) return;
    // Quotes and settings feedback must not replace a live reminder or its timer.
    if (hasNotification()) return;

    speechBubble.classList.remove('mail-mode');
    speechText.textContent = text;
    speechBubble.classList.add('show');

    if (hideBubbleTimer) clearTimeout(hideBubbleTimer);
    hideBubbleTimer = setTimeout(() => {
      speechBubble.classList.remove('show');
    }, duration);
  };

  // 7. Mail Notification Handling
  let hasUnreadMail = false;
  let hasWaterReminder = false;
  let hasCalendarReminder = false;
  let hasTriviaReminder = false;
  let hasActiveAlarm = false;
  let isFocusModeActive = false;
  const hasNotification = () => hasUnreadMail || hasWaterReminder || hasCalendarReminder || hasTriviaReminder || hasActiveAlarm;
  let notificationSyncPending = false;
  let lastNotificationActive = null;
  const syncNotificationActive = () => {
    if (notificationSyncPending) return;
    notificationSyncPending = true;
    // Switching reminder types resets the old one before showing the new one.
    // Report only the final state to avoid briefly lowering the window between them.
    queueMicrotask(() => {
      notificationSyncPending = false;
      const active = hasNotification();
      if (active === lastNotificationActive) return;
      lastNotificationActive = active;
      ipcRenderer?.send('set-notification-active', active);
    });
  };
  syncNotificationActive();
  let alarmAudio = null;
  let alarmFallbackAudio = null;
  let alarmObjectUrls = [];
  let alarmInterval = null;
  let alarmStopTimer = null;
  let alarmFrame = null;
  let alarmYoutubeListener = null;

  const stopAlarmSound = () => {
    if (alarmInterval) clearInterval(alarmInterval);
    if (alarmStopTimer) clearTimeout(alarmStopTimer);
    alarmInterval = null;
    alarmStopTimer = null;
    if (alarmAudio) { alarmAudio.pause(); alarmAudio.src = ''; alarmAudio = null; }
    if (alarmFallbackAudio) { alarmFallbackAudio.pause(); alarmFallbackAudio.src = ''; alarmFallbackAudio = null; }
    for (const url of alarmObjectUrls) URL.revokeObjectURL(url);
    alarmObjectUrls = [];
    if (alarmFrame) { alarmFrame.remove(); alarmFrame = null; }
    if (alarmYoutubeListener) { window.removeEventListener('message', alarmYoutubeListener); alarmYoutubeListener = null; }
  };

  const getYoutubeId = value => {
    try {
      const url = new URL(value);
      if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('/')[0];
      if (url.hostname.includes('youtube.com')) return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
    } catch (error) { }
    return '';
  };

  const startAlarmSound = config => {
    stopAlarmSound();
    // Audio playback is owned exclusively by AlarmService in the Electron
    // main process. The renderer only controls visuals and auto-stop timing.
    if (config.duration !== 'continuous') {
      alarmStopTimer = setTimeout(() => resetAlarmState(false), Number(config.duration || 1) * 60000);
    }
  };

  const showAlarm = data => {
    if (hasWaterReminder) resetWaterState(false);
    if (hasCalendarReminder) resetCalendarState(false);
    if (hasTriviaReminder) resetTriviaState(false);
    if (hasUnreadMail) resetMailState(false);
    hasActiveAlarm = true;
    syncNotificationActive();
    if (hideBubbleTimer) clearTimeout(hideBubbleTimer);
    // The assistant window normally passes clicks through transparent areas.
    // Keep it interactive for the full alarm period so the orb always stops.
    ipcRenderer?.send('set-alarm-active', true);
    lastInteractiveState = true;
    bearCharacter.classList.add('has-alarm');
    alarmContainer?.classList.add('active');
    const titles = (data.notes || []).map(note => note.title).filter(Boolean);
    stickyNotesController?.highlightAlarmNotes((data.notes || []).map(note => note.id));
    speechBubble?.classList.remove('mail-mode', 'calendar-mode', 'trivia-mode');
    if (speechText) speechText.textContent = `${currentLang === 'en' ? '⏰ Alarm' : '⏰ 鬧鐘時間到'}${titles.length ? `：${titles.join('、')}` : ''}`;
    speechBubble?.classList.add('show');
    startAlarmSound(data.config || {});
  };

  const resetAlarmState = (showToast = false) => {
    if (!hasActiveAlarm) return;
    hasActiveAlarm = false;
    syncNotificationActive();
    stopAlarmSound();
    stickyNotesController?.clearAlarmHighlights();
    bearCharacter.classList.remove('has-alarm');
    alarmContainer?.classList.remove('active');
    speechBubble?.classList.remove('show');
    // Stopping an alarm must always reach the main-process audio owner. Move
    // mode only affects mouse pass-through and must not suppress this command.
    ipcRenderer?.send('set-alarm-active', false);
    if (!isMoveModeActive) {
      lastInteractiveState = false;
    }
    if (showToast) setTimeout(() => say(currentLang === 'en' ? 'Alarm stopped. Technology orb restored.' : '鬧鐘已停止，科技球恢復囉！', 2200), 120);
  };

  const showMailNotification = (emailData) => {
    if (hasActiveAlarm) resetAlarmState(false);
    if (hasWaterReminder) resetWaterState(false);
    if (hasCalendarReminder) resetCalendarState(false);
    if (hasTriviaReminder) resetTriviaState(false);

    hasUnreadMail = true;
    syncNotificationActive();
    bearCharacter.classList.add('has-mail');
    if (mailContainer) mailContainer.classList.add('active');

    // Play chime sound
    if (emailData.soundEnabled !== false) {
      playMailChime();
    }

    const emailList = Array.isArray(emailData.emails) && emailData.emails.length > 0
      ? [...emailData.emails].reverse()
      : (emailData.latest ? [emailData.latest] : []);

    const isRepeated = !!emailData.isRepeated;
    const totalCount = emailData.count || emailList.length || 1;
    const loc = getLoc();

    if (speechBubble && speechText) {
      speechBubble.classList.add('mail-mode');
      const headerTitle = isRepeated
        ? loc.mail.reminderHeader(totalCount)
        : loc.mail.newMailHeader(totalCount);

      let itemsHtml = '';
      if (emailList.length === 1) {
        const item = emailList[0];
        const from = escapeHtml(item.fromName || item.fromAddress || item.from || loc.mail.unknownSender);
        const subject = escapeHtml(item.subject || loc.mail.noSubject);
        const accountTag = item.accountName ? `<span class="mail-account-badge" title="${escapeHtml(item.accountName)}">${escapeHtml(item.accountName)}</span>` : '';
        itemsHtml = `
          <div class="mail-item single">
            <div class="mail-item-header">
              <span class="mail-item-badge">NEW</span>
              ${accountTag}
              <span class="mail-notify-sender" title="${from}">${loc.mail.fromLabel}${from}</span>
            </div>
            <div class="mail-notify-subject" title="${subject}">${loc.mail.subjectLabel}${subject}</div>
          </div>
        `;
      } else if (emailList.length > 1) {
        const displayList = emailList.slice(0, 3);
        itemsHtml = '<div class="mail-list-container">' + displayList.map(item => {
          const from = escapeHtml(item.fromName || item.fromAddress || item.from || loc.mail.unknownSender);
          const subject = escapeHtml(item.subject || loc.mail.noSubject);
          const accountTag = item.accountName ? `<span class="mail-account-badge" title="${escapeHtml(item.accountName)}">${escapeHtml(item.accountName)}</span>` : '';
          return `
            <div class="mail-item">
              <div class="mail-item-header">
                <span class="mail-item-badge">NEW</span>
                ${accountTag}
                <span class="mail-notify-sender" title="${from}">${from}</span>
              </div>
              <div class="mail-notify-subject" title="${subject}">${subject}</div>
            </div>
          `;
        }).join('');

        if (totalCount > 3) {
          itemsHtml += `<div class="mail-more-hint">${loc.mail.moreUnread(totalCount - 3)}</div>`;
        }
        itemsHtml += '</div>';
      }

      const headerIcon = isRepeated ? '🔔' : (totalCount > 1 ? '📬' : '✉️');
      speechText.innerHTML = `
        <div class="mail-notify-header">
          <span>${headerIcon}</span>
          <span>${headerTitle}</span>
        </div>
        ${itemsHtml}
      `;

      speechBubble.classList.add('show');

      if (hideBubbleTimer) clearTimeout(hideBubbleTimer);
      const duration = emailList.length > 1 ? 18000 : 12000;
      hideBubbleTimer = setTimeout(() => {
        resetMailState(false);
      }, duration);
    }
  };

  const resetMailState = (showToast = false) => {
    if (hasUnreadMail) {
      hasUnreadMail = false;
      syncNotificationActive();
      bearCharacter.classList.remove('has-mail');
      if (mailContainer) mailContainer.classList.remove('active');
      if (speechBubble) {
        speechBubble.classList.remove('show');
        setTimeout(() => speechBubble.classList.remove('mail-mode'), 300);
      }
      if (showToast) {
        say(getLoc().speech.mailRestored, 2000);
      }
    }
  };

  // 8. Hydration & Sedentary Health Reminder Handling (Switches globe to Cyber Sports Water Bottle)
  const showHealthReminder = (healthData = {}) => {
    if (hasActiveAlarm) resetAlarmState(false);
    if (hasUnreadMail) resetMailState(false);
    if (hasCalendarReminder) resetCalendarState(false);
    if (hasTriviaReminder) resetTriviaState(false);

    hasWaterReminder = true;
    syncNotificationActive();
    bearCharacter.classList.add('has-water');
    if (waterContainer) waterContainer.classList.add('active');

    if (healthData.soundEnabled !== false) {
      playWaterChime();
    }

    const remarks = getLoc().speech.healthRemarks || [
      '🍵 溫馨提醒：已經專注工作一陣子囉，喝口水、站起來伸展一下吧！',
      '💧 補充水分時間到！讓身體與大腦保持清醒活躍 🌊'
    ];
    const message = healthData.message || remarks[Math.floor(Math.random() * remarks.length)];

    if (speechBubble && speechText) {
      speechBubble.classList.remove('mail-mode', 'calendar-mode', 'trivia-mode');
      speechText.textContent = message;
      speechBubble.classList.add('show');

      if (hideBubbleTimer) clearTimeout(hideBubbleTimer);
      // Auto-restore to 3D rotating globe after reminder ends
      hideBubbleTimer = setTimeout(() => {
        resetWaterState(false);
      }, 8500);
    }
  };

  const resetWaterState = (showToast = false) => {
    if (hasWaterReminder) {
      hasWaterReminder = false;
      syncNotificationActive();
      bearCharacter.classList.remove('has-water');
      if (waterContainer) waterContainer.classList.remove('active');
      if (speechBubble) {
        speechBubble.classList.remove('show');
      }
      if (showToast) {
        setTimeout(() => {
          say(getLoc().speech.waterRestored, 2200);
        }, 120);
      }
    }
  };

  // Click on opened mail restores the ball
  if (mailContainer) {
    mailContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      resetMailState(true);
    });
  }
  alarmContainer?.addEventListener('click', event => { event.stopPropagation(); resetAlarmState(true); });

  // Click on water bottle restores the ball
  if (waterContainer) {
    waterContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      resetWaterState(true);
    });
  }

  // Click on calendar orb restores the ball
  if (calendarContainer) {
    calendarContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      resetCalendarState(true);
    });
  }

  // Click on trivia lightbulb orb restores the ball
  if (triviaContainer) {
    triviaContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      resetTriviaState(true);
    });
  }

  // 8.5. Calendar & Meeting Reminder Handling (Switches globe to Cyber Calendar Orb)
  const showCalendarReminder = (reminderData = {}) => {
    if (hasActiveAlarm) resetAlarmState(false);
    if (hasWaterReminder) resetWaterState(false);
    if (hasUnreadMail) resetMailState(false);
    if (hasTriviaReminder) resetTriviaState(false);

    hasCalendarReminder = true;
    syncNotificationActive();
    bearCharacter.classList.add('has-calendar');
    if (calendarContainer) calendarContainer.classList.add('active');

    if (reminderData.soundEnabled !== false) {
      playCalendarChime();
    }

    const loc = getLoc();
    if (!speechBubble || !speechText) return;

    speechBubble.classList.remove('mail-mode', 'trivia-mode');
    speechBubble.classList.add('calendar-mode');

    let headerText = loc.calendar.overviewHeader;
    let contentHtml = '';

    if (reminderData.type === 'connection-test') {
      headerText = currentLang === 'en' ? 'Calendar connection test succeeded' : '行事曆連線測試成功';
      const events = Array.isArray(reminderData.events) ? reminderData.events : [];
      const calColor = reminderData.calendarColor || '#38bdf8';
      const calendarName = escapeHtml(reminderData.calendarName || (currentLang === 'en' ? 'Calendar' : '行事曆'));
      const countText = currentLang === 'en'
        ? `Today ${Number(reminderData.todayCount) || 0}, tomorrow ${Number(reminderData.tomorrowCount) || 0}`
        : `今日 ${Number(reminderData.todayCount) || 0} 筆，明日 ${Number(reminderData.tomorrowCount) || 0} 筆`;
      const preview = events.length ? events.map(ev => `
        <div class="cal-item" style="border-left-color:${calColor};">
          <div class="cal-item-header"><span class="cal-item-time">${escapeHtml(ev.timeLabel || '')}</span></div>
          <div class="cal-item-title">${escapeHtml(ev.summary || '')}</div>
        </div>`).join('') : `<div class="mail-more-hint">${currentLang === 'en' ? 'Connection is working; no events today or tomorrow.' : '連線正常，今日與明日目前沒有行程。'}</div>`;
      contentHtml = `<div class="cal-section-tag"><span class="cal-tag-pill" style="background:${calColor}33;color:${calColor};">${calendarName}</span> ${countText}</div><div class="cal-list-container">${preview}</div>`;
    } else if (reminderData.type === 'upcoming') {
      headerText = loc.calendar.upcomingHeader;
      const events = Array.isArray(reminderData.events) ? reminderData.events : [];
      if (events.length > 0) {
        contentHtml = '<div class="cal-list-container">' + events.map(ev => {
          const calColor = ev.calendarColor || '#38bdf8';
          const title = escapeHtml(ev.summary);
          const time = escapeHtml(ev.timeLabel || '');
          const locText = ev.location ? `<div class="cal-item-loc">📍 ${escapeHtml(ev.location)}</div>` : '';
          const tag = ev.calendarName ? `<span class="cal-tag-pill" style="background: ${calColor}33; color: ${calColor};">${escapeHtml(ev.calendarName)}</span>` : '';
          return `
            <div class="cal-item" style="border-left-color: ${calColor};">
              <div class="cal-item-header">
                ${tag}
                <span class="cal-item-time">${time}</span>
              </div>
              <div class="cal-item-title">${title}</div>
              ${locText}
            </div>
          `;
        }).join('') + '</div>';
      }
    } else {
      // Overview Mode (Today + Tomorrow Preview)
      const todayList = Array.isArray(reminderData.todayEvents) ? reminderData.todayEvents : [];
      const tomorrowList = Array.isArray(reminderData.tomorrowEvents) ? reminderData.tomorrowEvents : [];

      let todayHtml = '';
      if (todayList.length === 0) {
        todayHtml = `<div class="mail-more-hint">${loc.calendar.noEventsToday}</div>`;
      } else {
        todayHtml = todayList.slice(0, 3).map(ev => {
          const calColor = ev.calendarColor || '#38bdf8';
          const title = escapeHtml(ev.summary);
          const time = escapeHtml(ev.timeLabel || '');
          const tag = ev.calendarName ? `<span class="cal-tag-pill" style="background: ${calColor}33; color: ${calColor};">${escapeHtml(ev.calendarName)}</span>` : '';
          return `
            <div class="cal-item" style="border-left-color: ${calColor};">
              <div class="cal-item-header">
                ${tag}
                <span class="cal-item-time">${time}</span>
              </div>
              <div class="cal-item-title">${title}</div>
            </div>
          `;
        }).join('');
      }

      let tomorrowHtml = '';
      if (reminderData.isTomorrowPreviewActive && tomorrowList.length > 0) {
        tomorrowHtml = `<div class="cal-section-tag">🌙 ${loc.calendar.tomorrowHeader(tomorrowList.length)}</div>` +
          tomorrowList.slice(0, 2).map(ev => {
            const calColor = ev.calendarColor || '#fbbf24';
            const title = escapeHtml(ev.summary);
            const time = escapeHtml(ev.timeLabel || '');
            const tag = ev.calendarName ? `<span class="cal-tag-pill" style="background: ${calColor}33; color: ${calColor};">${escapeHtml(ev.calendarName)}</span>` : '';
            return `
              <div class="cal-item" style="border-left-color: ${calColor};">
                <div class="cal-item-header">
                  ${tag}
                  <span class="cal-item-time">${time}</span>
                </div>
                <div class="cal-item-title">${title}</div>
              </div>
            `;
          }).join('');
      }

      contentHtml = `
        <div class="cal-section-tag">☀️ ${loc.calendar.todayHeader(todayList.length)}</div>
        <div class="cal-list-container">
          ${todayHtml}
          ${tomorrowHtml}
        </div>
      `;
    }

    speechText.innerHTML = `
      <div class="cal-notify-header">
        <span>📅</span>
        <span>${headerText}</span>
      </div>
      ${contentHtml}
    `;

    speechBubble.classList.add('show');

    if (hideBubbleTimer) clearTimeout(hideBubbleTimer);
    const duration = reminderData.type === 'upcoming' ? 14000 : 18000;
    hideBubbleTimer = setTimeout(() => {
      resetCalendarState(false);
    }, duration);
  };

  const resetCalendarState = (showToast = false) => {
    if (hasCalendarReminder) {
      hasCalendarReminder = false;
      syncNotificationActive();
      bearCharacter.classList.remove('has-calendar');
      if (calendarContainer) calendarContainer.classList.remove('active');
      if (speechBubble) {
        speechBubble.classList.remove('show');
        setTimeout(() => speechBubble.classList.remove('calendar-mode'), 300);
      }
      if (showToast) {
        setTimeout(() => {
          say(getLoc().speech.calendarRestored, 2200);
        }, 120);
      }
    }
  };

  // 8.6. Online Trivia & Clean Humor Joke Handling (Switches globe to Cyber Wisdom Lightbulb Orb)
  const showTriviaReminder = (triviaData = {}) => {
    if (hasActiveAlarm) resetAlarmState(false);
    if (hasWaterReminder) resetWaterState(false);
    if (hasUnreadMail) resetMailState(false);
    if (hasCalendarReminder) resetCalendarState(false);

    hasTriviaReminder = true;
    syncNotificationActive();
    bearCharacter.classList.add('has-trivia');
    if (triviaContainer) triviaContainer.classList.add('active');

    if (triviaData.soundEnabled !== false) {
      playTriviaChime();
    }

    const loc = getLoc();
    if (!speechBubble || !speechText) return;

    speechBubble.classList.remove('mail-mode', 'calendar-mode');
    speechBubble.classList.add('trivia-mode');

    const headerText = triviaData.type === 'fact' ? loc.trivia.factHeader : loc.trivia.jokeHeader;
    const catLabel = escapeHtml(triviaData.categoryLabel || '');
    const bodyContent = triviaData.punchline && triviaData.setup
      ? escapeHtml(triviaData.setup)
      : escapeHtml(triviaData.content || '');
    const punchline = triviaData.punchline ? `<div class="triv-punchline">👉 ${escapeHtml(triviaData.punchline)}</div>` : '';

    speechText.innerHTML = `
      <div class="triv-notify-header">
        <span>${headerText}</span>
        ${catLabel ? `<span class="triv-category-pill">${catLabel}</span>` : ''}
      </div>
      <div class="triv-content">${bodyContent}</div>
      ${punchline}
    `;

    speechBubble.classList.add('show');

    if (hideBubbleTimer) clearTimeout(hideBubbleTimer);
    const duration = triviaData.type === 'fact' ? 16000 : 14000;
    hideBubbleTimer = setTimeout(() => {
      resetTriviaState(false);
    }, duration);
  };

  const resetTriviaState = (showToast = false) => {
    if (hasTriviaReminder) {
      hasTriviaReminder = false;
      syncNotificationActive();
      bearCharacter.classList.remove('has-trivia');
      if (triviaContainer) triviaContainer.classList.remove('active');
      if (speechBubble) {
        speechBubble.classList.remove('show');
        setTimeout(() => speechBubble.classList.remove('trivia-mode'), 300);
      }
      if (showToast) {
        setTimeout(() => {
          say(getLoc().speech.triviaRestored, 2200);
        }, 120);
      }
    }
  };

  speechBubble.addEventListener('click', () => {
    if (hasActiveAlarm) {
      resetAlarmState(true);
    } else if (hasTriviaReminder) {
      resetTriviaState(true);
    } else if (hasCalendarReminder) {
      resetCalendarState(true);
    } else if (hasUnreadMail) {
      resetMailState(true);
    } else if (hasWaterReminder) {
      resetWaterState(true);
    }
  });

  // 9. The assistant menu is intentionally exclusive to the technology ball.
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ipcRenderer && e.target.closest('#ball-canvas-container')) {
      ipcRenderer.send('show-context-menu');
    }
  });

  // 11. IPC Listeners from Electron Tray & Main Process
  if (ipcRenderer) {
    ipcRenderer.on('new-email-received', (event, emailData) => {
      if (isFocusModeActive && !emailData?.isManual) return;
      showMailNotification(emailData);
    });

    ipcRenderer.on('health-reminder', (event, healthData) => {
      if (isFocusModeActive) return;
      showHealthReminder(healthData);
    });

    ipcRenderer.on('calendar-reminder', (event, reminderData) => {
      if (isFocusModeActive && !['overview', 'connection-test'].includes(reminderData?.type)) return;
      showCalendarReminder(reminderData);
    });

    ipcRenderer.on('calendar-sticky-updated', (event, data) => renderCalendarSticky(data));
    ipcRenderer.on('email-sticky-updated', (event, data) => renderEmailSticky(data));
    ipcRenderer.on('panel-opacity-updated', (event, values = {}) => {
      document.documentElement.style.setProperty('--todo-panel-opacity', String(values.todo ?? 1));
      document.documentElement.style.setProperty('--calendar-panel-opacity', String(values.calendar ?? 1));
      document.documentElement.style.setProperty('--email-panel-opacity', String(values.email ?? 1));
      document.documentElement.style.setProperty('--shortcut-opacity', String(values.shortcut ?? 1));
      document.documentElement.style.setProperty('--assistant-opacity', String(values.assistant ?? 1));
      const assistantVisualLayer = document.querySelector('.assistant-visual-layer');
      if (assistantVisualLayer) assistantVisualLayer.style.filter = `opacity(${values.assistant ?? 1})`;
      if (speechBubble) speechBubble.style.filter = `opacity(${values.assistant ?? 1})`;
    });

    ipcRenderer.on('settings-window-visibility', (event, isVisible) => {
      if (isVisible) {
        refreshLaptopShortcuts();
        laptopQuickMenu?.classList.add('visible');
        bearCharacter?.classList.add('shortcut-menu-open');
        laptopNotesTrigger?.setAttribute('aria-expanded', 'true');
      } else {
        closeLaptopMenu();
      }
    });

    ipcRenderer.on('assistant-visibility-changed', (event, visible) => {
      applyAssistantVisibility(visible);
    });

    ipcRenderer.on('trivia-reminder', (event, triviaData) => {
      if (isFocusModeActive && !triviaData?.isManual) return;
      showTriviaReminder(triviaData);
    });

    ipcRenderer.on('focus-mode-updated', (event, state = {}) => {
      isFocusModeActive = state.active === true;
      document.body.classList.toggle('focus-mode-active', isFocusModeActive);
      if (isFocusModeActive) {
        resetMailState(false);
        resetWaterState(false);
        resetCalendarState(false);
        resetTriviaState(false);
      }
    });

    ipcRenderer.on('update-status', (event, state = {}) => {
      if (state.status === 'downloaded') {
        say(currentLang === 'en'
          ? `Version ${state.version} is ready and will install after restart.`
          : `${state.version} 版已下載完成，重新啟動後會自動安裝。`, 5000);
        return;
      }
      if (!state.manual) return;
      const messages = currentLang === 'en'
        ? {
            checking: 'Checking for updates… 🔍',
            current: 'You already have the latest version. ✅',
            available: `Version ${state.version} is available and downloading now. ⬇️`,
            error: 'Unable to check for updates. Please check your connection and try again. ⚠️',
            development: 'Update checks are available only in the installed app.',
            portable: 'Automatic updates are unavailable in the portable edition.'
          }
        : {
            checking: '正在檢查更新… 🔍',
            current: '目前已是最新版本。✅',
            available: `已找到 ${state.version} 版，現在開始下載。⬇️`,
            error: '無法檢查更新，請確認網路後再試一次。⚠️',
            development: '只有安裝版可以檢查更新。',
            portable: '免安裝版不支援自動更新。'
          };
      if (messages[state.status]) say(messages[state.status], state.status === 'checking' ? 2500 : 4000);
    });

    ipcRenderer.on('trivia-fetch-failed', (event, data) => {
      if (isFocusModeActive) return;
      say(data && data.message ? data.message : getLoc().trivia.noNetwork, 3500);
    });

    ipcRenderer.on('alarm-triggered', (event, data) => showAlarm(data || {}));
    ipcRenderer.on('alarm-stopped', () => resetAlarmState(false));

    ipcRenderer.on('boost-ball', () => {
      ballRenderer.boostSpin();
    });

    let isAppReady = false;

    ipcRenderer.on('toggle-quotes', () => {
      bubbleEnabled = !bubbleEnabled;
      const msg = bubbleEnabled ? getLoc().speech.bubbleEnabled : getLoc().speech.bubbleDisabled;
      say(msg, 2000);
    });

    ipcRenderer.on('set-quotes-enabled', (event, enabled, isInit) => {
      bubbleEnabled = enabled !== false;
      if (!isInit && isAppReady) {
        const msg = bubbleEnabled ? getLoc().speech.bubbleEnabled : getLoc().speech.bubbleDisabled;
        say(msg, 2000);
      }
    });

    ipcRenderer.on('set-ball-speed', (event, speed, isInit) => {
      ballRenderer.setSpeedMultiplier(speed);
      if (!isInit && isAppReady) {
        say(getLoc().speech.speedSet(speed), 2500);
      }
    });

    function applyBubbleFontSize(sizeKey) {
      if (!['sm', 'std', 'lg', 'xl'].includes(sizeKey)) sizeKey = 'std';
      document.body.classList.remove('font-sm', 'font-std', 'font-lg', 'font-xl');
      document.body.classList.add(`font-${sizeKey}`);
    }

    ipcRenderer.on('font-size-updated', (event, sizeKey, isInit) => {
      applyBubbleFontSize(sizeKey);
      if (!isInit && isAppReady) {
        const labels = {
          sm: currentLanguage === 'en' ? 'Compact' : '精簡小字',
          std: currentLanguage === 'en' ? 'Standard' : '標準',
          lg: currentLanguage === 'en' ? 'Large' : '清晰大字',
          xl: currentLanguage === 'en' ? 'Extra Large' : '特大醒目'
        };
        say(getLoc().speech.fontSet(labels[sizeKey] || sizeKey), 2000);
      }
    });

    function applyStickyNotesSize(sizeKey, boardWidth) {
      if (!['sm', 'std', 'lg'].includes(sizeKey)) sizeKey = 'std';
      document.body.classList.remove('sticky-size-sm', 'sticky-size-std', 'sticky-size-lg');
      document.body.classList.add(`sticky-size-${sizeKey}`);
      if (Number.isFinite(Number(boardWidth)) && Number(boardWidth) > 0) {
        document.documentElement.style.setProperty('--sticky-board-width', `${Number(boardWidth)}px`);
      }
    }

    ipcRenderer.on('sticky-size-updated', (event, data) => {
      const sizeKey = data && data.sizeKey ? data.sizeKey : 'std';
      applyStickyNotesSize(sizeKey, data && data.boardWidth);
      if (data && !data.isInit && isAppReady) {
        const labels = {
          sm: currentLanguage === 'en' ? 'Small' : '小型',
          std: currentLanguage === 'en' ? 'Standard' : '標準',
          lg: currentLanguage === 'en' ? 'Large' : '大型'
        };
        say(currentLanguage === 'en'
          ? `Sticky notes set to ${labels[sizeKey] || sizeKey}`
          : `便利貼已設為${labels[sizeKey] || sizeKey}`, 2000);
      }
    });

    ipcRenderer.on('size-updated', (event, data) => {
      if (data && data.bearSize) {
        document.documentElement.style.setProperty('--bear-size', `${data.bearSize}px`);
      }
      if (data && data.sizeKey) {
        currentAssistantSize = data.sizeKey;
        document.body.classList.remove('size-mini', 'size-std', 'size-lg');
        document.body.classList.add(`size-${data.sizeKey}`);
        updateLaptopLabelDisplay();
        updateLaptopGridPlacement();
      }
      setTimeout(() => ballRenderer.onResize(), 60);
      if (data && !data.isInit && isAppReady) {
        say(getLoc().speech.sizeSet(data.label || '新尺寸'), 2000);
      }
    });

    ipcRenderer.on('scale-updated', (event, scale) => {
      setTimeout(() => ballRenderer.onResize(), 50);
    });

    ipcRenderer.on('dock-side-changed', (event, dockSide) => {
      if (dockSide === 'left') {
        petContainer.classList.remove('dock-right');
        petContainer.classList.add('dock-left');
      } else {
        petContainer.classList.remove('dock-left');
        petContainer.classList.add('dock-right');
      }
    });

    ipcRenderer.on('move-mode-changed', (event, isMoveMode, isInit = false) => {
      isMoveModeActive = isMoveMode;
      lastInteractiveState = null;
      if (isMoveMode) {
        petContainer.classList.add('move-mode');
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        if (!isInit) say(getLoc().speech.moveModeOn, 3000);
      } else {
        petContainer.classList.remove('move-mode');
        if (!isInit) say(getLoc().speech.moveModeOff, 3000);
      }
    });

    ipcRenderer.on('language-changed', (event, lang, isInit) => {
      applyLanguage(lang);
      if (!isInit && isAppReady) {
        say(getLoc().speech.languageChanged, 2500);
      }
    });

    // Fetch initial language, dialogue font size, and sticky-note size silently
    try {
      const [initialLang, initialFontSize, initialStickySize, initialFocusMode] = await Promise.all([
        ipcRenderer.invoke('get-language'),
        ipcRenderer.invoke('get-bubble-font-size'),
        ipcRenderer.invoke('get-sticky-notes-size'),
        ipcRenderer.invoke('get-focus-mode')
      ]);
      if (initialLang) applyLanguage(initialLang);
      if (initialFontSize) applyBubbleFontSize(initialFontSize);
      if (initialStickySize) applyStickyNotesSize(initialStickySize);
      if (initialFocusMode) {
        isFocusModeActive = initialFocusMode.active === true;
        document.body.classList.toggle('focus-mode-active', isFocusModeActive);
      }
    } catch (e) { }

    setTimeout(() => {
      isAppReady = true;
    }, 400);
  }

  // Initial greeting (Warm welcome every time assistant starts)
  setTimeout(() => {
    say(getLoc().speech.greeting, 4000);
  }, 100);

  console.log('🐻 METech Assistant initialized with Health & Email support!');
});
