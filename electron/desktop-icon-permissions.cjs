const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const { getNativeScriptPath } = require('./organizer-files.cjs');
const execute = promisify(execFile);
const protectedDirectoryCache = new Map();

// Elevated PowerShell may only run scripts that ordinary programs cannot
// replace. The app runs with a normal token, so a successful write probe means
// the install directory is user-writable (development copy or an old per-user
// installation) and UAC elevation from it must be refused.
function isAdminProtectedDirectory(directory = path.dirname(getNativeScriptPath('windows-desktop-icons.ps1'))) {
  const key = path.resolve(directory).toLowerCase();
  if (protectedDirectoryCache.has(key)) return protectedDirectoryCache.get(key);
  let protectedDirectory = false;
  const probe = path.join(directory, `.metech-write-probe-${process.pid}-${randomUUID()}`);
  try {
    fs.writeFileSync(probe, '', { flag: 'wx' });
    try { fs.unlinkSync(probe); } catch { /* Best effort cleanup of an empty probe. */ }
  } catch (error) {
    protectedDirectory = ['EPERM', 'EACCES'].includes(error.code);
  }
  protectedDirectoryCache.set(key, protectedDirectory);
  return protectedDirectory;
}

const UNPROTECTED_INSTALL_ERROR = '小助手未安裝在受管理員保護的 Program Files 位置，已停止需要管理員權限的設定。請使用最新安裝程式重新安裝後再試。';

function readBroker(userDir) {
  try {
    if (process.platform !== 'win32' || path.resolve(userDir).toLowerCase() !== path.resolve(process.env.APPDATA, 'METechAssistant').toLowerCase()) return null;
    const value = JSON.parse(fs.readFileSync(path.join(userDir, 'desktop-icon-broker.json'), 'utf8'));
    const root = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'METechAssistant', 'DesktopIconBroker');
    if (value.schema !== 1 || !/^S-1-5-21-(\d+-){3}\d+$/.test(value.sid) || value.taskName !== `METechAssistant-DesktopIcons-${value.sid}`) return null;
    if (path.resolve(value.root).toLowerCase() !== root.toLowerCase()) return null;
    if (!fs.existsSync(path.join(root, value.sid, 'config.json'))) return null;
    const requestFile = path.join(process.env.LOCALAPPDATA, 'METechAssistant', 'desktop-icon-broker-request.json');
    if (path.resolve(value.requestFile).toLowerCase() !== requestFile.toLowerCase()) return null;
    return { ...value, enabled: value.enabled !== false };
  } catch { return null; }
}

class DesktopIconPermissions {
  constructor(userDir, getPaths) { this.userDir = userDir; this.getPaths = getPaths; this.busy = null; }
  run(mode) {
    if (this.busy) return this.busy;
    this.busy = this.execute(mode).finally(() => { this.busy = null; });
    return this.busy;
  }
  async execute(mode) {
    if (!['Setup', 'Install', 'Grant', 'Restore', 'Remove', 'Status'].includes(mode)) throw new Error('Invalid permission operation');
    if (mode !== 'Status' && !(this.isProtectedInstall ?? isAdminProtectedDirectory())) throw new Error(UNPROTECTED_INSTALL_ERROR);
    const paths = [...new Set(this.getPaths())].filter(file => /\.(lnk|url)$/i.test(file));
    let result;
    try { result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File',
      getNativeScriptPath('windows-desktop-icon-permissions.ps1'), '-Mode', mode], {
      windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024,
      env: { ...process.env, METECH_PERMISSION_PATHS: JSON.stringify(paths) }
    }); } catch (error) {
      let failure;
      try { failure = JSON.parse(error.stdout?.trim()); } catch {}
      throw new Error(failure?.error || '管理員設定未完成，請確認 Windows 提示後再試。');
    }
    const data = JSON.parse(result.stdout.trim());
    if (!data.success) throw new Error(data.error || '桌面圖示權限設定失敗。');
    return data;
  }
  setBrokerEnabled(enabled) {
    const broker = readBroker(this.userDir);
    if (!broker) throw new Error('請先啟用背景輔助程序。');
    broker.enabled = enabled === true;
    fs.writeFileSync(path.join(this.userDir, 'desktop-icon-broker.json'), JSON.stringify(broker, null, 2));
  }
}
module.exports = { DesktopIconPermissions, readBroker, isAdminProtectedDirectory, UNPROTECTED_INSTALL_ERROR };
