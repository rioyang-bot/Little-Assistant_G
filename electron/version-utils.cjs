const RELEASE_NOTES = {
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
