const { contextBridge, ipcRenderer } = require('electron');

const VALID_SEND_CHANNELS = [
  'set-ignore-mouse-events',
  'set-alarm-active',
  'window-move',
  'window-drag-start',
  'set-size',
  'set-scale',
  'show-context-menu',
  'open-email-settings',
  'close-app',
  'minimize-app'
];

const VALID_INVOKE_CHANNELS = [
  'get-language',
  'get-app-version',
  'set-language',
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
  'sticky-notes-list',
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
  'get-auto-launch',
  'set-auto-launch'
];

const VALID_RECEIVE_CHANNELS = [
  'language-changed',
  'size-updated',
  'scale-updated',
  'font-size-updated',
  'sticky-size-updated',
  'panel-opacity-updated',
  'auto-launch-updated',
  'move-mode-changed',
  'dock-side-changed',
  'new-email-received',
  'email-sticky-updated',
  'health-reminder',
  'calendar-reminder',
  'calendar-sticky-updated',
  'trivia-reminder',
  'trivia-fetch-failed',
  'alarm-triggered',
  'alarm-stopped',
  'set-ball-speed',
  'boost-ball',
  'toggle-quotes',
  'set-quotes-enabled'
];

const electronAPI = {
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
