const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
const { DesktopIconVisibility } = require('../electron/desktop-icon-visibility.cjs');
const pipeTransport = process.argv.includes('--pipe');
const serviceOptions = { allowElevation: false, pipeTransport };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-icons-test-'));
const desktop = path.join(root, 'Desktop'); fs.mkdirSync(desktop);
const state = file => Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Item -Force -LiteralPath $env:ORGANIZER_ICON_FIXTURE).Attributes.value__'], { windowsHide: true, env: { ...process.env, ORGANIZER_ICON_FIXTURE: file }, encoding: 'utf8' }).trim());
const setState = (file, attrs) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[IO.File]::SetAttributes($env:ORGANIZER_ICON_FIXTURE,[IO.FileAttributes][int]$env:ORGANIZER_ICON_ATTRS)'], { windowsHide: true, env: { ...process.env, ORGANIZER_ICON_FIXTURE: file, ORGANIZER_ICON_ATTRS: String(attrs) } });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check) {
  for (let attempt = 0; attempt < 30; attempt++) { if (await check()) return; await delay(100); }
  throw new Error('Native desktop icon recovery timed out.');
}
let service;
(async () => {
  const file = path.join(desktop, '文件.txt'); fs.writeFileSync(file, 'original contents');
  const outside = path.join(root, 'outside.txt'); fs.writeFileSync(outside, 'outside');
  const folder = path.join(desktop, 'folder'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'child.txt'), 'child');
  const original = state(file), originalFolder = state(folder), outsideAttrs = state(outside);
  service = new DesktopIconVisibility(root, desktop, serviceOptions);
  assert.deepEqual(await service.sync([file, folder, outside, file]), []);
  assert.equal(service.workerIsElevated, false, 'ordinary files must not elevate the application or worker');
  assert.equal(state(file) & 6, 6); assert.equal(state(folder) & 6, 6);
  assert.equal(state(outside), outsideAttrs, 'non-desktop files must not be hidden');
  assert.equal(fs.readFileSync(file, 'utf8'), 'original contents');
  assert.equal(fs.readFileSync(path.join(folder, 'child.txt'), 'utf8'), 'child');
  assert.deepEqual(await service.sync([file]), []); assert.equal(state(folder), originalFolder);
  await service.reveal(file); assert.equal(state(file), original);
  await service.sync([file]); assert.equal(state(file) & 6, 6);
  await service.sync([]); assert.equal(state(file), original);
  // Preserve an existing Hidden bit and a ReadOnly bit added by another app.
  setState(file, original | 2); await service.sync([file]); setState(file, state(file) | 1);
  await service.sync([]); assert.equal(state(file), original | 3); setState(file, original);
  // A retained native handle restores a file renamed while it was collected.
  await service.sync([file]); const renamed = file + '.renamed'; fs.renameSync(file, renamed);
  await service.sync([]); assert.equal(state(renamed), original); fs.renameSync(renamed, file);
  // A replacement at the original path must not inherit the old restore.
  await service.sync([file]); fs.renameSync(file, renamed); fs.writeFileSync(file, 'replacement');
  setState(file, original | 2); await service.sync([]);
  assert.equal(state(file), original | 2); assert.equal(state(renamed), original);
  setState(file, original); fs.unlinkSync(file); fs.renameSync(renamed, file);
  // Recovery journal survives a killed helper, and EOF restores owned flags.
  await service.sync([file]); const deadHelper = service.child;
  const ended = new Promise(resolve => deadHelper.once('exit', resolve)); process.kill(service.workerPid); await ended;
  assert.equal(state(file) & 6, 6);
  service = new DesktopIconVisibility(root, desktop, serviceOptions); await service.prepare(); assert.equal(state(file), original);
  await service.sync([file]); const graceful = new Promise(resolve => service.child.once('exit', resolve)); service.dispose(); await graceful;
  assert.equal(state(file), original);
  // Validate actual Explorer visibility with two uniquely named test files.
  const actualDesktop = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('DesktopDirectory')"], { windowsHide: true, encoding: 'utf8' }).trim();
  const iconFile = path.join(actualDesktop, path.basename(root) + '.txt');
  const controlFile = path.join(actualDesktop, path.basename(root) + '-control.txt');
  assert.equal(fs.existsSync(iconFile), false); assert.equal(fs.existsSync(controlFile), false);
  let actualService;
  const visible = async file => {
    for (let attempt=0;attempt<6;attempt++) {
      try {
        const result=await execFile('powershell.exe',['-NoProfile','-NonInteractive','-STA','-File',path.join(__dirname,'desktop-icon-probe.ps1'),'-FilePath',file],{windowsHide:true,encoding:'utf8',timeout:10000});
        assert.ok(['True','False'].includes(result.stdout.trim()),'desktop probe must return an actual visibility result');
        return result.stdout.trim()==='True';
      } catch(error) {
        // Explorer can retire its COM view while refreshing desktop icons.
        // Retry E_FAIL only; never interpret a query failure as hidden.
        if(attempt===5 || !String(error.stderr||error.message).includes('HRESULT E_FAIL'))throw error;
        await delay(250);
      }
    }
  };
  let fixtureAcl;
  const fixturePowerShell = command => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', env: { ...process.env, ORGANIZER_ICON_FIXTURE: iconFile, ORGANIZER_ICON_ACL: fixtureAcl || '' } }).trim();
  try {
    fs.writeFileSync(iconFile, 'desktop fixture'); fs.writeFileSync(controlFile, 'uncollected fixture');
    await waitFor(() => visible(iconFile));
    actualService = new DesktopIconVisibility(path.join(root, 'actual-desktop-profile'), actualDesktop, serviceOptions);
    assert.deepEqual(await actualService.sync([iconFile]), []);
    await waitFor(async () => !await visible(iconFile));
    assert.equal(await visible(controlFile), true);
    assert.equal(fs.readFileSync(iconFile, 'utf8'), 'desktop fixture');
    await actualService.sync([]); await waitFor(() => visible(iconFile));
    console.log('Actual Explorer desktop: collected icon hidden, uncollected icon visible, original path/content retained, icon restored on removal.');
    // Only this owned fixture receives a temporary deny rule, matching a
    // shortcut that permits reading but denies file-attribute changes.
    fixtureAcl = fixturePowerShell('[IO.File]::GetAccessControl($env:ORGANIZER_ICON_FIXTURE).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)');
    fixturePowerShell('$acl=[IO.File]::GetAccessControl($env:ORGANIZER_ICON_FIXTURE); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::WriteAttributes,[Security.AccessControl.AccessControlType]::Deny); $acl.AddAccessRule($rule); [IO.File]::SetAccessControl($env:ORGANIZER_ICON_FIXTURE,$acl)');
    const protectedAttrs = state(iconFile);
    const protectedErrors = await actualService.sync([iconFile]);
    assert.equal(protectedErrors.length, 1);
    assert.match(protectedErrors[0], /管理員/);
    assert.equal(await visible(iconFile), true, 'protected files must not be moved to the screen edge and falsely reported as hidden');
    assert.equal(state(iconFile), protectedAttrs);
    assert.equal(await visible(controlFile), true);
    assert.equal(fs.readFileSync(iconFile, 'utf8'), 'desktop fixture');
    const journal = JSON.parse(fs.readFileSync(path.join(root, 'actual-desktop-profile', 'desktop-icon-visibility.json'), 'utf8'));
    assert.deepEqual(journal, []);
    // Simulate a declined UAC prompt while using real ordinary workers and
    // a protected fixture. The unprotected entry must be hidden again after
    // handoff rollback, and sync must not prompt repeatedly.
    const normalRequest = actualService.request.bind(actualService);
    let elevationRequests = 0;
    actualService.allowElevation = true;
    // This checkout is user-writable; simulate the Program Files install that UAC requires.
    actualService.isProtectedInstall = true;
    actualService.autoElevate = true;
    actualService.request = function(command, input) {
      if (this.elevated) { elevationRequests++; return Promise.reject(new Error('User cancelled elevation')); }
      return normalRequest(command, input);
    };
    const declinedErrors = await actualService.sync([iconFile, controlFile]);
    assert.ok(declinedErrors.some(error => error.includes('管理員確認未完成')));
    assert.equal(state(controlFile) & 6, 6, 'ordinary entries are re-hidden after declined elevation');
    await waitFor(async () => !await visible(controlFile));
    assert.equal(await visible(iconFile), true);
    assert.equal(state(iconFile), protectedAttrs);
    assert.equal(fs.readFileSync(controlFile, 'utf8'), 'uncollected fixture');
    await actualService.sync([iconFile, controlFile]);
    assert.equal(elevationRequests, 1, 'failed elevation must not produce repeated prompts');
    await actualService.sync([]); await waitFor(() => visible(iconFile));
    await waitFor(() => visible(controlFile));
    console.log('Declined elevation: ordinary desktop icons re-hidden, protected shortcut remains visible with an actionable error, no repeated UAC prompts, and original flags restored on removal.');
    console.log('Protected desktop item: permission error reported; original path, content, attributes and permissions retained; no false off-screen hiding. Desktop visibility probe uses physical DPI coordinates.');
  } finally {
    if (actualService?.child) {
      await actualService.sync([]);
      const actualEnded = new Promise(resolve => actualService.child.once('exit', resolve)); actualService.dispose(); await actualEnded;
    }
    if (fixtureAcl && fs.existsSync(iconFile)) fixturePowerShell('$acl=[IO.File]::GetAccessControl($env:ORGANIZER_ICON_FIXTURE); $acl.SetSecurityDescriptorSddlForm($env:ORGANIZER_ICON_ACL,[Security.AccessControl.AccessControlSections]::Access); [IO.File]::SetAccessControl($env:ORGANIZER_ICON_FIXTURE,$acl)');
    for (const fixture of [iconFile, controlFile]) if (fs.existsSync(fixture)) fs.unlinkSync(fixture);
  }
  // A helper also restores visibility after its owner process dies abruptly.
  const ownerScript = "const {DesktopIconVisibility}=require(process.argv[1]);const svc=new DesktopIconVisibility(process.argv[2],process.argv[3],{allowElevation:false,pipeTransport:process.argv[5]==='pipe'});svc.sync([process.argv[4]]).then(()=>{console.log('hidden');setInterval(()=>{},1000)}).catch(e=>{console.error(e);process.exit(1)});";
  const owner = spawn(process.execPath, ['-e', ownerScript, path.resolve(__dirname, '../electron/desktop-icon-visibility.cjs'), root, desktop, file, pipeTransport ? 'pipe' : 'stdio'], { windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, METECH_ICON_DEBUG: '1' } });
  await new Promise((resolve, reject) => { owner.stdout.once('data', resolve); owner.once('exit', code => reject(new Error('Owner fixture failed: ' + code))); });
  assert.equal(state(file) & 6, 6); const ownerEnded = new Promise(resolve => owner.once('exit', resolve)); owner.kill(); await ownerEnded;
  try { await waitFor(() => state(file) === original); }
  catch (error) { throw new Error(error.message + ' attrs=' + state(file) + ' expected=' + original + ' journal=' + fs.readFileSync(path.join(root, 'desktop-icon-visibility.json'), 'utf8') + ' debug=' + fs.readFileSync(path.join(root,'desktop-icon-visibility.json.debug'),'utf8')); }
  console.log('Desktop icon native attributes: paths/content retained; selective restore, multiple entries, folders, existing flags, rename/replacement, helper recovery, EOF and owner-crash recovery passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (service?.child) { const child = service.child; const ended = new Promise(resolve => child.once('exit', resolve)); service.dispose(); await Promise.race([ended, delay(3000)]); }
  // Only this known temporary fixture root is removed.
  fs.rmSync(root, { recursive: true, force: true });
});
