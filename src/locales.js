// ==========================================================================
// Frontend Localization Dictionary (zh-TW & en)
// ==========================================================================

export const locales = {
  'zh-TW': {
    appName: 'METech小助手',
    
    // Tooltips
    tooltips: {
      bear: 'METech小助手',
      ball: '點擊或滾輪可加速旋轉！',
      mail: '點擊查看郵件 / 恢復科技球',
      water: '點擊補充水分 / 恢復科技球',
      calendar: '點擊確認行程 / 恢復科技球',
      trivia: '點擊確認 / 恢復科技球'
    },

    // Speech Bubble Phrases
    speech: {
      greeting: '今天也是充滿幹勁的一天！🚀',
      mailRestored: '已查閱郵件，恢復科技球 ✨',
      waterRestored: '已補充水分與活力，繼續加油！💪',
      calendarRestored: '已確認行程安排，恢復科技球 📅✨',
      triviaRestored: '已吸收新知識，恢復科技球 💡✨',
      bubbleEnabled: '已開啟提示對話 ✨',
      bubbleDisabled: '已關閉提示對話 🤫',
      speedSet: (speed) => `球體自轉速度已調整為 ${speed}x ⚡`,
      sizeSet: (label) => `已切換尺寸為 ${label} 📏`,
      fontSet: (label) => `對話字體已切換為 ${label} 🔤`,
      autoLaunchEnabled: '已開啟開機自動啟動 🚀',
      autoLaunchDisabled: '已關閉開機自動啟動 🛑',
      moveModeOn: '已開啟「移動模式」✋ 可按住拖曳小助手',
      moveModeOff: '已切換為「穿透模式」🖱️（星球可點擊互動）',
      languageChanged: '已切換語言為 繁體中文 🇹🇼',
      healthRemarks: [
        '🍵 溫馨提醒：已經專注工作一陣子囉，喝口水、站起來伸展一下吧！',
        '💧 補充水分時間到！讓身體與大腦保持清醒活躍 🌊',
        '🧘 伸個懶腰、放鬆肩膀和雙眼，喝杯水休息 3 分鐘吧 ✨',
        '🥤 乾杯！工作再忙也別忘了補充水分喔 💧'
      ]
    },

    // Trivia & Joke Notification
    trivia: {
      factHeader: '💡 生活冷知識',
      jokeHeader: '😄 今日冷笑話',
      exploreHeader: '✨ 探索新知識與笑話',
      noNetwork: '目前無網路連線，線上冷知識與笑話需要連網獲取喔 🌐'
    },

    // Mail Notification
    mail: {
      newMailHeader: (count) => `收到 ${count > 1 ? count + ' 封' : ''}新郵件！`,
      reminderHeader: (count) => `提醒：尚有 ${count} 封未讀郵件！`,
      unknownSender: '未知寄件人',
      noSubject: '(無主旨)',
      fromLabel: '👤 寄件人：',
      subjectLabel: '📝 主旨：',
      moreUnread: (count) => `...還有 ${count} 封未讀郵件`
    },

    // Calendar Notification
    calendar: {
      upcomingHeader: '即將開始的行程提醒！',
      todayHeader: (count) => `今日行程安排 (${count} 項)`,
      tomorrowHeader: (count) => `明日行程預告 (${count} 項)`,
      overviewHeader: '行事曆行程總覽',
      noEventsToday: '今日目前沒有排定行程，享受充實的一天！✨',
      noEventsTomorrow: '明日目前沒有排定行程 ✨',
      locationLabel: '📍 地點：',
      allDay: '全天 (All Day)'
    },

    // Settings Window UI
    settings: {
      windowTitle: '郵箱與健康規則設定 - METech小助手',
      headerTitle: '郵箱與通知規則設定',
      headerSubtitle: '設定多組 IMAP 郵箱資訊與健康提醒排程規則',
      langLabel: '介面語系 / Language',
      enableSwitch: '啟用新郵件自動監聽與提醒',
      
      // Multi-Account Section
      sectionAccounts: '👤 多組郵箱帳號設定',
      btnAddAccount: '➕ 新增信箱帳號',
      accountSwitchLabel: '啟用此信箱',
      labelAccountName: '信箱名稱 / 標籤 (例：公司信箱、個人 Gmail)',
      placeholderAccountName: '例如：公司 Gmail / 個人信箱',
      providerGmail: 'Gmail',
      providerOutlook: 'Outlook / 365',
      providerCustom: '自訂 IMAP',
      labelUser: '信箱帳號 (Email Address)',
      placeholderUser: 'example@gmail.com',
      labelPass: '密碼 / 應用程式專用密碼 (App Password)',
      placeholderPass: '16 位專用密碼 (例如: abcd efgh ijkl mnop)',
      labelHost: 'IMAP 伺服器主機',
      labelPort: '連接埠 (Port)',
      btnTestAccount: '測試連線',
      btnDeleteAccount: '🗑️ 移除此信箱',
      deleteConfirm: '確定要移除此信箱帳號嗎？',

      // Gmail Guide Box
      gmailGuideTitle: '🔑 Gmail 設定注意 (重要)：',
      gmailGuideStep1: '1. Google 已停用一般密碼直接登入，<strong>必須使用 16 位「應用程式專用密碼」</strong>。',
      gmailGuideStep2: '2. 請點此開啟：',
      gmailGuideStep2Link: '👉 前往 Google 產生應用程式專用密碼',
      gmailGuideStep3: '3. 應用程式名稱可輸入「桌面小助手」，產生後複製 16 位密碼貼至上方。',
      gmailGuideStep4: '4. 確認 Gmail 網頁版「設定 > 轉寄和 POP/IMAP > 啟用 IMAP」。',

      // Rules
      sectionRules: '⏱️ 新郵件解析與排程規則',
      labelMaxAge: '新郵件時間範圍',
      tipMaxAge: '只檢查指定小時內的未讀郵件，舊信將自動略過',
      optMaxAge30m: '30 分鐘內',
      optMaxAge1h: '1 小時內',
      optMaxAge2h: '2 小時內 (推薦)',
      optMaxAge6h: '6 小時內',
      optMaxAge12h: '12 小時內',
      optMaxAge24h: '24 小時內',
      optMaxAge48h: '48 小時內',

      labelInterval: '自動檢查間隔',
      tipInterval: '背景自動連線伺服器檢查新信件頻率',
      optInterval1m: '每 1 分鐘',
      optInterval3m: '每 3 分鐘',
      optInterval5m: '每 5 分鐘 (推薦)',
      optInterval10m: '每 10 分鐘',
      optInterval15m: '每 15 分鐘',
      optInterval30m: '每 30 分鐘',
      optInterval60m: '每 1 小時',

      labelSound: '收到新郵件時播放提示音 (無跳躍動作)',
      labelRepeat: '未讀郵件重複提示 (若信箱仍有未讀郵件，每次排程檢查時再次提示，避免漏看)',

      // Health Section
      sectionHealth: '🍵 定時喝水與久坐提醒',
      enableHealth: '啟用定時喝水與伸展提醒',
      labelHealthInterval: '提醒間隔時間',
      tipHealthInterval: '每隔指定時間小熊會手持科技水壺並溫馨提醒',
      optHealth30m: '每 30 分鐘',
      optHealth45m: '每 45 分鐘 (推薦)',
      optHealth60m: '每 60 分鐘 (1 小時)',
      optHealth90m: '每 90 分鐘 (1.5 小時)',
      optHealth120m: '每 120 分鐘 (2 小時)',
      labelHealthSound: '提醒時播放清脆水滴提示音',
      btnTestHealth: '🍵 測試喝水提醒',

      // Trivia & Jokes Section
      tabTrivia: '生活知識與笑話',
      sectionTrivia: '💡 線上生活知識與幽默冷笑話',
      enableTrivia: '啟用定時線上探索與主動提醒',
      labelTriviaCategory: '內容探索偏好',
      optTriviaAll: '🎲 綜合隨機探索 (知識與笑話)',
      optTriviaFact: '🔬 僅生活小百科與科學冷知識',
      optTriviaJoke: '😄 僅職場幽默與乾淨冷笑話',
      labelTriviaInterval: '探索推送間隔',
      tipTriviaInterval: '每隔指定時間小熊會連網隨機探索一則最新知識或笑話',
      optTrivia30m: '每 30 分鐘',
      optTrivia60m: '每 60 分鐘 (1 小時，推薦)',
      optTrivia90m: '每 90 分鐘 (1.5 小時)',
      optTrivia120m: '每 120 分鐘 (2 小時)',
      labelTriviaSound: '提醒時播放清脆提示音',
      safetyNotice: '🛡️ 100% 嚴格排除情色、粗俗與不當內容已啟用 (純聯網即時探索)',
      btnExploreNow: '🎲 立即線上探索一則',

      // Bottom Action Buttons
      btnTestAll: '🔗 測試所有連線',
      btnCheckNow: '🔄 立即檢查所有信箱',
      btnSave: '💾 儲存並套用',

      // Status messages
      statusTesting: '正在連線測試中，請稍候... ⏳',
      statusChecking: '正在手動檢查所有收件匣中... ⏳',
      statusSaveSuccess: (label) => `✅ 設定已成功儲存並生效！小助手已開啟自動監聽（每 ${label} 檢查一次）。`,
      statusSaveFailed: (err) => `❌ 儲存失敗: ${err}`,
      statusElectronRequired: '⚠️ 請在桌面小助手視窗中執行此操作'
    }
  },

  'en': {
    appName: 'METech Assistant',
    
    // Tooltips
    tooltips: {
      bear: 'METech Assistant',
      ball: 'Click or scroll to accelerate rotation!',
      mail: 'Click to mark read / Restore tech globe',
      water: 'Click to hydrate / Restore tech globe',
      calendar: 'Click to acknowledge / Restore tech globe',
      trivia: 'Click to acknowledge / Restore tech globe'
    },

    // Speech Bubble Phrases
    speech: {
      greeting: 'Ready for a productive day! 🚀',
      mailRestored: 'Email read, tech globe restored ✨',
      waterRestored: 'Hydrated & energized, let\'s keep going! 💪',
      calendarRestored: 'Calendar agenda acknowledged! Tech orb restored 📅✨',
      triviaRestored: 'Wisdom gained! Tech orb restored 💡✨',
      bubbleEnabled: 'Dialogue alerts enabled ✨',
      bubbleDisabled: 'Dialogue alerts muted 🤫',
      speedSet: (speed) => `Globe rotation speed set to ${speed}x ⚡`,
      sizeSet: (label) => `Assistant size changed to ${label} 📏`,
      fontSet: (label) => `Dialogue font size changed to ${label} 🔤`,
      autoLaunchEnabled: 'Auto-launch on boot enabled 🚀',
      autoLaunchDisabled: 'Auto-launch on boot disabled 🛑',
      moveModeOn: 'Move mode enabled ✋ Drag to reposition',
      moveModeOff: 'Click-through mode 🖱️ (Globe interactive)',
      languageChanged: 'Language switched to English 🇺🇸',
      healthRemarks: [
        '🍵 Friendly Reminder: Great work! Time to hydrate and stretch a bit!',
        '💧 Hydration Time! Keep your body and mind sharp & refreshed 🌊',
        '🧘 Take a quick 3-minute break, relax your shoulders and rest your eyes ✨',
        '🥤 Cheers! Stay hydrated and energized throughout the day 💧'
      ]
    },

    // Trivia & Joke Notification
    trivia: {
      factHeader: '💡 Daily Fun Fact',
      jokeHeader: '😄 Daily Humor & Joke',
      exploreHeader: '✨ Explore Trivia & Humor',
      noNetwork: 'Network offline. Online trivia requires an internet connection 🌐'
    },

    // Mail Notification
    mail: {
      newMailHeader: (count) => `${count > 1 ? count + ' New Emails' : 'New Email'} Received!`,
      reminderHeader: (count) => `Reminder: ${count} Unread Email${count > 1 ? 's' : ''}!`,
      unknownSender: 'Unknown Sender',
      noSubject: '(No Subject)',
      fromLabel: '👤 From: ',
      subjectLabel: '📝 Subject: ',
      moreUnread: (count) => `...and ${count} more unread email(s)`
    },

    // Calendar Notification
    calendar: {
      upcomingHeader: 'Upcoming Meeting Reminder!',
      todayHeader: (count) => `Today's Agenda (${count})`,
      tomorrowHeader: (count) => `Tomorrow's Preview (${count})`,
      overviewHeader: 'Calendar Agenda Overview',
      noEventsToday: 'No events scheduled for today. Have a productive day! ✨',
      noEventsTomorrow: 'No events scheduled for tomorrow ✨',
      locationLabel: '📍 Location: ',
      allDay: 'All Day'
    },

    // Settings Window UI
    settings: {
      windowTitle: 'Email & Health Settings - METech Assistant',
      headerTitle: 'Email & Notification Settings',
      headerSubtitle: 'Configure multiple IMAP account details and health reminder rules',
      langLabel: 'Language / 介面語系',
      enableSwitch: 'Enable Automated Email Monitoring & Alerts',

      // Multi-Account Section
      sectionAccounts: '👤 Multiple Email Accounts',
      btnAddAccount: '➕ Add Email Account',
      accountSwitchLabel: 'Enable Account',
      labelAccountName: 'Account Name / Label (e.g. Work Gmail, Personal)',
      placeholderAccountName: 'e.g. Work Gmail / Personal',
      providerGmail: 'Gmail',
      providerOutlook: 'Outlook / 365',
      providerCustom: 'Custom IMAP',
      labelUser: 'Email Address',
      placeholderUser: 'example@gmail.com',
      labelPass: 'Password / App Password',
      placeholderPass: '16-digit App Password (e.g. abcd efgh ijkl mnop)',
      labelHost: 'IMAP Server Host',
      labelPort: 'Port',
      btnTestAccount: 'Test Connection',
      btnDeleteAccount: '🗑️ Remove Account',
      deleteConfirm: 'Are you sure you want to remove this email account?',

      // Gmail Guide Box
      gmailGuideTitle: '🔑 Gmail Setup Guide (Important):',
      gmailGuideStep1: '1. Standard password login is disabled by Google. <strong>You must use a 16-character "App Password"</strong>.',
      gmailGuideStep2: '2. Click here to open: ',
      gmailGuideStep2Link: '👉 Go to Google App Passwords page',
      gmailGuideStep3: '3. Name it "Desktop Assistant", generate the password and paste it above.',
      gmailGuideStep4: '4. Ensure "IMAP Access" is enabled in your Gmail Web Settings.',

      // Rules
      sectionRules: '⏱️ Parsing & Polling Rules',
      labelMaxAge: 'Email Time Range',
      tipMaxAge: 'Only checks unread emails within the specified range; older emails will be skipped',
      optMaxAge30m: 'Within 30 mins',
      optMaxAge1h: 'Within 1 hour',
      optMaxAge2h: 'Within 2 hours (Recommended)',
      optMaxAge6h: 'Within 6 hours',
      optMaxAge12h: 'Within 12 hours',
      optMaxAge24h: 'Within 24 hours',
      optMaxAge48h: 'Within 48 hours',

      labelInterval: 'Check Interval',
      tipInterval: 'Background frequency to check for incoming emails',
      optInterval1m: 'Every 1 min',
      optInterval3m: 'Every 3 mins',
      optInterval5m: 'Every 5 mins (Recommended)',
      optInterval10m: 'Every 10 mins',
      optInterval15m: 'Every 15 mins',
      optInterval30m: 'Every 30 mins',
      optInterval60m: 'Every 1 hour',

      labelSound: 'Play notification sound when new email arrives (No bounce)',
      labelRepeat: 'Repeat unread reminders on each scheduled check until read',

      // Health Section
      sectionHealth: '🍵 Hydration & Rest Reminders',
      enableHealth: 'Enable Hydration & Stretch Reminders',
      labelHealthInterval: 'Reminder Interval',
      tipHealthInterval: 'The assistant will hold a cyber water bottle to remind you',
      optHealth30m: 'Every 30 mins',
      optHealth45m: 'Every 45 mins (Recommended)',
      optHealth60m: 'Every 60 mins (1 Hour)',
      optHealth90m: 'Every 90 mins (1.5 Hours)',
      optHealth120m: 'Every 120 mins (2 Hours)',
      labelHealthSound: 'Play crisp water droplet chime sound on reminder',
      btnTestHealth: '🍵 Test Water Reminder',

      // Trivia & Jokes Section
      tabTrivia: 'Trivia & Jokes',
      sectionTrivia: '💡 Online Life Facts & Clean Humor',
      enableTrivia: 'Enable Scheduled Online Trivia & Jokes Exploration',
      labelTriviaCategory: 'Content Exploration Preference',
      optTriviaAll: '🎲 Mixed Random (Facts & Clean Jokes)',
      optTriviaFact: '🔬 Life Facts & Science Trivia Only',
      optTriviaJoke: '😄 Clean Humor & Workplace Jokes Only',
      labelTriviaInterval: 'Exploration Interval',
      tipTriviaInterval: 'The assistant will explore online and share interesting facts or clean jokes periodically',
      optTrivia30m: 'Every 30 mins',
      optTrivia60m: 'Every 60 mins (1 Hour, Recommended)',
      optTrivia90m: 'Every 90 mins (1.5 Hours)',
      optTrivia120m: 'Every 120 mins (2 Hours)',
      labelTriviaSound: 'Play crisp chime sound on reminder',
      safetyNotice: '🛡️ 100% Strict Content Filter (No NSFW/Vulgarity) Active (Pure Online Fetch)',
      btnExploreNow: '🎲 Explore Online Trivia Now',

      // Bottom Action Buttons
      btnTestAll: '🔗 Test All Connections',
      btnCheckNow: '🔄 Check All Inboxes Now',
      btnSave: '💾 Save & Apply',

      // Status messages
      statusTesting: 'Testing connections, please wait... ⏳',
      statusChecking: 'Checking all inboxes manually... ⏳',
      statusSaveSuccess: (label) => `✅ Settings saved successfully! Polling started (every ${label}).`,
      statusSaveFailed: (err) => `❌ Save failed: ${err}`,
      statusElectronRequired: '⚠️ Please perform this action within the desktop assistant window'
    }
  }
};
