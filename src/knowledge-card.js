const ipc = window.electronAPI || null;

const translations = {
  'zh-TW': {
    windowTitle: '新增知識卡',
    eyebrow: 'PROFESSIONAL KNOWLEDGE',
    heading: '新增知識卡',
    subtitle: '記下值得定期複習的專業知識，資料只會儲存在這台電腦。',
    titleLabel: '標題',
    titlePlaceholder: '例如：資料庫索引原則',
    contentLabel: '內容',
    contentPlaceholder: '輸入需要定期複習的專業知識…',
    shortcutTip: 'Ctrl + Enter 可快速新增',
    cancel: '取消',
    save: '新增知識卡',
    saving: '正在儲存…',
    required: '請填寫標題與內容。',
    success: '知識卡已儲存在這台電腦。',
    failure: '無法新增知識卡，請稍後再試。'
  },
  en: {
    windowTitle: 'Add knowledge card',
    eyebrow: 'PROFESSIONAL KNOWLEDGE',
    heading: 'Add knowledge card',
    subtitle: 'Save professional knowledge worth reviewing. It stays only on this PC.',
    titleLabel: 'Title',
    titlePlaceholder: 'Example: Database indexing principles',
    contentLabel: 'Content',
    contentPlaceholder: 'Enter professional knowledge you want to review regularly…',
    shortcutTip: 'Press Ctrl + Enter to add quickly',
    cancel: 'Cancel',
    save: 'Add card',
    saving: 'Saving…',
    required: 'Enter both a title and content.',
    success: 'Knowledge card saved on this PC.',
    failure: 'Could not add the knowledge card. Please try again.'
  }
};

const form = document.getElementById('knowledge-quick-form');
const titleInput = document.getElementById('knowledge-quick-title');
const contentInput = document.getElementById('knowledge-quick-content');
const count = document.getElementById('knowledge-quick-count');
const feedback = document.getElementById('knowledge-quick-feedback');
const cancelButton = document.getElementById('knowledge-quick-cancel');
const saveButton = document.getElementById('knowledge-quick-save');
let language = 'zh-TW';
let saving = false;

function copy(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function applyLanguage(nextLanguage) {
  language = nextLanguage === 'en' ? 'en' : 'zh-TW';
  const t = translations[language];
  document.documentElement.lang = language;
  document.title = t.windowTitle;
  copy('eyebrow', t.eyebrow);
  copy('heading', t.heading);
  copy('subtitle', t.subtitle);
  copy('title-label', t.titleLabel);
  copy('content-label', t.contentLabel);
  copy('shortcut-tip', t.shortcutTip);
  copy('knowledge-quick-cancel', t.cancel);
  copy('knowledge-quick-save', t.save);
  titleInput.placeholder = t.titlePlaceholder;
  contentInput.placeholder = t.contentPlaceholder;
}

function updateCount() {
  count.textContent = `${contentInput.value.length} / 500`;
}

function setFeedback(message, success = false) {
  feedback.textContent = message;
  feedback.classList.toggle('success', success);
}

async function addKnowledgeCard() {
  if (saving) return;
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  const t = translations[language];
  if (!title || !content) {
    setFeedback(t.required);
    (!title ? titleInput : contentInput).focus();
    return;
  }
  if (!ipc) {
    setFeedback(t.failure);
    return;
  }

  saving = true;
  saveButton.disabled = true;
  saveButton.textContent = t.saving;
  setFeedback('');
  try {
    const result = await ipc.invoke('knowledge-cards-add', { title, content, enabled: true });
    if (!result?.success) throw new Error(result?.error || t.failure);
    setFeedback(t.success, true);
    form.reset();
    updateCount();
    setTimeout(() => window.close(), 650);
  } catch (error) {
    setFeedback(error?.message || t.failure);
    saving = false;
    saveButton.disabled = false;
    saveButton.textContent = t.save;
  }
}

contentInput.addEventListener('input', updateCount);
form.addEventListener('submit', event => {
  event.preventDefault();
  addKnowledgeCard();
});
cancelButton.addEventListener('click', () => window.close());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') window.close();
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault();
    addKnowledgeCard();
  }
});

applyLanguage('zh-TW');
updateCount();
ipc?.invoke('get-language').then(applyLanguage).catch(() => {});
