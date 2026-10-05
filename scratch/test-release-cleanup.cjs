const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const {cleanReleaseArtifacts} = require('../build/clean-release-artifacts.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'assistant-release-cleanup-'));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('assistant-release-cleanup-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  const workspace = path.join(root,'workspace'), release = path.join(workspace,'release');
  fs.mkdirSync(release,{recursive:true});
  fs.writeFileSync(path.join(workspace,'package.json'),JSON.stringify({version:'1.7.0'}));
  const name='METech-desktop-assistant-Setup-1.7.0.exe', bytes=Buffer.from('verified installer fixture');
  const digest=crypto.createHash('sha512').update(bytes).digest('base64');
  fs.writeFileSync(path.join(release,name),bytes);
  fs.writeFileSync(path.join(release,name+'.blockmap'),'blockmap');
  fs.writeFileSync(path.join(release,'latest.yml'),yaml.dump({version:'1.7.0',path:name,sha512:digest,files:[{url:name,sha512:digest,size:bytes.length}]}));
  return {root,workspace,release,name};
}
test('release cleanup preserves the current update files and unrelated documents while removing nested distribution copies',t=>{
  const f=fixture(t);
  const old=['METech-desktop-assistant-Setup-1.6.0.exe','METech小助手 Setup 1.7.0.exe','METech-desktop-assistant-Portable-1.7.0.exe','METech小助手-Portable-1.6.0.exe','METech小助手 Setup 1.6.0.zip'];
  for(const name of old)fs.writeFileSync(path.join(f.release,name),'obsolete');
  fs.mkdirSync(path.join(f.release,'previous'));
  fs.writeFileSync(path.join(f.release,'previous',f.name),'duplicate');
  fs.writeFileSync(path.join(f.release,'customer.exe'),'unrelated');
  fs.writeFileSync(path.join(f.release,'document.txt'),'original document');
  const result=cleanReleaseArtifacts(f.workspace);
  assert.equal(result.removed.length,6);
  assert.ok(fs.existsSync(path.join(f.release,f.name+'.blockmap')));
  assert.ok(fs.existsSync(path.join(f.release,'latest.yml')));
  assert.equal(fs.readFileSync(path.join(f.release,'document.txt'),'utf8'),'original document');
  assert.ok(fs.existsSync(path.join(f.release,'customer.exe')));
});
test('a damaged current installer aborts cleanup before deleting old installers',t=>{
  const f=fixture(t),old=path.join(f.release,'METech-desktop-assistant-Setup-1.6.0.exe');
  fs.writeFileSync(old,'previous'); fs.appendFileSync(path.join(f.release,f.name),'damaged');
  assert.throws(()=>cleanReleaseArtifacts(f.workspace)); assert.ok(fs.existsSync(old));
});
test('release cleanup does not traverse links to data outside the release directory',t=>{
  const f=fixture(t),outside=path.join(f.root,'outside'); fs.mkdirSync(outside);
  const file=path.join(outside,'METech小助手 Setup 1.6.0.exe'); fs.writeFileSync(file,'external file');
  fs.symlinkSync(outside,path.join(f.release,'linked'),process.platform==='win32'?'junction':'dir');
  cleanReleaseArtifacts(f.workspace); assert.equal(fs.readFileSync(file,'utf8'),'external file');
});
