const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function getNativeScriptPath(name, directory = __dirname) {
  return path.join(directory, name).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function isWithin(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

// Destinations are private per-item folders. Never replace an existing file.
function moveFile(source, destination, io = fs) {
  if (io.existsSync(destination)) throw new Error('原位置已有同名檔案，無法移回；請先移走同名檔案。');
  io.mkdirSync(path.dirname(destination), { recursive: true });
  try { io.renameSync(source, destination); return { sourceRetained: false }; }
  catch (error) { if (error.code !== 'EXDEV') throw error; }
  io.cpSync(source, destination, { recursive: true, force: false, errorOnExist: true, dereference: false });
  // If another application locks the source, retain the completed destination.
  // Both copies remain accessible rather than discarding the completed transfer.
  try { io.rmSync(source, { recursive: true, force: false }); return { sourceRetained: false }; }
  catch { return { sourceRetained: true }; }
}

const iconJobs = [];
let activeJobs = 0;
function pumpIcons() {
  while (activeJobs < 2 && iconJobs.length) {
    const { run, resolve } = iconJobs.shift();
    activeJobs++;
    run().then(resolve, () => resolve('')).finally(() => { activeJobs--; pumpIcons(); });
  }
}
function extractWindowsIcon(iconPath, iconIndex, mode) {
  if (process.platform !== 'win32') return Promise.resolve('');
  return new Promise(resolve => {
    iconJobs.push({ resolve, run: () => new Promise(done => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', getNativeScriptPath('windows-shortcut-icon.ps1')], {
        windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024,
        env: { ...process.env, METECH_ORGANIZER_ICON_PATH: iconPath, METECH_ORGANIZER_ICON_INDEX: String(iconIndex), METECH_ORGANIZER_ICON_MODE: mode }
      }, (error, stdout) => {
        const value = stdout?.trim() || '';
        done(!error && /^[A-Za-z0-9+/=]+$/.test(value) ? `data:image/png;base64,${value}` : '');
      });
    }) });
    pumpIcons();
  });
}

function extractShortcutIcon(iconPath, iconIndex = 0) { return extractWindowsIcon(iconPath, iconIndex, 'resource'); }
function extractShellIcon(filePath) { return extractWindowsIcon(path.resolve(filePath), 0, 'shell'); }

function expandWindowsPath(value) {
  return String(value || '').replace(/^"(.*)"$/, '$1').replace(/%([^%]+)%/g, (all, name) => {
    const key = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase());
    return key ? process.env[key] : all;
  });
}

module.exports = { isWithin, moveFile, extractShortcutIcon, extractShellIcon, expandWindowsPath, getNativeScriptPath };
