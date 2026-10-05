const path = require('path');
const { spawn } = require('child_process');

// A per-machine update needs a UAC confirmation after the app has quit. If the
// user declines, no installer runs and nothing would restart the assistant.
// This detached watchdog restarts the existing version once neither the app,
// the elevation helper nor the installer is running. Values arrive through
// environment variables only; the script text is fixed.
const WATCHDOG_SCRIPT = `
$exe = $env:METECH_RELAUNCH_EXE
$parent = [int]$env:METECH_RELAUNCH_PARENT
$name = [IO.Path]::GetFileNameWithoutExtension($exe)
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Process -Id $parent -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
$idle = 0
$stop = (Get-Date).AddMinutes(30)
while ((Get-Date) -lt $stop) {
  Start-Sleep -Seconds 2
  if (Get-Process -Name $name -ErrorAction SilentlyContinue) { exit 0 }
  $installing = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like ($name + '-Setup*') -or $_.ProcessName -eq 'elevate' }
  if ($installing) { $idle = 0; continue }
  $idle += 2
  if ($idle -ge 20) {
    if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe }
    exit 0
  }
}
`;

function buildRelaunchWatchdog(exePath, parentPid, baseEnv = process.env) {
  if (!path.isAbsolute(String(exePath || '')) || !Number.isInteger(parentPid) || parentPid <= 0) return null;
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(WATCHDOG_SCRIPT, 'utf16le').toString('base64')],
    env: { ...baseEnv, METECH_RELAUNCH_EXE: exePath, METECH_RELAUNCH_PARENT: String(parentPid) }
  };
}

function startRelaunchWatchdog(exePath, parentPid = process.pid) {
  const launch = process.platform === 'win32' ? buildRelaunchWatchdog(exePath, parentPid) : null;
  if (!launch) return false;
  const child = spawn(launch.file, launch.args, { env: launch.env, detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', error => console.warn('Unable to start update relaunch watchdog:', error.message));
  child.unref();
  return true;
}

module.exports = { WATCHDOG_SCRIPT, buildRelaunchWatchdog, startRelaunchWatchdog };
