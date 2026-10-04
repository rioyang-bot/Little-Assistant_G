const { spawn } = require('child_process');
const { getNativeScriptPath } = require('./organizer-files.cjs');
const { randomUUID } = require('crypto');

// A warm STA process supplies Windows OLE Move semantics. Electron startDrag
// exposes copy/link operations, which would leave duplicate files behind.
class WindowsFileDrag {
  constructor() { this.pending = new Map(); }
  prepare() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', getNativeScriptPath('windows-file-drag.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '';
      const timer = setTimeout(() => { reject(new Error('檔案拖曳服務尚未就緒，請再試一次。')); child.kill(); }, 15000);
      const failed = () => {
        clearTimeout(timer); this.child = null; this.ready = null;
        reject(new Error('無法啟動 Windows 檔案拖曳服務。'));
        for (const task of this.pending.values()) task.reject(new Error('檔案拖曳已中止。'));
        this.pending.clear();
      };
      child.on('error', failed); child.on('exit', failed);
      child.stdin.on('error', () => {});
      child.stderr.on('data', () => {});
      child.stdout.on('data', chunk => {
        buffer += chunk.toString('utf8');
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line);
            if (message.ready) { clearTimeout(timer); resolve(); }
            else if (this.pending.has(message.id)) {
              const task = this.pending.get(message.id); this.pending.delete(message.id);
              if (message.error) task.reject(new Error('無法拖曳此檔案，請確認檔案仍存在後再試。')); else task.resolve(Array.isArray(message.restored) ? {effect:message.effect,restored:message.restored} : message.effect);
            }
          } catch { /* Ignore non-protocol output from the fixed helper. */ }
        }
      });
    });
    return this.ready;
  }
  async drag(file) {
    await this.prepare();
    if (!this.child || this.pending.size) throw new Error('另一個檔案正在拖曳，請稍後再試。');
    return new Promise((resolve, reject) => {
      const id = randomUUID(); this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(Array.isArray(file) ? { id, files:file } : { id, file }) + '\n');
    });
  }
  dispose() {
    const child = this.child;
    if (!child) return;
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 1500); timer.unref();
    child.once('exit', () => clearTimeout(timer));
  }
}
module.exports = { WindowsFileDrag };
