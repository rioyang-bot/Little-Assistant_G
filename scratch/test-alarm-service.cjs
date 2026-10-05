const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { AlarmService, isPlayableAudioPath, buildMediaPlayerLaunch } = require('../electron/alarm-service.cjs');

const QUOTE_PAYLOAD = 'C:\\Music\\x\u2019;Write-Output INJECTED;\u2018 \'a\'.mp3';

test('custom alarm sounds accept only absolute audio file paths', () => {
  assert.equal(isPlayableAudioPath('C:\\Music\\鬧鐘 1.MP3'), true);
  assert.equal(isPlayableAudioPath('C:\\Windows\\System32\\calc.exe'), false);
  assert.equal(isPlayableAudioPath('relative\\song.mp3'), false);
  assert.equal(isPlayableAudioPath({ path: 'C:\\a.mp3' }), false);
});

test('saving the alarm config drops executables and non-audio paths', async () => {
  const service = Object.create(AlarmService.prototype);
  service.configPath = require('node:path').join(require('node:os').tmpdir(), `alarm-config-test-${process.pid}.json`);
  service.config = {};
  await service.saveConfig({ soundType: 'custom', customPaths: ['C:\\Music\\a.mp3', 'C:\\Windows\\System32\\calc.exe', 'b.wav', 42] });
  assert.deepEqual(service.config.customPaths, ['C:\\Music\\a.mp3']);
  require('node:fs').rmSync(service.configPath, { force: true });
});

test('media player script never contains the audio source text', () => {
  for (const source of [QUOTE_PAYLOAD, 'https://example.test/a\u2019;Write-Output INJECTED;\u2019']) {
    const launch = buildMediaPlayerLaunch(source, {});
    assert.ok(launch);
    assert.equal(launch.env.METECH_ALARM_SOURCE, source);
    assert.equal(launch.args.some(arg => arg.includes('INJECTED')), false);
  }
});

test('unsupported media sources are rejected before PowerShell starts', () => {
  assert.equal(buildMediaPlayerLaunch('C:\\Windows\\System32\\calc.exe', {}), null);
  assert.equal(buildMediaPlayerLaunch('javascript:alert(1)', {}), null);
  assert.equal(buildMediaPlayerLaunch('', {}), null);
});

test('PowerShell receives quote-laden paths as data, not commands', { skip: process.platform !== 'win32' }, () => {
  const launch = buildMediaPlayerLaunch(QUOTE_PAYLOAD);
  // Same data path as the player ([Uri]$env:METECH_ALARM_SOURCE) without opening audio.
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ([Uri]$env:METECH_ALARM_SOURCE).LocalPath'],
  { env: launch.env, encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(output, QUOTE_PAYLOAD);
});
