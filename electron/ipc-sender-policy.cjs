// Central allow-list of which application window may call each IPC channel.
// main.cjs resolves the sending webContents to a role; any channel missing
// from this table is refused, so new handlers must be added here deliberately.
const MAIN = 'main';
const SETTINGS = 'settings';
const KNOWLEDGE = 'knowledge';
// Desktop organizer handlers authenticate their own board and settings windows.
const SELF_AUTHENTICATED = 'self-authenticated';

const policy = {};
const allow = (roles, channels) => { for (const channel of channels) policy[channel] = roles; };

allow([MAIN], [
  'set-ignore-mouse-events', 'set-alarm-active', 'set-notification-active', 'window-move', 'window-drag-start',
  'set-size', 'set-scale', 'show-context-menu', 'ball-speed-changed', 'open-email-settings', 'close-app', 'minimize-app',
  'laptop-get-shortcuts', 'laptop-save-shortcut-order', 'laptop-open-shortcut', 'laptop-open-account', 'laptop-open-action',
  'natural-language-create', 'get-bubble-font-size', 'set-bubble-font-size', 'get-sticky-notes-size', 'set-sticky-notes-size',
  'sticky-notes-list', 'sticky-notes-save-view', 'sticky-notes-create', 'sticky-notes-update', 'sticky-notes-complete',
  'sticky-notes-update-item'
]);
allow([MAIN, SETTINGS, KNOWLEDGE], ['get-language']);
allow([MAIN, SETTINGS], ['get-focus-mode', 'get-app-version']);
allow([KNOWLEDGE], ['knowledge-cards-add']);
allow([SETTINGS], [
  'get-assistant-settings', 'set-assistant-settings', 'set-language', 'set-focus-mode',
  'get-update-settings', 'set-update-settings', 'check-for-updates', 'install-update', 'health-test-reminder',
  'get-panel-opacity', 'preview-panel-opacity', 'set-panel-opacity',
  'email-get-config', 'email-save-config', 'email-test-connection', 'email-test-all', 'email-list-labels', 'email-check-now',
  'calendar-get-config', 'calendar-save-config', 'calendar-test-connection', 'calendar-check-now',
  'trivia-get-config', 'trivia-save-config', 'trivia-fetch-now', 'trivia-test-reminder',
  'alarm-get-config', 'alarm-save-config', 'alarm-choose-audio', 'alarm-test', 'alarm-stop-test',
  'knowledge-cards-get-config', 'knowledge-cards-save-config', 'knowledge-cards-test-reminder',
  'laptop-get-shortcut-settings', 'laptop-choose-browser', 'laptop-save-browser-settings', 'laptop-choose-custom-app',
  'laptop-choose-shortcut-logo', 'laptop-replace-shortcuts'
]);
allow(SELF_AUTHENTICATED, [
  'organizer-get', 'organizer-refresh', 'organizer-background-menu', 'organizer-update', 'organizer-add', 'organizer-position', 'organizer-layout', 'organizer-drag-out',
  'organizer-remove', 'organizer-open', 'organizer-icon', 'organizer-hide', 'organizer-delete', 'organizer-resize',
  'organizer-background', 'organizer-context-menu', 'organizer-rename', 'organizer-settings-open',
  'organizer-settings-close', 'organizer-settings-preview'
]);

const IPC_SENDER_POLICY = Object.freeze(policy);

function isAuthorizedIpcSender(channel, event, resolveRole) {
  const allowed = IPC_SENDER_POLICY[channel];
  if (allowed === SELF_AUTHENTICATED) return true;
  if (!Array.isArray(allowed) || !event || !event.sender) return false;
  const frame = event.senderFrame;
  // Only the top-level frame of a bundled local page may use these channels.
  if (frame && frame.parent) return false;
  try {
    const url = frame && typeof frame.url === 'string' ? frame.url
      : typeof event.sender.getURL === 'function' ? event.sender.getURL() : 'file:';
    if (!String(url).startsWith('file:')) return false;
  } catch (error) {
    return false;
  }
  return allowed.includes(resolveRole(event.sender));
}

function installIpcSenderPolicy(ipcMain, resolveRole) {
  if (!ipcMain || ipcMain.senderPolicyInstalled) return;
  const handle = ipcMain.handle.bind(ipcMain);
  const on = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, (event, ...args) => {
    if (!isAuthorizedIpcSender(channel, event, resolveRole)) {
      console.warn(`[Security Warning] Refused IPC invoke from unauthorized sender: ${channel}`);
      throw new Error(`Unauthorized IPC sender: ${channel}`);
    }
    return listener(event, ...args);
  });
  ipcMain.on = (channel, listener) => on(channel, (event, ...args) => {
    if (!isAuthorizedIpcSender(channel, event, resolveRole)) {
      console.warn(`[Security Warning] Refused IPC message from unauthorized sender: ${channel}`);
      return;
    }
    return listener(event, ...args);
  });
  ipcMain.senderPolicyInstalled = true;
}

module.exports = { IPC_SENDER_POLICY, SELF_AUTHENTICATED, isAuthorizedIpcSender, installIpcSenderPolicy };
