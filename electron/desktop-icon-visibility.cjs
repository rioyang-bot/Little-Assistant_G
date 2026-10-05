const { spawn } = require('child_process');
const path = require('path');
const { randomUUID } = require('crypto');
const { getNativeScriptPath } = require('./organizer-files.cjs');
const { readBroker, isAdminProtectedDirectory, UNPROTECTED_INSTALL_ERROR } = require('./desktop-icon-permissions.cjs');

const ELEVATION_SETUP_HINT = '部分桌面捷徑受權限保護，小助手不會在每次開機要求管理員權限。請從「桌面整理工具 → 桌面圖示權限」安裝背景輔助程序，或一次授權已收納的捷徑；完成後開機不需再確認。';

// Keep file paths intact. The native service journals only the attribute bits
// it adds and restores them when the owner exits, including an owner crash.
class DesktopIconVisibility {
  constructor(userDir, desktopDirectory, options = {}) {
    this.journal = path.join(userDir, 'desktop-icon-visibility.json');
    this.desktopDirectory = desktopDirectory;
    this.pending = new Map();
    this.allowElevation = options.allowElevation !== false && !process.argv.includes('--no-icon-elevation');
    // Automatic syncs (startup, desktop changes) never open UAC. Persistent
    // permission comes from the one-time broker install or shortcut grant.
    this.autoElevate = options.autoElevate === true;
    this.pipeTransport = options.pipeTransport === true;
    this.onStatus = options.onStatus || (() => {});
    this.broker = this.allowElevation && options.allowBroker !== false ? readBroker(userDir) : null;
    this.useBroker = this.broker?.enabled === true;
    if (this.broker && !this.useBroker) {
      try { this.useBroker = JSON.parse(require('node:fs').readFileSync(path.join(this.broker.root, this.broker.sid, 'visibility.json'), 'utf8')).length > 0; } catch {}
    }
    this.operations = Promise.resolve();
  }
  prepare() {
    if (this.disposed) return Promise.reject(new Error('桌面圖示程序已關閉。'));
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File',
        getNativeScriptPath('windows-desktop-icons.ps1'), '-JournalPath', this.journal,
        '-OwnerPid', String(process.pid), '-DesktopDirectory', this.desktopDirectory,
        ...(this.useBroker ? ['-ScheduledWorker', '-TaskName', this.broker.taskName, '-RequestPath', this.broker.requestFile] : [this.elevated ? '-ElevateWorker' : this.pipeTransport ? '-PipeWorker' : '-LaunchWorker'])],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '', diagnostics = '';
      let timer = setTimeout(() => { child.kill(); const error = new Error('桌面圖示服務尚未就緒。'); error.brokerFailed = this.useBroker; reject(error); }, 15000);
      child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-1000); });
      const failed = (code, signal) => {
        if (this.child !== child) return;
        clearTimeout(timer); this.child = null; this.ready = null;
        const error = new Error(`桌面圖示服務已停止（${code ?? signal ?? '啟動失敗'}）。${diagnostics}`);
        error.brokerFailed = this.useBroker;
        error.requiresElevation = this.requiresElevation;
        reject(error);
        for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
        this.pending.clear();
      };
      child.once('error', failed); child.once('exit', failed);
      child.stdin.on('error', () => {});
      child.stdout.on('data', chunk => {
        buffer += chunk.toString('utf8');
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (message.waitingForElevation) {
            clearTimeout(timer);
            timer = setTimeout(() => { child.kill(); reject(new Error('Windows 管理員確認逾時，請重新開啟小助手再試。')); }, 120000);
          } else if (message.ready) {
            this.workerPid = message.workerPid; this.workerIsElevated = message.elevated;
            this.requiresElevation = false; clearTimeout(timer); resolve();
            if (this.useBroker) { try { require('node:fs').writeFileSync(this.journal, '[]', 'utf8'); } catch {} }
          } else if (message.ready === false) {
            this.requiresElevation = message.requiresElevation === true;
            const error = new Error(message.error); error.requiresElevation = this.requiresElevation;
            error.brokerFailed = this.useBroker;
            clearTimeout(timer); reject(error);
          }
          else if (this.pending.has(message.id)) {
            this.requiresElevation = message.requiresElevation === true;
            const task = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(task.timer);
            if (message.error) {
              const error = new Error(message.error); error.requiresElevation = this.requiresElevation; task.reject(error);
            } else task.resolve(message.errors || []);
          }
        }
      });
    });
    return this.ready;
  }
  async request(command, input = {}) {
    await this.prepare();
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('桌面圖示操作逾時，請再試一次。')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, command, ...input }) + '\n');
    });
  }
  enqueue(command, input) {
    const result = this.operations.then(async () => {
      let response, failure;
      try { response = await this.request(command, input); } catch (error) { failure = error; }
      if (failure?.brokerFailed && !this.disposed) {
        await this.stopWorker();
        this.useBroker = false; this.elevationAttempted = true;
        response = await this.request(command, input); failure = null;
        response = [...response, '背景圖示程序未啟動，請從「桌面圖示權限」重新安裝背景程序。'];
      }
      const needsElevation = (this.requiresElevation || failure?.requiresElevation) && this.allowElevation && !this.elevationAttempted && !this.disposed;
      // The SYSTEM broker already has full rights, so a UAC worker cannot help;
      // without autoElevate, point to the one-time setup instead of prompting.
      if (needsElevation && (this.useBroker || !this.autoElevate)) {
        this.elevationAttempted = true;
        if (failure) throw failure;
        return this.useBroker ? response : [...response, ELEVATION_SETUP_HINT];
      }
      // The SYSTEM broker always runs the Program Files copy. A UAC worker would
      // run this installation's script, so it is refused when that is user-writable.
      if (needsElevation && !(this.isProtectedInstall ?? isAdminProtectedDirectory())) {
        this.elevationAttempted = true;
        if (failure) throw failure;
        return [...response, UNPROTECTED_INSTALL_ERROR];
      }
      if (needsElevation) {
        this.elevationAttempted = true;
        try { this.onStatus('部分桌面捷徑需要管理員權限，請在 Windows 確認視窗按「是」。'); } catch { /* A closing window must not prevent icon recovery. */ }
        await this.stopWorker();
        this.elevated = true; this.requiresElevation = false;
        try { return await this.request(command, input); }
        catch (error) {
          if (this.disposed) throw error;
          // The normal worker restored its flags before handing off. If UAC
          // was declined or the privileged worker failed, re-hide the entries
          // that do not require elevation instead of leaving every icon visible.
          await this.stopWorker();
          this.elevated = false; this.requiresElevation = false;
          const errors = await this.request(command, input);
          return [...errors, '管理員確認未完成，受權限保護的桌面捷徑尚未隱藏。請重新啟動小助手，並在 Windows 確認視窗按「是」。'];
        }
      }
      if (failure) throw failure;
      return response;
    });
    this.operations = result.catch(() => {});
    return result;
  }
  async stopWorker() {
    const child = this.child;
    if (child && child.exitCode === null) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('桌面圖示程序仍在還原檔案，請稍後再試。')), 10000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.stdin.end();
      });
    }
    this.child = null; this.ready = null;
  }
  sync(paths) { return this.enqueue('sync', { paths }); }
  reveal(file) { return this.enqueue('reveal', { file }); }
  dispose() {
    this.disposed = true;
    this.child?.stdin.end(); // EOF restores all owned flags before exiting.
  }
}
module.exports = { DesktopIconVisibility, ELEVATION_SETUP_HINT };
