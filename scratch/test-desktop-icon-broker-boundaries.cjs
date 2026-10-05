const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');

// Exercise the exact privileged worker branch without elevating or touching
// personal desktop entries. Task ACLs and SYSTEM execution need a separate
// administrator integration test; this test never claims to cover them.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-broker-boundaries-'));
const desktop = path.join(root, 'Desktop'); fs.mkdirSync(desktop);
const journal = path.join(root, 'protected-journal.json');
const legacy = path.join(root, 'legacy-journal.json'); fs.writeFileSync(legacy, '[]');
const script = path.resolve(__dirname, '../electron/windows-desktop-icons.ps1');
const attrs = file => Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[int][IO.File]::GetAttributes($env:METECH_BOUNDARY_FIXTURE)'], { windowsHide: true, encoding: 'utf8', env: { ...process.env, METECH_BOUNDARY_FIXTURE: file } }).trim());
let worker;
async function start() {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-JournalPath', journal, '-RecoveryJournal', legacy, '-DesktopDirectory', desktop, '-OwnerPid', String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '', readyResolve, readyReject, serial = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const timer = setTimeout(() => { child.kill(); readyReject(new Error('Worker startup timed out: ' + diagnostics)); }, 15000);
  child.stderr.on('data', data => { diagnostics += data; });
  readline.createInterface({ input: child.stdout }).on('line', line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    if (value.ready === true) { clearTimeout(timer); readyResolve(value); }
    if (value.ready === false) { clearTimeout(timer); readyReject(new Error(value.error)); }
    if (pending.has(value.id)) { const task = pending.get(value.id); pending.delete(value.id); clearTimeout(task.timer); task.resolve(value); }
  });
  child.on('exit', code => {
    clearTimeout(timer); readyReject(new Error('Worker exited: ' + code + ' ' + diagnostics));
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(diagnostics)); } pending.clear();
  });
  const request = (command, data = {}) => new Promise((resolve, reject) => {
    const id = String(++serial);
    pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error('Request timed out')); }, 15000) });
    child.stdin.write(JSON.stringify({ id, command, ...data }) + '\n');
  });
  worker = { child, request, stop: async () => { const ended = once(child, 'exit'); child.stdin.end(); await ended; } };
  await ready; return worker;
}
(async () => {
  const file = path.join(desktop, 'fixture.txt'); fs.writeFileSync(file, 'original'); const original = attrs(file);
  const outside = path.join(root, 'outside.txt'); fs.writeFileSync(outside, 'outside'); const outsideAttrs = attrs(outside);
  const folder = path.join(desktop, 'folder'); fs.mkdirSync(folder);
  const nested = path.join(folder, 'nested.txt'); fs.writeFileSync(nested, 'nested'); const nestedAttrs = attrs(nested);
  const hardlink = path.join(desktop, 'hardlink.txt'); fs.linkSync(outside, hardlink);
  const junction = path.join(desktop, 'redirect'); fs.symlinkSync(folder, junction, 'junction');
  await start();
  let result = await worker.request('sync', { paths: [file, outside, nested, hardlink, junction] });
  assert.equal(result.errors.length, 2, 'hardlinks and junctions must be refused');
  assert.equal(attrs(file) & 6, 6); assert.equal(attrs(outside), outsideAttrs); assert.equal(attrs(nested), nestedAttrs);
  assert.throws(() => fs.renameSync(file, outside + '.renamed'), /EPERM|EACCES|EBUSY/, 'pinned collected entries cannot be moved outside the allowed directory');
  assert.throws(() => fs.renameSync(desktop, desktop + '.renamed'), /EPERM|EACCES|EBUSY/, 'desktop directory cannot be swapped while the worker validates children');
  result = await worker.request('reveal', { file }); assert.deepEqual(result.errors, []); assert.equal(attrs(file), original);
  fs.renameSync(file, outside + '.renamed'); fs.renameSync(outside + '.renamed', file);
  await worker.request('sync', { paths: [file] });
  const killed = once(worker.child, 'exit'); worker.child.kill(); await killed;
  assert.equal(attrs(file) & 6, 6);
  // First-run import must restore legacy records even when no protected
  // journal has been created yet, before reporting ready to the client.
  fs.copyFileSync(journal, legacy); fs.unlinkSync(journal);
  await start(); assert.equal(attrs(file), original); assert.deepEqual(JSON.parse(fs.readFileSync(journal)), []);
  fs.writeFileSync(legacy, '[]');
  await worker.request('sync', { paths: [file, folder] }); await worker.stop(); worker = null;
  assert.equal(attrs(file), original); assert.equal(attrs(folder) & 6, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'original'); assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');
  console.log('Background worker boundaries passed: outside/nested paths unchanged; hardlinks/junctions rejected; path replacement blocked; reveal unlocks entries; first-run legacy recovery and EOF restore retain contents. SYSTEM task/ACL integration remains a separate test.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (worker?.child.exitCode === null) await worker.stop();
  // Only remove this known fixture tree; unlink the junction before recursion.
  const junction = path.join(desktop, 'redirect'); if (fs.existsSync(junction)) fs.unlinkSync(junction);
  fs.rmSync(root, { recursive: true, force: true });
});
