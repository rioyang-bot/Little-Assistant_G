const { contextBridge, ipcRenderer, webUtils } = require('electron');

const VALID_SEND_CHANNELS = [
  'set-ignore-mouse-events',
  'set-alarm-active',
  'set-notification-active',
  'window-move',
  'window-drag-start',
  'set-size',
  'set-scale',
  'show-context-menu',
  'ball-speed-changed',
  'open-email-settings',
  'close-app',
  'minimize-app'
];

const VALID_INVOKE_CHANNELS = [
  'organizer-get', 'organizer-update', 'organizer-add', 'organizer-position', 'organizer-layout', 'organizer-drag-out',
  'organizer-remove', 'organizer-open', 'organizer-icon', 'organizer-hide', 'organizer-delete', 'organizer-resize', 'organizer-background',
  'organizer-context-menu', 'organizer-rename',
  'organizer-settings-open', 'organizer-settings-close', 'organizer-settings-preview',
  'get-language',
  'get-assistant-settings',
  'set-assistant-settings',
  'get-app-version',
  'natural-language-create',
  'set-language',
  'get-focus-mode',
  'set-focus-mode',
  'get-update-settings',
  'set-update-settings',
  'check-for-updates',
  'install-update',
  'health-test-reminder',
  'email-get-config',
  'email-save-config',
  'email-test-connection',
  'email-test-all',
  'email-list-labels',
  'email-check-now',
  'calendar-get-config',
  'calendar-save-config',
  'calendar-test-connection',
  'calendar-check-now',
  'trivia-get-config',
  'trivia-save-config',
  'trivia-fetch-now',
  'trivia-test-reminder',
  'knowledge-cards-get-config',
  'knowledge-cards-save-config',
  'knowledge-cards-add',
  'knowledge-cards-test-reminder',
  'sticky-notes-list',
  'sticky-notes-save-view',
  'sticky-notes-create',
  'sticky-notes-update',
  'sticky-notes-complete',
  'sticky-notes-update-item',
  'alarm-get-config',
  'alarm-save-config',
  'alarm-choose-audio',
  'alarm-test',
  'alarm-stop-test',
  'get-bubble-font-size',
  'set-bubble-font-size',
  'get-sticky-notes-size',
  'set-sticky-notes-size',
  'get-panel-opacity',
  'preview-panel-opacity',
  'set-panel-opacity',
  'laptop-get-shortcuts',
  'laptop-save-shortcut-order',
  'laptop-get-shortcut-settings',
  'laptop-choose-browser',
  'laptop-save-browser-settings',
  'laptop-choose-custom-app',
  'laptop-choose-shortcut-logo',
  'laptop-replace-shortcuts',
  'laptop-open-shortcut',
  'laptop-open-account',
  'laptop-open-action'
];

const VALID_RECEIVE_CHANNELS = [
  'organizer-drag-state', 'organizer-items-updated',
  'organizer-view-updated',
  'language-changed',
  'assistant-settings-updated',
  'size-updated',
  'scale-updated',
  'font-size-updated',
  'sticky-size-updated',
  'panel-opacity-updated',
  'settings-window-visibility',
  'settings-select-tab',
  'assistant-visibility-changed',
  'focus-mode-updated',
  'update-status',
  'move-mode-changed',
  'dock-side-changed',
  'new-email-received',
  'email-sticky-updated',
  'health-reminder',
  'calendar-reminder',
  'calendar-sticky-updated',
  'trivia-reminder',
  'trivia-fetch-failed',
  'knowledge-card-reminder',
  'alarm-triggered',
  'alarm-stopped',
  'set-ball-speed',
  'boost-ball',
  'toggle-quotes',
  'set-quotes-enabled'
];

const electronAPI = {
  getDroppedFilePath: file => {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },
  send: (channel, ...args) => {
    if (VALID_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`[Security Warning] Blocked unapproved IPC send channel: ${channel}`);
    }
  },
  invoke: async (channel, ...args) => {
    if (VALID_INVOKE_CHANNELS.includes(channel)) {
      return await ipcRenderer.invoke(channel, ...args);
    }
    console.warn(`[Security Warning] Blocked unapproved IPC invoke channel: ${channel}`);
    return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
  },
  on: (channel, listener) => {
    if (VALID_RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => listener(event, ...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
    console.warn(`[Security Warning] Blocked unapproved IPC on channel: ${channel}`);
    return () => {};
  },
  removeAllListeners: (channel) => {
    if (VALID_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
