// ==========================================================================
// Backend & Main Process Localization Dictionary (zh-TW & en)
// ==========================================================================

const locales = {
  'zh-TW': {
    appName: 'METech小助手',
    trayToolTip: 'METech小助手',
    settingsWindowTitle: 'MEtech小助手 - 總覽設定',

    // Tray Menu
    tray: {
      title: 'METech小助手',
      boostBall: '⚡ 加速旋轉 (Boost)',
      resetSpeed: '🔄 重設標準轉速 (1.2x)',
      globeSpeed: '🌀 球體自轉速度',
      speedSlow: '0.5x 緩慢微轉',
      speedNormal: '1.0x 標準穩定',
      speedDefault: '1.2x 預設流暢 ⭐',
      speedFast: '2.5x 疾速旋轉',
      speedTurbo: '5.0x 渦輪超光速',
      speedCustom: '自訂速度（滾輪）',
      toggleQuotes: '💬 開啟/關閉提示對話',
      bubbleFontSize: '🔤 對話字體大小',
      fontSizeSm: '精簡小字 (0.9x)',
      fontSizeStd: '標準字體 (1.0x 預設) ⭐',
      fontSizeLg: '清晰大字 (1.25x)',
      fontSizeXl: '特大醒目 (1.45x)',
      assistantSize: '📏 助手尺寸',
      sizeMini: '微型 (0.75x)',
      sizeStd: '標準 (1.0x 預設)',
      sizeLg: '大型 (1.33x)',
      stickyNotesSize: '🗒️ 便利貼尺寸',
      stickySizeSm: '小型便利貼',
      stickySizeStd: '標準便利貼（預設）⭐',
      stickySizeLg: '大型便利貼',
      hideAssistant: '🙈 隱藏小助手',
      showAssistant: '👀 顯示小助手',
      windowMenu: '🪟 視窗與位置設定',
      alwaysOnBottom: '保持最下層顯示',
      alwaysOnTop: '保持最上層顯示',
      bottomUntilNotification: '最下層顯示，當有新事件通知時跳至最上層',
      moveMode: '✋ 拖曳移動模式',
      resetPosition: '🔄 復位至螢幕右下角',
      languageMenu: '🌐 語言 / Language',
      langZh: '繁體中文 (Chinese) ✓',
      langEn: 'English',
      emailMenu: '📬 郵件、行事曆與健康設定',
      emailSettings: '⚙️ 總覽設定...',
      checkNow: '🔄 立即檢查新郵件',
      checkCalendarNow: '📅 立即檢查今日與明日行程',
      testSingle: '✉️ 測試：模擬收到 1 封新郵件',
      testMulti: '📬 測試：模擬收到 3 封新郵件 (清單模式)',
      testHealth: '🍵 測試：模擬喝水久坐提醒',
      testCalendar: '📅 測試：模擬行事曆會議提醒',
      exploreTrivia: '💡 來則線上冷知識 / 笑話',
      focusMode: '🎯 勿擾／專注模式',
      focusModeActive: '🎯 專注模式進行中',
      focusOff: '關閉專注模式',
      focus30: '專注 30 分鐘',
      focus60: '專注 1 小時',
      focus120: '專注 2 小時',
      focusTomorrow: '專注到明天上午 8:00',
      checkUpdates: '🔄 檢查更新',
      quit: '❌ 結束小助手 (Quit)'
    },

    // Test Simulated Emails
    mockEmails: {
      teamName: 'MEtech 專案團隊',
      teamSubject: '【通知】收到一封新郵件，請查閱專案報告！',
      googleSender: 'Google 帳戶安全性',
      googleSubject: '安全性警示：新的登入活動確認',
      pmSender: '林專案經理 (MEtech)',
      pmSubject: '【急件】第三季 AI 助手專案進度週報表確認',
      ghSender: 'GitHub Notifications',
      ghSubject: '[GitHub] Release v1.2.0 is now published'
    },

    // Email Service Messages
    service: {
      missingFields: '請完整填寫信箱帳號、密碼與 IMAP 主機！',
      noActiveAccounts: '尚未設定任何已啟用的信箱帳號，請至少新增並啟用 1 組信箱！',
      disabled: '郵件監聽功能尚未開啟',
      checkingWait: '正在檢查中，請稍候...',
      testSuccess: (count) => `連線成功！收件匣目前共有 ${count} 封郵件。`,
      testAllSuccess: (passed, total) => `連線測試完成！共有 ${passed} / ${total} 組信箱連線成功。`,
      authError: '登入失敗 (驗證不通過)：\n' +
        '• Gmail 不能使用一般登入密碼，必須使用 16 位的「應用程式專用密碼」。\n' +
        '• 請至 Google 帳戶 (https://myaccount.google.com/apppasswords) 產生專用密碼。\n' +
        '• 請確認 Gmail 網頁版設定已開啟「IMAP 存取」。',
      connError: (host, port) => `無法連線至伺服器 (${host}:${port})，請確認網路連線或伺服器主機是否正確。`,
      saveSuccess: (intervalMin) => `已儲存設定！自動檢查間隔為每 ${intervalMin >= 60 ? (intervalMin / 60) + ' 小時' : intervalMin + ' 分鐘'}`
    }
  },

  'en': {
    appName: 'METech Assistant',
    trayToolTip: 'METech Assistant',
    settingsWindowTitle: 'METech Assistant - Overview Settings',

    // Tray Menu
    tray: {
      title: 'METech Assistant',
      boostBall: '⚡ Boost Spin',
      resetSpeed: '🔄 Reset Standard Speed (1.2x)',
      globeSpeed: '🌀 Globe Spin Speed',
      speedSlow: '0.5x Slow Drift',
      speedNormal: '1.0x Standard Steady',
      speedDefault: '1.2x Smooth (Default) ⭐',
      speedFast: '2.5x High Speed',
      speedTurbo: '5.0x Turbo Light-Speed',
      speedCustom: 'Custom Speed (Scroll)',
      toggleQuotes: '💬 Toggle Dialogue Alerts',
      bubbleFontSize: '🔤 Dialogue Font Size',
      fontSizeSm: 'Compact (0.9x)',
      fontSizeStd: 'Standard (1.0x Default) ⭐',
      fontSizeLg: 'Large (1.25x)',
      fontSizeXl: 'Extra Large (1.45x)',
      assistantSize: '📏 Assistant Size',
      sizeMini: 'Mini (0.75x)',
      sizeStd: 'Standard (1.0x Default)',
      sizeLg: 'Large (1.33x)',
      stickyNotesSize: '🗒️ Sticky Note Size',
      stickySizeSm: 'Small Sticky Notes',
      stickySizeStd: 'Standard Sticky Notes (Default) ⭐',
      stickySizeLg: 'Large Sticky Notes',
      hideAssistant: '🙈 Hide Assistant',
      showAssistant: '👀 Show Assistant',
      windowMenu: '🪟 Window & Position',
      alwaysOnBottom: 'Always on Bottom',
      alwaysOnTop: 'Always on Top',
      bottomUntilNotification: 'Stay on Bottom; Show on Top for Notifications',
      moveMode: '✋ Drag & Move Mode',
      resetPosition: '🔄 Reset Position (Bottom Right)',
      languageMenu: '🌐 Language / 語言',
      langZh: '繁體中文 (Chinese)',
      langEn: 'English ✓',
      emailMenu: '📬 Email, Calendar & Health',
      emailSettings: '⚙️ Overview Settings...',
      checkNow: '🔄 Check New Emails Now',
      checkCalendarNow: '📅 Check Today & Tomorrow Agenda Now',
      testSingle: '✉️ Test: Simulate 1 New Email',
      testMulti: '📬 Test: Simulate 3 New Emails (List)',
      testHealth: '🍵 Test: Simulate Hydration Reminder',
      testCalendar: '📅 Test: Simulate Meeting Reminder',
      exploreTrivia: '💡 Online Trivia & Clean Joke',
      focusMode: '🎯 Do Not Disturb / Focus',
      focusModeActive: '🎯 Focus Mode Active',
      focusOff: 'Turn Focus Mode Off',
      focus30: 'Focus for 30 minutes',
      focus60: 'Focus for 1 hour',
      focus120: 'Focus for 2 hours',
      focusTomorrow: 'Focus until 8:00 AM tomorrow',
      checkUpdates: '🔄 Check for Updates',
      quit: '❌ Quit Assistant'
    },

    // Test Simulated Emails
    mockEmails: {
      teamName: 'MEtech Project Team',
      teamSubject: '[Notification] New email received: Project status review',
      googleSender: 'Google Account Security',
      googleSubject: 'Security alert: New login detected',
      pmSender: 'Lin (Project Manager)',
      pmSubject: '[Urgent] Q3 AI Assistant Milestone Review Required',
      ghSender: 'GitHub Notifications',
      ghSubject: '[GitHub] Release v1.2.0 is now published'
    },

    // Email Service Messages
    service: {
      missingFields: 'Please fill in email address, password, and IMAP host completely!',
      noActiveAccounts: 'No active email accounts found. Please add and enable at least 1 account!',
      disabled: 'Email monitoring is currently disabled',
      checkingWait: 'Checking in progress, please wait...',
      testSuccess: (count) => `Connection successful! ${count} email(s) found in INBOX.`,
      testAllSuccess: (passed, total) => `Connection test completed! ${passed} / ${total} accounts connected successfully.`,
      authError: 'Authentication Failed:\n' +
        '• Gmail cannot use standard login passwords; you must use a 16-character "App Password".\n' +
        '• Visit Google Account (https://myaccount.google.com/apppasswords) to generate one.\n' +
        '• Ensure "IMAP Access" is enabled in your Gmail settings.',
      connError: (host, port) => `Could not connect to server (${host}:${port}). Please check your internet connection and server host.`,
      saveSuccess: (intervalMin) => `Settings saved! Polling interval set to every ${intervalMin >= 60 ? (intervalMin / 60) + ' hour(s)' : intervalMin + ' minute(s)'}`
    }
  }
};

module.exports = { locales };
