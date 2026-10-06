import './desktop-organizer.css';
import './desktop-organizer-settings.css';

const api = window.electronAPI;
const $ = id => document.getElementById(id);
let image = '';
let ready = false;
let previewTask = Promise.resolve();
const status = message => { $('status').textContent = message || ''; $('status').hidden = !message; };
async function run(task) {
  try { return await task(); } catch (error) { status(error.message || '操作失敗，請再試一次。'); }
}
function draft() {
  return {
    title: $('name').value,
    opacity: 100 - Number($('opacity').value), color: $('color').value, textColor: $('text-color').value,
    headerColorMode: $('header-color-mode').value, headerColor: $('header-color').value,
    headerTextColor: $('header-text-color').value, pattern: $('pattern').value, image
  };
}
function preview() {
  if (!ready) return;
  $('opacity-value').textContent = `${$('opacity').value}%`;
  $('header-color').hidden = $('header-color-mode').value !== 'custom';
  const input = draft();
  previewTask = previewTask.then(() => run(() => api.invoke('organizer-settings-preview', input)));
}
for (const id of ['name', 'opacity', 'color', 'text-color', 'header-color', 'header-text-color']) $(id).oninput = preview;
for (const id of ['header-color-mode', 'pattern']) $(id).onchange = preview;
$('background').onclick = () => run(async () => {
  const result = await api.invoke('organizer-background');
  if (typeof result.image === 'string') { image = result.image; preview(); }
});
$('clear-background').onclick = () => { image = ''; preview(); };
$('cancel').onclick = () => run(() => api.invoke('organizer-settings-close'));
$('save').onclick = () => run(async () => {
  $('save').disabled = true;
  try {
    await previewTask;
    await api.invoke('organizer-update', draft());
    await api.invoke('organizer-settings-close');
  } finally { $('save').disabled = false; }
});
$('delete').onclick = () => run(() => api.invoke('organizer-delete'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('cancel').click(); });
run(async () => {
  const board = await api.invoke('organizer-get');
  $('settings-title').textContent = `「${board.title}」設定`;
  $('name').value = board.title;
  $('opacity').value = 100 - board.opacity; $('opacity-value').textContent = `${100 - board.opacity}%`;
  $('color').value = board.color; $('text-color').value = board.textColor;
  $('header-color-mode').value = board.headerColorMode; $('header-color').value = board.headerColor;
  $('header-color').hidden = board.headerColorMode !== 'custom';
  $('header-text-color').value = board.headerTextColor; $('pattern').value = board.pattern;
  image = board.image; ready = true; $('settings').inert = false;
});
