const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const { ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { getStoragePath } = require('./storage-utils.cjs');
const execFileAsync = promisify(execFile);
const youtubeDlBinary = path.join(path.dirname(require.resolve('youtube-dl-exec/package.json')), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm']);
const ALARM_PRESETS = [
  'notification-064', 'cheerful-harp', 'ringtone-088', 'ringtone-070',
  'ringtone-065', 'ringtone-066', 'ringtone-067', 'ringtone-062',
  'ringtone-047', 'ringtone-080', 'ringtone-042', 'notification-066'
];
const PRESET_SOUND_FILES = {
  'notification-064': 'universfield-new-notification-064-494547.mp3',
  'cheerful-harp': 'chrysalyn-cheerful-traditional-harp-positive-ui-alert-540977.mp3',
  'ringtone-088': 'universfield-ringtone-088-496414.mp3',
  'ringtone-070': 'universfield-ringtone-070-496271.mp3',
  'ringtone-065': 'universfield-ringtone-065-496263.mp3',
  'ringtone-066': 'universfield-ringtone-066-496266.mp3',
  'ringtone-067': 'universfield-ringtone-067-496273.mp3',
  'ringtone-062': 'universfield-ringtone-062-496262.mp3',
  'ringtone-047': 'universfield-ringtone-047-494553.mp3',
  'ringtone-080': 'universfield-ringtone-080-496338.mp3',
  'ringtone-042': 'universfield-ringtone-042-487904.mp3',
  'notification-066': 'universfield-new-notification-066-494545.mp3'
};
const DEFAULT_CONFIG = {
  soundType: 'preset',
  preset: 'notification-064',
  customPaths: [],
  url: '',
  duration: '1'
};

class AlarmService {
  constructor(getMainWindow, getStickyNotes) {
    this.getMainWindow = getMainWindow;
    this.getStickyNotes = getStickyNotes;
    this.configPath = getStoragePath('alarm-config.json');
    this.config = this.loadConfig();
    this.timer = null;
    this.nativeSoundTimer = null;
    this.nativeStopTimer = null;
    this.nativeSoundProcess = null;
    this.youtubeWindow = null;
    this.youtubeVerifyTimer = null;
    this.playbackGeneration = 0;
    this.setupIpc();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(this.configPath, 'utf8')) };
    } catch (error) { console.warn('Failed to load alarm config:', error.message); }
    return { ...DEFAULT_CONFIG };
  }

  async saveConfig(input = {}) {
    const type = ['preset', 'custom', 'url'].includes(input.soundType) ? input.soundType : 'preset';
    const duration = ['1', '5', '10', 'continuous'].includes(String(input.duration)) ? String(input.duration) : '1';
    this.config = {
      soundType: type,
      preset: ALARM_PRESETS.includes(input.preset) ? input.preset : 'notification-064',
      customPaths: Array.isArray(input.customPaths) ? input.customPaths.filter(value => typeof value === 'string').slice(0, 500) : [],
      url: typeof input.url === 'string' ? input.url.trim().slice(0, 2000) : '',
      duration,
      cachedSourceUrl: '',
      cachedAudioPath: ''
    };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    let cacheError = '';
    if (type === 'url' && this.getYoutubeId(this.config.url)) {
      try {
        const cachePath = path.join(path.dirname(this.configPath), 'alarm-youtube.m4a');
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        await this.runYoutubeDl(this.config.url, ['--force-overwrites', '-f', 'bestaudio[ext=m4a]', '-o', cachePath]);
        if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
          this.config.cachedSourceUrl = this.config.url;
          this.config.cachedAudioPath = cachePath;
          fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
        }
      } catch (error) {
        console.warn('Unable to cache YouTube alarm audio:', error.message);
        cacheError = error.message || 'YouTube audio download failed';
      }
    }
    return cacheError
      ? { success: false, error: `YouTube 音訊快取失敗：${cacheError}`, config: this.config }
      : { success: true, config: this.config };
  }

  async chooseAudio(kind, window) {
    const properties = kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'];
    const result = await dialog.showOpenDialog(window || undefined, {
      title: kind === 'folder' ? '選擇鬧鐘音效資料夾' : '選擇鬧鐘音效',
      properties,
      filters: kind === 'folder' ? undefined : [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS].map(ext => ext.slice(1)) }]
    });
    if (result.canceled) return { success: false, canceled: true, paths: [] };
    let paths = result.filePaths;
    if (kind === 'folder' && paths[0]) {
      paths = fs.readdirSync(paths[0], { withFileTypes: true })
        .filter(entry => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map(entry => path.join(result.filePaths[0], entry.name));
    }
    return { success: true, paths };
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.check(), 1000);
    this.check();
  }

  stopNativeSound() {
    this.playbackGeneration += 1;
    if (this.nativeSoundTimer) clearInterval(this.nativeSoundTimer);
    if (this.nativeStopTimer) clearTimeout(this.nativeStopTimer);
    this.nativeSoundTimer = null;
    this.nativeStopTimer = null;
    if (this.nativeSoundProcess) {
      try { this.nativeSoundProcess.kill(); } catch (error) { console.warn('Failed to stop native alarm player:', error.message); }
      this.nativeSoundProcess = null;
    }
    if (this.youtubeVerifyTimer) clearTimeout(this.youtubeVerifyTimer);
    this.youtubeVerifyTimer = null;
    if (this.youtubeWindow && !this.youtubeWindow.isDestroyed()) this.youtubeWindow.destroy();
    this.youtubeWindow = null;
  }

  getYoutubeId(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('/')[0];
      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const parts = url.pathname.split('/').filter(Boolean);
        if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
      }
    } catch (error) { }
    return '';
  }

  getNodeRuntimePath() {
    const candidates = [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : '',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe') : ''
    ].filter(Boolean);
    for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
    try {
      return String(execFileSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true })).split(/\r?\n/).find(Boolean) || '';
    } catch (error) { return ''; }
  }

  async runYoutubeDl(url, extraArgs = []) {
    const videoId = this.getYoutubeId(url);
    if (!videoId) throw new Error('無法辨識 YouTube 影片 ID');
    const nodeRuntime = this.getNodeRuntimePath();
    if (!nodeRuntime) throw new Error('找不到 YouTube 所需的 Node.js JavaScript runtime');
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      '--js-runtimes', `node:${nodeRuntime}`,
      '--remote-components', 'ejs:github',
      '--no-playlist',
      '--no-warnings',
      ...extraArgs,
      cleanUrl
    ];
    return execFileAsync(youtubeDlBinary, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  }

  startYoutubeSound(videoId) {
    this.stopNativeSound();
    this.youtubeWindow = new BrowserWindow({
      show: false,
      width: 4,
      height: 4,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    this.youtubeWindow.webContents.setAudioMuted(false);
    const encodedId = encodeURIComponent(videoId);
    const embedUrl = `https://www.youtube.com/embed/${encodedId}?autoplay=1&mute=0&loop=1&playlist=${encodedId}&playsinline=1`;
    const forcePlayback = async () => {
      if (!this.youtubeWindow || this.youtubeWindow.isDestroyed()) return false;
      try {
        return await this.youtubeWindow.webContents.executeJavaScript(`(() => {
          const video = document.querySelector('video');
          if (!video) return false;
          video.muted = false; video.volume = 1; video.loop = true;
          video.play().catch(() => {});
          return !video.paused && !video.muted && video.volume > 0;
        })()`);
      } catch (error) { return false; }
    };
    this.youtubeWindow.webContents.once('did-finish-load', async () => {
      await forcePlayback();
      this.youtubeVerifyTimer = setTimeout(async () => {
        this.youtubeVerifyTimer = null;
        const playing = await forcePlayback();
        if (!playing) {
          if (this.youtubeWindow && !this.youtubeWindow.isDestroyed()) this.youtubeWindow.destroy();
          this.youtubeWindow = null;
          this.startNativeSound();
        }
      }, 3500);
    });
    this.youtubeWindow.webContents.once('did-fail-load', () => {
      if (this.youtubeWindow && !this.youtubeWindow.isDestroyed()) this.youtubeWindow.destroy();
      this.youtubeWindow = null;
      this.startNativeSound();
    });
    this.youtubeWindow.loadURL(embedUrl, {
      extraHeaders: 'Referer: https://www.youtube.com/\r\nOrigin: https://www.youtube.com\r\n'
    }).catch(() => {
      if (this.youtubeWindow && !this.youtubeWindow.isDestroyed()) this.youtubeWindow.destroy();
      this.youtubeWindow = null;
      this.startNativeSound();
    });
  }

  startConfiguredSound() {
    const youtubeId = this.config.soundType === 'url' ? this.getYoutubeId(this.config.url) : '';
    const cachedYoutube = this.config.cachedSourceUrl === this.config.url
      && this.config.cachedAudioPath
      && fs.existsSync(this.config.cachedAudioPath);
    if (youtubeId && cachedYoutube) {
      this.stopNativeSound();
      if (!this.startWindowsMediaPlayer(this.config.cachedAudioPath)) this.startYoutubeStream(this.config.url);
      else if (this.config.duration !== 'continuous') {
        this.nativeStopTimer = setTimeout(() => this.stopNativeSound(), Number(this.config.duration || 1) * 60000);
      }
    } else if (youtubeId) {
      this.startYoutubeStream(this.config.url);
    } else if (this.config.soundType === 'custom') {
      const playable = (this.config.customPaths || []).filter(file => fs.existsSync(file));
      const selected = playable.length ? playable[Math.floor(Math.random() * playable.length)] : '';
      this.stopNativeSound();
      if (!selected || !this.startWindowsMediaPlayer(selected)) this.startNativeSound();
      else if (this.config.duration !== 'continuous') {
        this.nativeStopTimer = setTimeout(() => this.stopNativeSound(), Number(this.config.duration || 1) * 60000);
      }
    } else if (this.config.soundType === 'url' && /^https?:\/\//i.test(this.config.url)) {
      this.stopNativeSound();
      if (!this.startWindowsMediaPlayer(this.config.url)) this.startNativeSound();
      else if (this.config.duration !== 'continuous') {
        this.nativeStopTimer = setTimeout(() => this.stopNativeSound(), Number(this.config.duration || 1) * 60000);
      }
    } else {
      this.startNativeSound();
    }
  }

  startWindowsMediaPlayer(source) {
    if (process.platform !== 'win32' || !source) return false;
    try {
      const safeSource = String(source).replace(/'/g, "''");
      const script = `Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Volume = 1.0; $player.Open([Uri]'${safeSource}'); Start-Sleep -Milliseconds 1500; $player.Play(); while ($true) { Start-Sleep -Milliseconds 250; if ($player.NaturalDuration.HasTimeSpan -and $player.Position.TotalMilliseconds -ge ($player.NaturalDuration.TimeSpan.TotalMilliseconds - 500)) { $player.Position = [TimeSpan]::Zero; $player.Play() } }`;
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Sta', '-WindowStyle', 'Hidden', '-Command', script], {
        windowsHide: true,
        stdio: 'ignore'
      });
      this.nativeSoundProcess = child;
      child.once('exit', () => {
        if (this.nativeSoundProcess === child) this.nativeSoundProcess = null;
      });
      child.once('error', error => console.warn('Windows Media Player alarm failed:', error.message));
      return true;
    } catch (error) {
      console.warn('Unable to start Windows Media Player alarm:', error.message);
      return false;
    }
  }

  async startYoutubeStream(url) {
    this.stopNativeSound();
    const generation = this.playbackGeneration;
    try {
      const result = await this.runYoutubeDl(url, ['--get-url', '-f', 'bestaudio[ext=m4a]/bestaudio']);
      if (generation !== this.playbackGeneration) return;
      const streamUrl = String(result.stdout || '').split(/\r?\n/).find(line => /^https?:\/\//i.test(line.trim()));
      if (!streamUrl || !this.startWindowsMediaPlayer(streamUrl.trim())) throw new Error('No playable YouTube audio stream');
      if (this.config.duration !== 'continuous') {
        this.nativeStopTimer = setTimeout(() => this.stopNativeSound(), Number(this.config.duration || 1) * 60000);
      }
    } catch (error) {
      if (generation !== this.playbackGeneration) return;
      console.warn('YouTube audio stream failed:', error.message);
      // URL mode must never silently play a file left over from Custom Audio mode.
      this.startNativeSound();
    }
  }

  startNativeSound() {
    this.stopNativeSound();
    const fileName = PRESET_SOUND_FILES[this.config.preset] || PRESET_SOUND_FILES['notification-064'];
    let presetPath = path.join(__dirname, '..', 'assets', 'alarm-sounds', fileName);
    if (presetPath.includes('app.asar')) presetPath = presetPath.replace('app.asar', 'app.asar.unpacked');
    const started = fs.existsSync(presetPath) && this.startWindowsMediaPlayer(presetPath);
    if (!started) {
      const beep = () => {
        try { shell.beep(); } catch (error) { console.warn('Native alarm beep failed:', error.message); }
      };
      beep();
      this.nativeSoundTimer = setInterval(beep, 1400);
    }
    if (this.config.duration !== 'continuous') {
      this.nativeStopTimer = setTimeout(() => this.stopNativeSound(), Number(this.config.duration || 1) * 60000);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopNativeSound();
  }

  check() {
    const notes = this.getStickyNotes();
    const due = notes && typeof notes.getDueAlarms === 'function' ? notes.getDueAlarms() : [];
    if (!due.length) return;
    this.startConfiguredSound();
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('alarm-triggered', { notes: due, config: this.config });
  }

  setupIpc() {
    ipcMain.handle('alarm-get-config', () => this.config);
    ipcMain.handle('alarm-save-config', (event, input) => this.saveConfig(input));
    ipcMain.handle('alarm-choose-audio', (event, kind) => this.chooseAudio(kind, event.sender.getOwnerBrowserWindow()));
    ipcMain.handle('alarm-test', () => {
      this.startConfiguredSound();
      const win = this.getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send('alarm-triggered', { notes: [{ id: 'test', title: '鬧鐘測試' }], config: this.config, isTest: true });
      return { success: true };
    });
    ipcMain.handle('alarm-stop-test', () => {
      this.stopNativeSound();
      const win = this.getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send('alarm-stopped');
      return { success: true };
    });
  }
}

module.exports = { AlarmService, DEFAULT_CONFIG, AUDIO_EXTENSIONS, ALARM_PRESETS, PRESET_SOUND_FILES };
