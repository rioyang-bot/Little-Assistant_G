const RELEASE_NOTES = {
  '1.6.0': {
    'zh-TW': [
      '修正重複開機啟動會取消小助手隱藏狀態的問題；重複啟動時保留原本的隱藏設定。',
      '移除「開機啟動」切換功能；安裝後固定自動加入開機啟動，並在安裝時清除舊版重複項目。',
      '從雙螢幕切回單螢幕時，小助手會依主螢幕工作區重新放到右下角，避免跑到工作列下方。',
      '雙螢幕時手動復位會以小助手目前所在的螢幕為準，並再次校正右下角位置，避免落到另一台螢幕或工作列下方。',
      '新增本機自然語言事項，可從「明天下午 3 點提醒我緊急回覆客戶」自動建立便利貼、優先度與鬧鐘。',
      '新增 GitHub Releases 自動更新，安裝版會自動檢查、下載，並可重新啟動安裝新版。',
      '新增多螢幕配置位置記憶，分別保留不同排列、解析度與縮放比下的小助手位置。',
      '新增可計時的勿擾／專注模式，暫停郵件、行事曆、健康與生活資訊提醒，但保留明確設定的便利貼鬧鐘。',
      '新增本機專業知識卡，可自行建立標題與內容，設定每 10 至 60 分鐘推播一則；筆電快捷入口預設使用亮藍色科技腦透明 Logo，亦可自行更換。',
      '點選「專業知識」快捷鍵會直接開啟精簡的新增知識卡視窗，不再跳入總覽設定。',
      '對話通知出現時，郵件、行事曆與待辦便利貼會依對話框高度自動往上移，避免重疊。',
      '長通知可捲動並保留便利貼空間；對話框完全淡出後，便利貼回到原位。',
      '待辦便利貼會記住整塊面板的顯示／收合，以及每張便利貼的展開／收合狀態，重新啟動後還原。',
      '改善啟動較慢時的狀態還原，避免已儲存的舊狀態覆蓋剛做的操作；顯示設定損壞時仍可載入便利貼。'
    ],
    en: [
      'Duplicate launches at login now preserve the assistant hidden setting instead of showing it again.',
      'Removed the startup toggle; installation now always enables launch at sign-in and removes the legacy duplicate entry.',
      'When switching from two displays to one, the assistant returns to the primary display bottom-right above the taskbar.',
      'Manual reset now uses the display currently containing the assistant and performs a second bottom-right correction to keep it above that display taskbar.',
      'Added local natural-language tasks that extract a title, priority and alarm time from requests such as "remind me tomorrow at 3 PM".',
      'Added GitHub Releases automatic updates for installed builds, including automatic download and restart-to-install.',
      'Added per-layout multi-display position memory based on monitor arrangement, resolution and scale factor.',
      'Added timed Do Not Disturb / Focus mode for email, calendar, wellness and trivia alerts while preserving explicit sticky-note alarms.',
      'Added local professional knowledge cards with custom titles and 10-to-60-minute intervals; the laptop shortcut uses a bright-blue transparent technology-brain logo by default and remains customizable.',
      'The Professional Knowledge shortcut now opens a focused quick-add card window instead of the overview settings.',
      'Email, calendar and to-do sticky panels move above the actual dialogue height when a notification appears, preventing overlap.',
      'Long notifications scroll while leaving room for notes; the panels return after the dialogue has fully faded out.',
      'To-do notes now remember panel visibility and each note expanded or collapsed state across restarts.',
      'Delayed startup responses no longer overwrite actions made while loading; damaged view settings do not prevent notes from loading.'
    ]
  },
  '1.5.0': {
    'zh-TW': [
      '大型尺寸的快捷名稱改為依長框剩餘寬度顯示，不再限制字元數；超出時顯示省略號，滑鼠停留可查看完整名稱。',
      '選單名稱統一為「隱藏小助手」與「顯示小助手」。',
      '球體自轉速度選單新增單選圓圈，標示目前速度；滾輪調速同步更新並保存，非預設值顯示為自訂速度。',
      '右鍵選單新增三種視窗顯示模式：保持最下層、保持最上層，以及平時最下層但新事件通知時跳至最上層。',
      '通知置頂模式支援郵件、行事曆、喝水健康、生活知識與便利貼鬧鐘；通知關閉或結束後自動回到最下層。',
      '視窗顯示模式會自動保存，重新啟動後沿用，並相容舊版置頂設定。',
      '便利貼、信箱與日曆等內建快捷現可各自上傳或清除 Logo；儲存並套用後更新筆電快捷列。',
      '快捷設定清單整合內建與自訂快捷，並提供直接上傳及清除 Logo 的操作。'
    ],
    en: [
      'Large shortcut labels now use the available frame width instead of a character limit, with an ellipsis for overflow and the full name available on hover.',
      'Updated the Traditional Chinese visibility menu labels to consistently refer to the assistant.',
      'Globe speed now uses radio selection to show the current speed; scroll changes are synchronized and saved, with non-preset values shown as Custom Speed.',
      'Added three context-menu window modes: Always on Bottom, Always on Top, and Stay on Bottom with notifications temporarily shown on top.',
      'Notification mode supports email, calendar, wellness, trivia, and sticky-note alarms; the window returns to the bottom when notifications are dismissed or end.',
      'Window mode is saved across restarts, with compatibility for the previous always-on-top setting.',
      'Built-in sticky-note, inbox, and calendar shortcuts now support individual Logo uploads and removal, applied to the laptop rail with Save & Apply.',
      'The shortcut settings list now includes built-in and custom shortcuts with direct Logo upload and clear actions.'
    ]
  },
  '1.4.0': {
    'zh-TW': [
      '新增「隱藏小熊」功能；隱藏後只移除小熊本體，郵件、行事曆與待辦便利貼仍維持顯示及操作。',
      '隱藏小熊後，快捷列會固定在畫面最右側 10px，並向上貼近便利貼下緣，不再跟著對話框消失。',
      '拖曳模式的啟動範圍限制於小熊本體；便利貼維持滑鼠穿透邏輯，球體、筆電及快捷按鈕仍可正常點擊。',
      '快捷總數限制為 20 個（包含便利貼、郵件與行事曆固定入口），避免快捷列無限制增長。',
      '微型與標準尺寸每欄最多五個快捷，大型尺寸每欄最多九個；滿欄後由右向左新增下一欄，整體高度不超過小熊。',
      '大型尺寸在超過九個快捷時自動改用緊湊 Logo 排列，確保多欄快捷完整保留在視窗內。',
      '移除快捷列垂直捲軸，避免捲軸遮住最右欄 Logo，20 個快捷可直接完整顯示。',
      '自訂快捷支援上傳 PNG、JPG 或 WebP Logo；圖片會置中裁切並縮放為 128×128，檔案上限 10 MB。',
      '重新整理快捷與瀏覽器設定分頁：左右分欄顯示快捷清單及各快捷瀏覽器，並縮減卡片與欄位空間。',
      '加寬總覽設定的預設視窗寬度，並調整快捷雙欄的響應式斷點，避免編輯按鈕與瀏覽器選單擠壓重疊。',
      '既有自訂快捷現可重新編輯名稱、類型、目標、字母、Logo 圖片與底色；底色擴充為 20 色並新增白色與淺色系。',
      '使用自訂 Logo 圖片時不再套用圓形底色；淺色字母 Logo 會自動改用深色字以保持清晰。',
      '快捷編輯區新增可複製的 AI Logo 生成建議，會自動代入快捷名稱並附上 125×125、透明背景與小尺寸清晰度要求。',
      '總覽設定六個主要分頁新增簡短功能簡介，說明開啟後的用途與主要可設定內容。',
      '移除郵件與行事曆對話提醒總開關，改由每個信箱與日曆的「小助手對話提醒」獨立控制。',
      '改善新增便利貼的點擊與定位，避免新增表單和現有便利貼互相重疊或因穿透模式而無法操作。'
    ],
    en: [
      'Added Hide Bear: only the bear is hidden, while email, calendar, and to-do sticky panels remain visible and interactive.',
      'When the bear is hidden, the shortcut rail stays 10 px from the right edge and moves up beneath the sticky panels instead of disappearing with dialogue bubbles.',
      'Move mode now starts only from the bear itself; sticky-note pass-through behavior is preserved while the orbs, laptop, and shortcut buttons remain clickable.',
      'Limited the complete laptop shortcut menu to 20 entries, including the fixed sticky-note, inbox, and calendar actions.',
      'Mini and standard sizes use at most five shortcuts per column; large uses at most nine, adding each new full column toward the left without exceeding bear height.',
      'Large mode switches to a compact Logo grid above nine shortcuts so every column remains inside the assistant window.',
      'Removed the shortcut rail scrollbar that could cover the rightmost Logo column; all 20 shortcuts are visible directly.',
      'Custom shortcuts can use uploaded PNG, JPG, or WebP Logos, center-cropped and resized to 128×128 with a 10 MB file limit.',
      'Reorganized shortcut and browser settings into compact left and right columns with denser cards and fields.',
      'Widened the default Settings window and adjusted the responsive shortcut-column breakpoint to prevent edit actions and browser selectors from crowding or overlapping.',
      'Existing custom shortcuts can now edit their name, type, target, letter, Logo image, and color; the palette now offers 20 colors including white and light shades.',
      'Custom Logo images no longer receive a circular background, while light letter-Logo colors automatically use dark text for clarity.',
      'Added a copyable AI Logo prompt in the shortcut editor that inserts the shortcut name and specifies 125×125 output, transparency, and small-size legibility.',
      'Added concise introductions to all six Overview Settings tabs to explain each feature and its main configurable behavior.',
      'Removed the master email and calendar dialogue-reminder switches; each inbox and calendar now controls Assistant dialogue reminders independently.',
      'Improved new-note pointer handling and placement so the composer remains usable without overlapping existing sticky notes.'
    ]
  },
  '1.3.0': {
    'zh-TW': [
      '新增小熊筆電快捷列，可快速建立便利貼，並直接開啟多組信箱、日曆、自訂應用程式或網站。',
      '自動偵測常見瀏覽器，每個信箱、日曆與網站捷徑可分別選擇；未指定時沿用 Windows 預設瀏覽器。',
      '自訂捷徑最多六個，可設定 A–Z 單一字母與圓形底色；新增或移除後須按「儲存並套用」才會生效。',
      '快捷可直接在小助手旁拖曳排序，移動時其他快捷會即時讓位，放開後自動保存排列。',
      '微型與中型使用三欄 Logo 排列，大型顯示名稱並支援單欄拖曳；改善間距、定位及畫面截斷問題。',
      '新增快捷列與小助手整體透明度，小助手透明度同步套用到所有提醒球體及對話框。',
      '總覽設定加入彩色分類列；開啟設定時會顯示快捷預覽，並跟隨小助手開在同一台螢幕。',
      '補完整體英文介面、動態提示與驗證訊息，並改善快捷 Logo 顏色、尺寸及單圈外觀。',
      '快捷列改用手指游標，只有目前指到的 Logo 會微幅放大並顯示柔和光暈。',
      '待辦便利貼僅能由右側展開按鈕開合，點擊主旨或卡片空白處不再誤觸。'
    ],
    en: [
      'Added a laptop shortcut rail for creating sticky notes and directly opening multiple inboxes, calendars, applications, or websites.',
      'Common browsers are detected automatically; each inbox, calendar, and website shortcut can use its own browser, with Windows default as the fallback.',
      'Added up to six custom shortcuts with an A–Z letter and selectable circular color; additions and removals require Save & Apply.',
      'Shortcuts can be reordered directly beside the assistant, with live reflow while dragging and automatic order persistence on drop.',
      'Mini and medium sizes use a three-column logo grid, while large uses a draggable single-column list with names; spacing and clipping were improved.',
      'Added independent shortcut and assistant transparency; assistant transparency also applies to all reminder orbs and dialogue bubbles.',
      'Added color-coded settings categories, automatic shortcut preview when settings opens, and same-monitor settings-window placement.',
      'Completed English interface coverage and improved shortcut logo color, size, and single-ring appearance.',
      'Shortcut hover now uses a pointer cursor and softly enlarges and illuminates only the hovered logo.',
      'To-do notes now expand or collapse only from the dedicated arrow button, preventing accidental toggles from the subject or card area.'
    ]
  },
  '1.2.0': {
    'zh-TW': [
      '新增便利貼鬧鐘、自訂鈴聲來源與鬧鐘水晶球提醒效果。',
      '新增行事曆便利貼，可依日曆分別控制小助手對話提醒與便利貼同步。',
      '新增郵件便利貼，可依信箱、Gmail 分類及自訂標籤篩選顯示。',
      '支援同步 Gmail 自訂標籤，以及選擇是否包含已封存的標籤郵件。',
      '新增待辦、行事曆與郵件便利貼獨立透明度及即時預覽。',
      '改善多螢幕拖曳、便利貼排序、面板空間與提醒停止行為。'
    ],
    en: [
      'Added sticky-note alarms, custom sound sources, and an alarm crystal-orb reminder effect.',
      'Added calendar sticky notes with independent dialogue reminder and sticky-note controls per calendar.',
      'Added email sticky notes with per-account, Gmail category, and custom-label filters.',
      'Added Gmail custom-label synchronization and optional archived labeled emails.',
      'Added independent live transparency previews for to-do, calendar, and email sticky notes.',
      'Improved multi-monitor dragging, note sorting, panel space, and reminder stopping behavior.'
    ]
  },
  '1.1.0': {
    'zh-TW': [
      '新增由小熊筆電快速開啟的待辦便利貼，筆電輪廓會在滑鼠移入時發光。',
      '每張便利貼可建立多個獨立事項；完成事項保留在原位置並顯示刪除線，不會自動收合。',
      '整張便利貼可由右側垃圾桶永久刪除，刪除前會再次確認，避免誤刪其他便利貼。',
      '便利貼可收合並從快速標籤重新顯示，不必再次進入新增畫面。',
      '便利貼尺寸可獨立選擇小型、標準或大型，不受小助手尺寸限制。',
      '改善便利貼透明度、緊急程度點亮效果、控制按鈕比例及新增／收合按鈕一致性。',
      '小助手右鍵選單改為只能從科技球開啟；小熊本體取消點擊互動並維持滑鼠穿透。',
      '強化多張便利貼的獨立操作、展開與刪除測試，提升使用穩定性。'
    ],
    en: [
      'Added quick to-do sticky notes from the bear laptop, with a glowing hover outline.',
      'Each note supports multiple independent items; completed items remain in place with a strikethrough and the note stays expanded.',
      'Whole notes can be permanently deleted from a right-aligned trash button with confirmation.',
      'Collapsed notes can be reopened from a quick tab without opening the new-note form.',
      'Sticky-note size can be selected independently from the assistant size.',
      'Improved transparency, illuminated priority selection, control sizing, and consistent add/collapse buttons.',
      'The context menu opens only from the technology ball; direct bear click interaction was removed and the bear remains click-through.',
      'Expanded automated coverage for independent note operations, expansion, and deletion.'
    ]
  },
  '1.0.0': {
    'zh-TW': [
      '完成郵箱、Google 日曆、健康提醒與生活知識整合。',
      '使用者設定改存於 Windows AppData，不受安裝位置影響。',
      '設定儲存後保持視窗開啟，方便繼續調整與測試。',
      '新增由小熊筆電快速開啟的待辦便利貼、顏色優先級與完成即刪除。',
      '補強設定持久化、自動測試及 Electron 安全規範。'
    ],
    en: [
      'Integrated inbox, Google Calendar, wellness reminders and trivia.',
      'User settings are stored in Windows AppData independently of the install location.',
      'The settings window remains open after saving.',
      'Added quick sticky notes from the laptop, color priorities and delete-on-completion.',
      'Improved persistence, automated tests and Electron security guidance.'
    ]
  }
};

function getVersionParts(version) {
  return String(version || '')
    .replace(/^[^0-9]*/, '')
    .split('.')
    .map(part => parseInt(part, 10))
    .map(part => Number.isFinite(part) ? part : 0);
}

function isNewerVersion(currentVersion, previousVersion) {
  const current = getVersionParts(currentVersion);
  const previous = getVersionParts(previousVersion);
  const length = Math.max(current.length, previous.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] || 0;
    const previousPart = previous[index] || 0;
    if (currentPart > previousPart) return true;
    if (currentPart < previousPart) return false;
  }
  return false;
}

function formatDisplayVersion(version) {
  const parts = getVersionParts(version);
  while (parts.length < 3) parts.push(0);
  return `Ver.${parts.slice(0, 3).join('.')}`;
}

function getReleaseNotes(version, language = 'zh-TW') {
  const entry = RELEASE_NOTES[version];
  if (entry) {
    return entry[language] || entry['zh-TW'];
  }
  return language === 'en'
    ? ['This version includes feature improvements and stability updates.']
    : ['本次版本包含功能改善與穩定性更新。'];
}

module.exports = {
  RELEASE_NOTES,
  isNewerVersion,
  formatDisplayVersion,
  getReleaseNotes
};
