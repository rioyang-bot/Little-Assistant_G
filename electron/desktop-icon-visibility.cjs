const { spawn } = require('child_process');
const path = require('path');
const { randomUUID } = require('crypto');
const { getNativeScriptPath } = require('./organizer-files.cjs');

// Keep file paths intact. The native service journals only the attribute bits
// it adds and restores them when the owner exits, including an owner crash.
class DesktopIconVisibility {
  constructor(userDir, desktopDirectory, options = {}) {
    this.journal = path.join(userDir, 'desktop-icon-visibility.json');
    this.desktopDirectory = desktopDirectory;
    this.pending = new Map();
    this.allowElevation = options.allowElevation !== false;
    this.pipeTransport = options.pipeTransport === true;
    this.operations = Promise.resolve();
  }
  prepare() {
    if (this.disposed) return Promise.reject(new Error('桌面圖示程序已關閉。'));
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File',
        getNativeScriptPath('windows-desktop-icons.ps1'), '-JournalPath', this.journal,
        '-OwnerPid', String(process.pid), '-DesktopDirectory', this.desktopDirectory,
        this.elevated ? '-ElevateWorker' : this.pipeTransport ? '-PipeWorker' : '-LaunchWorker'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '', diagnostics = '';
      let timer = setTimeout(() => { child.kill(); reject(new Error('桌面圖示服務尚未就緒。')); }, 15000);
      child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-1000); });
      const failed = (code, signal) => {
        if (this.child !== child) return;
        clearTimeout(timer); this.child = null; this.ready = null;
        const error = new Error(`桌面圖示服務已停止（${code ?? signal ?? '啟動失敗'}）。${diagnostics}`);
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
          } else if (message.ready === false) {
            this.requiresElevation = message.requiresElevation === true;
            const error = new Error(message.error); error.requiresElevation = this.requiresElevation;
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
      if ((this.requiresElevation || failure?.requiresElevation) && this.allowElevation && !this.elevationAttempted && !this.disposed) {
        this.elevationAttempted = true;
        await this.stopWorker();
        this.elevated = true; this.requiresElevation = false;
        try { return await this.request(command, input); }
        catch (error) { this.elevated = false; throw error; }
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
module.exports = { DesktopIconVisibility };
