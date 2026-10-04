const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { getNativeScriptPath } = require('./organizer-files.cjs');

class WindowsContextMenu {
  constructor() { this.pending = new Map(); }
  prepare() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', getNativeScriptPath('windows-context-menu.ps1')], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
      this.child = child;
      let buffer='', diagnostics='';
      const timer=setTimeout(()=>{child.kill();reject(new Error('Windows 右鍵選單尚未就緒，請再試一次。'));},20000);
      const failed=()=>{
        clearTimeout(timer);
        if(this.child===child){this.child=null;this.ready=null;}
        const error=new Error('Windows 右鍵選單服務已停止。'+diagnostics);
        reject(error); for(const task of this.pending.values())task.reject(error); this.pending.clear();
      };
      child.on('error',failed);child.on('exit',failed);child.stdin.on('error',()=>{});
      child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-1200);});
      child.stdout.on('data',chunk=>{
        buffer+=chunk.toString('utf8');let end;
        while((end=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
          let message;try{message=JSON.parse(line);}catch{continue;}
          if(message.ready){this.hostHandle=message.host;clearTimeout(timer);resolve();}
          else if(message.clipboardChanged){this.onClipboardChanged?.(message.sequence);}
          else if(message.beforeInvoke && this.pending.has(message.id)){
            const task=this.pending.get(message.id);
            Promise.resolve().then(()=>task.beforeInvoke?.(message.verb)).then(()=>child.stdin.write(JSON.stringify({continue:message.id})+'\n'),error=>{
              task.reject(error);this.pending.delete(message.id);child.stdin.write(JSON.stringify({continue:message.id,cancel:true})+'\n');
            });
          }
          else if(this.pending.has(message.id)){
            const task=this.pending.get(message.id);this.pending.delete(message.id);
            if(message.error)task.reject(new Error('無法開啟 Windows 右鍵選單。'+message.error));else task.resolve(message);
          }
        }
      });
    });
    return this.ready;
  }
  async show(request, beforeInvoke) {
    await this.prepare();
    if(!this.child || this.pending.size)throw new Error('另一個 Windows 選單仍在使用中。');
    return new Promise((resolve,reject)=>{
      const id=randomUUID();this.pending.set(id,{resolve,reject,beforeInvoke});
      this.child.stdin.write(JSON.stringify({...request,id})+'\n');
    });
  }
  dispose() {
    const child=this.child;if(!child)return;
    child.stdin.end();const timer=setTimeout(()=>child.kill(),2000);timer.unref();child.once('exit',()=>clearTimeout(timer));
  }
}
module.exports={WindowsContextMenu};
