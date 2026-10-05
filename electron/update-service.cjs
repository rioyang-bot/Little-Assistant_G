class UpdateService {
  constructor({ app, autoUpdater, getWindow, getWindows, getLanguage, notifyDownloaded, beforeInstall, beforeQuitForInstall, verifyDownloadedUpdate, restartDelayMs = 5000 }) {
    this.app = app;
    this.autoUpdater = autoUpdater;
    this.getWindows = getWindows || (() => [getWindow?.()]);
    this.getLanguage = getLanguage;
    this.notifyDownloaded = notifyDownloaded;
    this.beforeInstall = beforeInstall;
    this.beforeQuitForInstall = beforeQuitForInstall;
    this.verifyDownloadedUpdate = verifyDownloadedUpdate;
    this.verifyGeneration = 0;
    this.restartDelayMs = restartDelayMs;
    this.enabled = true;
    this.checkTimer = null;
    this.downloaded = false;
    this.manualCheckPending = false;
    this.installTimer = null;
    this.installQueued = false;
    this.installGeneration = 0;
    this.stopped = false;
    this.lastStatus = null;
    this.bindEvents();
  }

  bindEvents() {
    this.autoUpdater.autoDownload = true;
    // Installing on quit would bypass signature verification, so it is only
    // enabled when no verifier is configured.
    this.autoUpdater.autoInstallOnAppQuit = !this.verifyDownloadedUpdate;
    this.autoUpdater.autoRunAppAfterInstall = true;
    this.autoUpdater.on('checking-for-update', () => this.sendStatus('checking', { manual: this.manualCheckPending }));
    this.autoUpdater.on('update-available', info => {
      this.sendStatus('available', { version: info.version, manual: this.manualCheckPending });
      this.manualCheckPending = false;
    });
    this.autoUpdater.on('update-not-available', info => {
      this.sendStatus('current', { version: info?.version || this.app.getVersion(), manual: this.manualCheckPending });
      this.manualCheckPending = false;
    });
    this.autoUpdater.on('download-progress', progress => this.sendStatus('downloading', { percent: Math.round(progress.percent || 0) }));
    this.autoUpdater.on('update-downloaded', info => {
      if (!this.verifyDownloadedUpdate) return this.acceptDownloaded(info);
      const generation = ++this.verifyGeneration;
      Promise.resolve().then(() => this.verifyDownloadedUpdate(info)).then(() => {
        if (generation === this.verifyGeneration) this.acceptDownloaded(info);
      }, error => {
        if (generation !== this.verifyGeneration) return;
        this.downloaded = false;
        console.warn('Rejected downloaded update:', error?.message || error);
        this.sendStatus('error', {
          message: this.getLanguage?.() === 'en'
            ? 'The downloaded update failed the METech signature check and was not installed.'
            : '下載的更新未通過 METech 簽章驗證，已停止安裝。',
          manual: this.manualCheckPending
        });
        this.manualCheckPending = false;
      });
    });
    this.autoUpdater.on('error', error => {
      clearTimeout(this.installTimer); this.installTimer = null; this.installQueued = false;
      this.installGeneration++;
      this.sendStatus('error', { message: error?.message || String(error), manual: this.manualCheckPending });
      this.manualCheckPending = false;
    });
  }

  acceptDownloaded(info) {
    this.downloaded = true;
    if (this.installTimer || this.installQueued || this.stopped) return;
    const seconds = this.enabled && this.isSupportedBuild() ? Math.ceil(this.restartDelayMs / 1000) : 0;
    const detail = { version: info.version, autoInstallInSeconds: seconds };
    this.sendStatus('downloaded', detail);
    try { this.notifyDownloaded?.(detail); } catch { /* UI delivery cannot prevent installation. */ }
    if (seconds) this.installTimer = setTimeout(() => { this.installTimer = null; this.install(); }, this.restartDelayMs);
  }

  sendStatus(status, detail = {}) {
    this.lastStatus = { status, ...detail };
    for (const win of new Set(this.getWindows())) {
      if (!win || win.isDestroyed() || win.webContents.isDestroyed?.()) continue;
      try { win.webContents.send('update-status', this.lastStatus); } catch { /* A window may close during delivery. */ }
    }
  }

  getStatus() { return this.lastStatus; }

  isSupportedBuild() {
    return this.app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
  }

  start(enabled = true) {
    this.stopped = false;
    this.enabled = enabled !== false;
    if (!this.enabled || !this.isSupportedBuild()) return;
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => this.check(false), 30000);
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    clearTimeout(this.checkTimer);
    this.checkTimer = null;
    if (!this.enabled) {
      clearTimeout(this.installTimer); this.installTimer = null;
      if (this.downloaded && !this.installQueued) this.sendStatus('downloaded', { version: this.lastStatus?.version, autoInstallInSeconds: 0 });
    }
    if (this.enabled) this.start(true);
    return this.enabled;
  }

  async check(manual = true) {
    if (!this.isSupportedBuild()) {
      const code = this.app.isPackaged ? 'portable' : 'development';
      const result = { success: false, code, message: 'Updates are checked only in the installed app.' };
      if (manual) this.sendStatus(code, { ...result, manual: true });
      return result;
    }
    if (!this.enabled && !manual) return { success: false, code: 'disabled' };
    this.manualCheckPending = manual === true;
    try {
      const result = await this.autoUpdater.checkForUpdates();
      // Download failures are reported by the updater's error event. Consume
      // its separate promise as well so they cannot become uncaught rejections.
      result?.downloadPromise?.catch(() => {});
      return { success: true };
    } catch (error) {
      if (this.manualCheckPending) this.sendStatus('error', { message: error.message, manual: true });
      this.manualCheckPending = false;
      return { success: false, error: error.message };
    }
  }

  install() {
    if (!this.downloaded) return { success: false, error: 'No downloaded update is ready.' };
    if (this.stopped) return { success: false, error: 'Update service has stopped.' };
    if (this.installQueued) return { success: true };
    clearTimeout(this.installTimer); this.installTimer = null;
    this.installQueued = true;
    const generation = ++this.installGeneration;
    setImmediate(() => this.installDownloaded(generation));
    return { success: true };
  }

  async installDownloaded(generation) {
    if (this.stopped || generation !== this.installGeneration) return;
    try {
      const ready = !this.beforeInstall || await this.beforeInstall() !== false;
      if (this.stopped || generation !== this.installGeneration) return;
      if (!ready) {
        this.installQueued = false;
        this.sendStatus('waiting', { version: this.lastStatus?.version });
        if (!this.stopped && this.enabled) this.installTimer = setTimeout(() => { this.installTimer = null; this.install(); }, 1000);
        return;
      }
      this.sendStatus('installing', { version: this.lastStatus?.version });
      // A per-machine update asks for UAC after quitting; keep a way back if it is declined.
      try { this.beforeQuitForInstall?.(); } catch { /* Installation proceeds without the safety net. */ }
      // /S + --force-run: perform a silent installation, then relaunch the app.
      this.autoUpdater.quitAndInstall(true, true);
    } catch {
      if (this.stopped || generation !== this.installGeneration) return;
      this.installQueued = false;
      this.sendStatus('error', { message: this.getLanguage?.() === 'en' ? 'Unable to install the update. Please try again.' : '無法安裝更新，請再試一次。', manual: true });
    }
  }

  stop() {
    this.stopped = true;
    this.installGeneration++; this.installQueued = false;
    clearTimeout(this.checkTimer);
    this.checkTimer = null;
    clearTimeout(this.installTimer); this.installTimer = null;
  }
}

module.exports = { UpdateService };
