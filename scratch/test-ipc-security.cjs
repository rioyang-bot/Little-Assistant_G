const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { IPC_SENDER_POLICY, isAuthorizedIpcSender, installIpcSenderPolicy } = require('../electron/ipc-sender-policy.cjs');
const { EmailService } = require('../electron/email-service.cjs');

const electronDir = path.join(__dirname, '../electron');
const mainSource = fs.readFileSync(path.join(electronDir, 'main.cjs'), 'utf8');

test('every registered IPC channel and preload channel has a sender policy', () => {
  const registered = new Set();
  for (const file of fs.readdirSync(electronDir).filter(name => name.endsWith('.cjs'))) {
    const source = fs.readFileSync(path.join(electronDir, file), 'utf8');
    for (const match of source.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)) registered.add(match[1]);
  }
  const preload = fs.readFileSync(path.join(electronDir, 'preload.cjs'), 'utf8');
  const listed = name => [...preload.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const required = new Set([...registered, ...listed('VALID_SEND_CHANNELS'), ...listed('VALID_INVOKE_CHANNELS')]);
  assert.ok(registered.size >= 90);
  assert.deepEqual([...required].filter(channel => !IPC_SENDER_POLICY[channel]), []);
});

test('sender policy accepts only the expected top-level local window', () => {
  const windows = { main: { getURL: () => 'file:///app/index.html' }, settings: { getURL: () => 'file:///app/email-settings.html' } };
  const role = sender => Object.keys(windows).find(key => windows[key] === sender) || null;
  const event = (sender, frame) => ({ sender, senderFrame: frame });
  assert.equal(isAuthorizedIpcSender('email-get-config', event(windows.settings), role), true);
  assert.equal(isAuthorizedIpcSender('email-get-config', event(windows.main), role), false);
  assert.equal(isAuthorizedIpcSender('laptop-save-browser-settings', event({ getURL: () => 'file:///x' }), role), false);
  assert.equal(isAuthorizedIpcSender('email-get-config', event(windows.settings, { url: 'file:///app/email-settings.html', parent: {} }), role), false);
  assert.equal(isAuthorizedIpcSender('email-get-config', event(windows.settings, { url: 'https://evil.example/', parent: null }), role), false);
  assert.equal(isAuthorizedIpcSender('not-a-registered-channel', event(windows.settings), role), false);
  assert.equal(isAuthorizedIpcSender('organizer-get', event({}), role), true, 'organizer handlers authenticate their own boards');
});

test('installed policy blocks unauthorized invokes and messages before the handler runs', async () => {
  const handlers = {}, listeners = {};
  const ipcMain = { handle: (channel, fn) => { handlers[channel] = fn; }, on(channel, fn) { listeners[channel] = fn; return this; } };
  const main = { getURL: () => 'file:///app/index.html' };
  installIpcSenderPolicy(ipcMain, sender => sender === main ? 'main' : null);
  let calls = 0;
  ipcMain.handle('laptop-open-shortcut', () => { calls++; return 'opened'; });
  ipcMain.on('close-app', () => { calls++; });
  assert.equal(await handlers['laptop-open-shortcut']({ sender: main }, 'id'), 'opened');
  assert.throws(() => handlers['laptop-open-shortcut']({ sender: {} }, 'id'), /Unauthorized IPC sender/);
  listeners['close-app']({ sender: {} });
  assert.equal(calls, 1);
});

function browserSandbox(saved = {}) {
  const from = mainSource.indexOf('const NON_BROWSER_EXECUTABLES');
  const to = mainSource.indexOf('async function openWebUrl(', from);
  assert.ok(from >= 0 && to > from);
  const exists = new Set(['C:\\Browsers\\Portal.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].map(p => p.toLowerCase()));
  const context = vm.createContext({
    path: path.win32, process: { platform: 'win32' },
    fs: { existsSync: file => exists.has(String(file).toLowerCase()) },
    laptopBrowserAssignments: saved,
    detectInstalledBrowsers: () => [{ name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }]
  });
  vm.runInContext(mainSource.slice(from, to), context);
  return context;
}

test('only detected or dialog-chosen browsers can be assigned, never command interpreters', () => {
  const sandbox = browserSandbox();
  assert.equal(sandbox.isApprovedBrowserPath('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), true);
  assert.equal(sandbox.isApprovedBrowserPath('C:\\Browsers\\Portal.exe'), false, 'not chosen in the dialog');
  vm.runInContext("userChosenBrowserPaths.add(getPathKey('C:\\\\Browsers\\\\Portal.exe'))", sandbox);
  assert.equal(sandbox.isApprovedBrowserPath('C:\\Browsers\\Portal.exe'), true);
  const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  vm.runInContext(`userChosenBrowserPaths.add(getPathKey(${JSON.stringify(powershell)}))`, sandbox);
  assert.equal(sandbox.isApprovedBrowserPath(powershell), false);
  assert.deepEqual({ ...sandbox.normalizeBrowserAssignments({ 'custom:a': powershell, 'custom:b': 'C:\\Browsers\\Portal.exe' }) }, { 'custom:b': 'C:\\Browsers\\Portal.exe' });
});

function emailService(accounts) {
  const service = Object.create(EmailService.prototype);
  service.config = { language: 'zh-TW', accounts, rules: { checkIntervalMinutes: 5 }, health: {} };
  service.persistConfigToDisk = () => {};
  service.restartPolling = () => {};
  service.getMainWindow = () => null;
  return service;
}
const savedAccount = () => ({ id: 'a1', user: 'u@example.test', pass: 'S3cret!', host: 'imap.gmail.com', port: 993, secure: true, enabled: true });

test('renderers receive whether a password exists, never the password', () => {
  const service = emailService([savedAccount()]);
  const config = service.getRendererConfig();
  assert.equal(JSON.stringify(config).includes('S3cret!'), false);
  assert.equal(config.accounts[0].hasPassword, true);
  const saved = service.saveConfig({ accounts: [{ ...savedAccount(), pass: '' }] });
  assert.equal(saved.success, true);
  assert.equal(JSON.stringify(saved).includes('S3cret!'), false);
  assert.equal(service.config.accounts[0].pass, 'S3cret!', 'unchanged login keeps the saved password');
});

test('a saved password is never reused for a different server, port, user or TLS mode', () => {
  for (const change of [{ host: 'attacker.example' }, { port: 143 }, { user: 'other@example.test' }, { secure: false }]) {
    const service = emailService([savedAccount()]);
    assert.equal(service.withStoredPassword({ ...savedAccount(), pass: '', ...change }).pass, '', JSON.stringify(change));
    service.saveConfig({ accounts: [{ ...savedAccount(), pass: '', ...change }] });
    assert.equal(service.config.accounts[0].pass, '', JSON.stringify(change));
  }
  const service = emailService([savedAccount()]);
  assert.equal(service.withStoredPassword({ ...savedAccount(), pass: '', host: 'IMAP.Gmail.com ' }).pass, 'S3cret!');
});

test('invalid IMAP hosts and ports are rejected without changing the saved account', () => {
  for (const change of [{ host: 'evil host' }, { host: 'a.b/c' }, { port: 70000 }]) {
    const service = emailService([savedAccount()]);
    const result = service.saveConfig({ accounts: [{ ...savedAccount(), ...change }] });
    assert.equal(result.success, false, JSON.stringify(change));
    assert.equal(service.config.accounts[0].host, 'imap.gmail.com');
  }
});
