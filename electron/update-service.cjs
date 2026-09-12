class UpdateService {
  constructor({ app, autoUpdater, getWindow, getLanguage }) {
    this.app = app;
    this.autoUpdater = autoUpdater;
    this.getWindow = getWindow;
    this.getLanguage = getLanguage;
    this.enabled = true;
    this.checkTimer = null;
    this.intervalTimer = null;
    this.downloaded = false;
    this.bindEvents();
  }

  bindEvents() {
    this.autoUpdater.autoDownload = true;
    this.autoUpdater.autoInstallOnAppQuit = true;
    this.autoUpdater.on('checking-for-update', () => this.sendStatus('checking'));
    this.autoUpdater.on('update-available', info => this.sendStatus('available', { version: info.version }));
    this.autoUpdater.on('update-not-available', info => this.sendStatus('current', { version: info?.version || this.app.getVersion() }));
    this.autoUpdater.on('download-progress', progress => this.sendStatus('downloading', { percent: Math.round(progress.percent || 0) }));
    this.autoUpdater.on('update-downloaded', info => {
      this.downloaded = true;
      this.sendStatus('downloaded', { version: info.version });
    });
    this.autoUpdater.on('error', error => this.sendStatus('error', { message: error?.message || String(error) }));
  }

  sendStatus(status, detail = {}) {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update-status', { status, ...detail });
  }

  isSupportedBuild() {
    return this.app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
  }

  start(enabled = true) {
    this.enabled = enabled !== false;
    if (!this.enabled || !this.isSupportedBuild()) return;
    clearTimeout(this.checkTimer);
    clearInterval(this.intervalTimer);
    this.checkTimer = setTimeout(() => this.check(false), 30000);
    this.intervalTimer = setInterval(() => this.check(false), 6 * 60 * 60 * 1000);
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    clearTimeout(this.checkTimer);
    clearInterval(this.intervalTimer);
    this.checkTimer = null;
    this.intervalTimer = null;
    if (this.enabled) this.start(true);
    return this.enabled;
  }

  async check(manual = true) {
    if (!this.isSupportedBuild()) {
      const code = this.app.isPackaged ? 'portable' : 'development';
      const result = { success: false, code, message: 'Updates are checked only in the installed app.' };
      if (manual) this.sendStatus(code, result);
      return result;
    }
    if (!this.enabled && !manual) return { success: false, code: 'disabled' };
    try {
      await this.autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      this.sendStatus('error', { message: error.message });
      return { success: false, error: error.message };
    }
  }

  install() {
    if (!this.downloaded) return { success: false, error: 'No downloaded update is ready.' };
    setImmediate(() => this.autoUpdater.quitAndInstall(false, true));
    return { success: true };
  }

  stop() {
    clearTimeout(this.checkTimer);
    clearInterval(this.intervalTimer);
    this.checkTimer = null;
    this.intervalTimer = null;
  }
}

module.exports = { UpdateService };
