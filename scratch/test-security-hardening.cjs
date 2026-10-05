const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const test = require('node:test');

const root = path.join(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-hardening-'));
for (const file of ['calendar-config.json']) fs.writeFileSync(path.join(userData, file), '{}');

// Minimal Electron stand-in: isolated userData and a reversible fake key store.
let encryptionAvailable = true;
const electronStub = {
  app: { getPath: () => userData },
  ipcMain: { handle() {}, on() {} },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: text => Buffer.concat([Buffer.from('v10'), Buffer.from(text).map(byte => byte ^ 0x5a)]),
    decryptString: buffer => {
      // Like Electron, refuse data that was not produced by encryptString.
      if (buffer.subarray(0, 3).toString() !== 'v10') throw new Error('Error while decrypting the ciphertext provided');
      return Buffer.from(buffer.subarray(3).map(byte => byte ^ 0x5a)).toString();
    }
  }
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  return request === 'electron' ? electronStub : originalLoad.call(this, request, ...rest);
};
const { encryptSecret, decryptSecret } = require('../electron/secret-storage.cjs');
const { CalendarService, normalizeCalendarColor } = require('../electron/calendar-service.cjs');
Module._load = originalLoad;
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

function calendarService() {
  const service = Object.create(CalendarService.prototype);
  service.config = { language: 'zh-TW', calendars: [], rules: {} };
  service.getMainWindow = () => null;
  service.restartPolling = () => {};
  return service;
}

test('secrets are never written as reversible base64 when OS encryption is unavailable', () => {
  encryptionAvailable = false;
  try {
    assert.equal(encryptSecret('S3cret!'), '');
  } finally {
    encryptionAvailable = true;
  }
  const encrypted = encryptSecret('S3cret!');
  assert.equal(Buffer.from(encrypted, 'base64').toString().includes('S3cret!'), false);
  assert.equal(decryptSecret(encrypted), 'S3cret!');
  assert.equal(decryptSecret(Buffer.from('legacy').toString('base64')), 'legacy', 'earlier base64 values still migrate');
});

test('calendar colours are limited to #rrggbb before reaching renderer styles', () => {
  assert.equal(normalizeCalendarColor('#A1b2C3'), '#A1b2C3');
  for (const value of ['#fff" onmouseover="alert(1)', 'red', '#fff', 'url(x)', null]) {
    assert.equal(normalizeCalendarColor(value), '#38bdf8', String(value));
  }
  const service = calendarService();
  service.saveConfig({ calendars: [{ id: 'c1', name: 'x', url: 'https://example.test/a.ics', color: '#fff" onmouseover="x', enabled: true }] });
  assert.equal(service.config.calendars[0].color, '#38bdf8');
});

test('private iCal addresses are stored encrypted and restored on load', () => {
  const secretUrl = 'https://calendar.google.com/calendar/ical/x/private-abc123/basic.ics';
  calendarService().saveConfig({ calendars: [{ id: 'c1', name: 'Work', url: secretUrl, color: '#34d399', enabled: true }] });
  const disk = fs.readFileSync(path.join(userData, 'calendar-config.json'), 'utf8');
  assert.equal(disk.includes('private-abc123'), false);
  assert.ok(JSON.parse(disk).calendars[0].urlEncrypted);
  const restored = calendarService().loadConfig();
  assert.equal(restored.calendars[0].url, secretUrl);
  assert.equal(restored.calendars[0].color, '#34d399');
});

test('calendar redirects that leave https:// reject instead of throwing in the callback', async () => {
  const https = require('node:https');
  const originalGet = https.get;
  let thrown = null;
  https.get = (url, options, callback) => {
    setImmediate(() => {
      try { callback({ statusCode: 302, headers: { location: 'http://evil.example/cal.ics' }, resume() {} }); }
      catch (error) { thrown = error; }
    });
    return { on() { return this; }, destroy() {} };
  };
  try {
    await assert.rejects(calendarService().fetchIcsData('https://calendar.example/cal.ics'), /https:\/\//);
    assert.equal(thrown, null);
  } finally {
    https.get = originalGet;
  }
});

test('renderer pages declare a CSP whose hashes match their inline scripts', () => {
  // Browsers normalise CRLF to LF before hashing, so a CRLF checkout keeps the same hash.
  const hash = text => `'sha256-${crypto.createHash('sha256').update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`;
  for (const page of ['index.html', 'email-settings.html', 'knowledge-card.html', 'desktop-organizer.html', 'desktop-organizer-settings.html']) {
    const source = fs.readFileSync(path.join(root, page), 'utf8');
    const policy = (source.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
    assert.ok(policy, `${page} has no Content-Security-Policy`);
    assert.match(policy, /default-src 'self'/, page);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/, page);
    for (const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.ok(policy.includes(hash(match[1])), `${page}: inline script changed; update the CSP hash to ${hash(match[1])}`);
    }
  }
});

test('preload listeners never receive the raw IPC event', () => {
  const exposed = {};
  let subscription;
  const context = {
    require: name => name === 'electron' ? {
      contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
      ipcRenderer: { on: (channel, fn) => { subscription = fn; }, removeListener() {} },
      webUtils: {}
    } : require(name),
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8'), context);
  let received;
  exposed.electronAPI.on('language-changed', (...args) => { received = args; });
  subscription({ sender: 'RAW_EVENT' }, 'en');
  assert.equal(received[1], 'en');
  assert.equal(JSON.stringify(received[0]), '{}');
});

test('app windows may only navigate to pages inside the application', () => {
  const source = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  const start = source.indexOf('function isAppPageUrl(');
  const context = { path, fileURLToPath: require('node:url').fileURLToPath, URL, __dirname: path.join(root, 'electron') };
  const end = source.slice(start).search(/\r?\n\}\r?\n/);
  vm.runInNewContext(source.slice(start, start + end) + '\n}\n', context);
  const { pathToFileURL } = require('node:url');
  assert.equal(context.isAppPageUrl(pathToFileURL(path.join(root, 'dist/email-settings.html')).href), true);
  assert.equal(context.isAppPageUrl('https://evil.example/'), false);
  assert.equal(context.isAppPageUrl(pathToFileURL(path.join(os.tmpdir(), 'evil.html')).href), false);
  assert.match(source, /setWindowOpenHandler\(\(\{ url \}\) => \{[\s\S]*?return \{ action: 'deny' \};/);
});

test('YouTube alarms never fetch remote JavaScript components', () => {
  const source = fs.readFileSync(path.join(root, 'electron/alarm-service.cjs'), 'utf8');
  assert.match(source, /'--no-remote-components'/);
  assert.doesNotMatch(source, /'--remote-components'/);
});
