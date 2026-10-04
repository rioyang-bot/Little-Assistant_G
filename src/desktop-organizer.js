import './desktop-organizer.css';

const api = window.electronAPI;
const $ = id => document.getElementById(id);
let board;
let appearancePreview = null;
let selectedItem;
let selectedIds = new Set();
let selectionAnchor;
let renderVersion = 0;
let activeDrag = null;
let lastDragged = 0;
let nativeDragPending = false;
let organizerDrag = null;
let placementTask = Promise.resolve();
let keyboardTask = Promise.resolve();
let layoutFrame = 0;
let layoutSignature = '';
function scheduleAutomaticLayout() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(async () => {
    layoutFrame = 0;
    if (!board || board.arrangement === 'free' || nativeDragPending) return;
    // Reserve horizontal scrollbar space even when absent; the stable vertical
    // gutter also keeps scrollbar changes from feeding back into arrangement.
    const viewport = { width: $('items').clientWidth, height: Math.max(1, $('items').offsetHeight - 16) };
    const signature = `${board.arrangement}:${viewport.width}:${viewport.height}`;
    if (signature === layoutSignature) return;
    layoutSignature = signature;
    const version = renderVersion;
    try {
      const result = await api.invoke('organizer-layout', viewport);
      if (version !== renderVersion) return;
      const positions = new Map(result.positions.map(item => [item.id, item.position]));
      for (const item of board.items) if (positions.has(item.id)) item.position = positions.get(item.id);
      for (const button of $('item-surface').children) {
        const item = board.items.find(item => item.id === button.dataset.itemId);
        if (!item?.position) continue;
        const left = `${item.position.x}px`, top = `${item.position.y}px`;
        if (button.style.left !== left) button.style.left = left;
        if (button.style.top !== top) button.style.top = top;
      }
      updateSurface();
    } catch (error) { layoutSignature = ''; status(error.message); }
  });
}
function updateSurface() {
  const surface = $('item-surface');
  if (!surface) return;
  // CSS supplies the viewport minimum. Measuring the scroll container here
  // feeds scrollbar changes back into its own size, causing repeated layout.
  let width = 0;
  let height = 0;
  for (const button of surface.querySelectorAll(':scope > .item')) {
    width = Math.max(width, button.offsetLeft + button.offsetWidth + 8);
    height = Math.max(height, button.offsetTop + button.offsetHeight + 12);
  }
  const nextWidth = `${Math.ceil(width)}px`, nextHeight = `${Math.ceil(height)}px`;
  if (surface.style.width !== nextWidth) surface.style.width = nextWidth;
  if (surface.style.height !== nextHeight) surface.style.height = nextHeight;
}
function clearDrag() {
  const drag = activeDrag; activeDrag = null;
  if (!drag) return;
  drag.button.classList.remove('dragging');
  if (drag.button.hasPointerCapture(drag.pointerId)) drag.button.releasePointerCapture(drag.pointerId);
  return drag;
}
function clearDropPreview() {
  $('drop-preview')?.remove();
  document.querySelectorAll('.drop-swap-target').forEach(node => node.classList.remove('drop-swap-target'));
  $('board').classList.remove('drag-over');
}
function updateSelection() {
  document.querySelectorAll('.item').forEach(node=>{
    const selected=selectedIds.has(node.dataset.itemId);
    node.classList.toggle('selected',selected); node.setAttribute('aria-pressed',String(selected));
  });
}
function selectItem(item,event) {
  if(event.shiftKey && selectionAnchor) {
    const ordered=[...board.items].sort((a,b)=>a.position.y-b.position.y || a.position.x-b.position.x);
    const from=ordered.findIndex(entry=>entry.id===selectionAnchor),to=ordered.indexOf(item);
    if(!event.ctrlKey && !event.metaKey) selectedIds.clear();
    for(const entry of ordered.slice(Math.min(from,to),Math.max(from,to)+1))selectedIds.add(entry.id);
  } else if(event.ctrlKey || event.metaKey) {
    if(selectedIds.has(item.id))selectedIds.delete(item.id);else selectedIds.add(item.id);
    selectionAnchor=item.id;
  } else if(!selectedIds.has(item.id)) { selectedIds=new Set([item.id]);selectionAnchor=item.id; }
  updateSelection();
}
function dropPosition(event) {
  const area = $('items').getBoundingClientRect();
  return { x: Math.max(0, event.clientX - area.left + $('items').scrollLeft - 41), y: Math.max(0, event.clientY - area.top + $('items').scrollTop - 16) };
}
function showDropPreview(event) {
  const area = $('items').getBoundingClientRect();
  if (event.clientX < area.left || event.clientX >= area.right || event.clientY < area.top || event.clientY >= area.bottom) { clearDropPreview(); return; }
  const desired = dropPosition(event);
  const position = board.arrangement === 'grid'
    ? { x:8 + Math.round(Math.min(454, Math.max(0, (desired.x - 8) / 88))) * 88, y:12 + Math.round(Math.min(384, Math.max(0, (desired.y - 12) / 104))) * 104 }
    : desired;
  const source = organizerDrag?.boardId === board.id ? board.items.find(item => item.path.toLowerCase() === organizerDrag.path.toLowerCase()) : null;
  const draggedPaths=organizerDrag?.paths || (organizerDrag ? [organizerDrag.path] : []);
  const target = board.arrangement === 'grid' && source ? board.items.find(item => !draggedPaths.some(path=>path.toLowerCase()===item.path.toLowerCase()) && item.position.x === position.x && item.position.y === position.y) : null;
  document.querySelectorAll('.drop-swap-target').forEach(node => node.classList.toggle('drop-swap-target', node.dataset.itemId === target?.id));
  if (target) document.querySelector(`[data-item-id="${target.id}"]`)?.classList.add('drop-swap-target');
  let preview = $('drop-preview');
  if (!preview) {
    preview = document.createElement('div'); preview.id = 'drop-preview'; preview.setAttribute('aria-hidden','true');
    const sourceNode = source && [...$('item-surface').children].find(node => node.dataset.itemId === source.id);
    if (sourceNode) preview.append(sourceNode.querySelector('.icon-container').cloneNode(true));
    preview.append(document.createElement('span')); $('item-surface').append(preview);
  }
  preview.style.left = `${position.x}px`; preview.style.top = `${position.y}px`;
  preview.querySelector('span').textContent = draggedPaths.length>1 ? `${draggedPaths.length} 個項目` : target ? '交換位置' : '放置位置';
  $('board').classList.add('drag-over');
}
function enableItemDrag(button, item) {
  button.onpointerdown = event => {
    if (event.button !== 0 || activeDrag || nativeDragPending) return;
    event.preventDefault();
    const collapseOnRelease=!event.ctrlKey && !event.metaKey && !event.shiftKey && selectedIds.has(item.id);
    selectItem(item,event); button.focus({preventScroll:true});
    if(!selectedIds.has(item.id))return;
    activeDrag = { button, item, collapseOnRelease, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.position.x, y: item.position.y, scrollLeft: $('items').scrollLeft, scrollTop: $('items').scrollTop, moved: false };
    button.setPointerCapture(event.pointerId);
  };
  button.onpointermove = event => {
    const drag = activeDrag;
    if (!drag || drag.button !== button) return;
    const dx = event.clientX - drag.clientX, dy = event.clientY - drag.clientY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    clearDrag(); lastDragged = Date.now(); nativeDragPending = true;
    const ids=[item.id,...selectedIds].filter((id,index,all)=>all.indexOf(id)===index);
    const draggedButtons=[...document.querySelectorAll('.item')].filter(node=>ids.includes(node.dataset.itemId));
    draggedButtons.forEach(node=>node.classList.add('dragging'));
    // Start OLE while the pointer is still inside the window and the button is
    // held. The same drag supports both internal placement and external moves.
    run(async () => {
      try {
        await api.invoke('organizer-drag-out', ids.length===1 ? item.id : ids);
        // The drop's placement IPC can finish after the native OLE operation.
        // Read the board after that update rather than rendering an old reply.
        await placementTask;
        const result = await api.invoke('organizer-get');
        const signature = items => JSON.stringify(items.map(entry => [entry.id, entry.path, entry.position]));
        if (signature(result.items) !== signature(board.items)) render(result);
        else board = result;
        status('');
      } finally { clearDropPreview(); draggedButtons.forEach(node=>node.classList.remove('dragging')); nativeDragPending = false; lastDragged = Date.now(); scheduleAutomaticLayout(); }
    });
  };
  button.onpointerup = () => {
    const drag = clearDrag();
    if (!drag?.moved) {
      if(drag?.collapseOnRelease){selectedIds=new Set([item.id]);selectionAnchor=item.id;updateSelection();}
      return;
    }
    lastDragged = Date.now();
    run(async () => { board = await api.invoke('organizer-position', { id: item.id, ...item.position }); });
  };
  button.onlostpointercapture = () => {
    if (activeDrag?.button !== button) return;
    const drag = clearDrag();
    item.position = { x: drag.x, y: drag.y };
    button.style.left = `${drag.x}px`; button.style.top = `${drag.y}px`; updateSurface();
  };
}
const status = message => { $('status').textContent = message || ''; $('status').hidden = !message; };
function appearance(color, opacity, pattern) {
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  $('board').style.backgroundColor = `rgba(${rgb.join(',')}, ${opacity / 100})`;
  $('board').dataset.pattern = pattern;
  $('board').style.setProperty('--panel-alpha', opacity / 100);
}
async function run(task) {
  try { return await task(); } catch (error) { status(error.message || '操作失敗，請再試一次。'); }
}

function applyAppearance() {
  const data = appearancePreview || board;
  $('title').textContent = data.title;
  appearance(data.color, data.opacity, data.pattern);
  $('board').style.setProperty('--filename-color', data.textColor);
  $('board').style.setProperty('--header-text-color', data.headerTextColor);
  $('board').style.setProperty('--header-background', data.headerColorMode === 'custom' ? data.headerColor : '#00000022');
  $('board').style.setProperty('--background-image', data.image ? `url("${data.image}")` : 'none');
}

function render(data) {
  board = data;
  selectedIds=new Set([...selectedIds].filter(id=>board.items.some(item=>item.id===id)));
  if(!board.items.some(item=>item.id===selectionAnchor))selectionAnchor=undefined;
  const version = ++renderVersion;
  layoutSignature = '';
  $('board').classList.toggle('locked', board.locked);
  $('board').classList.toggle('auto-arrange', board.arrangement !== 'free');
  applyAppearance();
  $('lock').textContent = board.locked ? '🔒' : '🔓';
  $('lock').title = board.locked ? '解鎖' : '鎖定';
  $('lock').setAttribute('aria-label', $('lock').title);
  $('edit').hidden = board.locked;
  $('edit').disabled = board.locked;
  $('lock').setAttribute('aria-pressed', String(board.locked));
  $('empty').hidden = board.items.length > 0;
  $('items').replaceChildren();
  const surface = document.createElement('div'); surface.id = 'item-surface'; $('items').append(surface);
  for (const item of board.items) {
    const button = document.createElement('button');
    button.className = 'item';
    button.dataset.itemId = item.id;
    button.classList.toggle('selected',selectedIds.has(item.id));
    button.setAttribute('aria-pressed',String(selectedIds.has(item.id)));
    item.position ||= { x: 8, y: 12 };
    button.style.left = `${item.position.x}px`; button.style.top = `${item.position.y}px`;
    enableItemDrag(button, item);
    button.title = item.path;
    const fallback = document.createElement('div');
    fallback.className = 'fallback'; fallback.textContent = '📄';
    const iconContainer = document.createElement('div');
    iconContainer.className = 'icon-container';
    iconContainer.append(fallback);
    const name = document.createElement('span');
    const filename = item.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || item.path;
    name.textContent = filename.replace(/\.(lnk|url)$/i, '');
    button.classList.toggle('shortcut', /\.(lnk|url)$/i.test(filename));
    button.classList.toggle('image-file', /\.(png|jpe?g|gif|bmp|webp|tiff?|ico|heic|heif|avif)$/i.test(filename));
    button.append(iconContainer, name);
    button.addEventListener('dblclick', () => { if (Date.now() - lastDragged > 350) openItem(item.id); });
    button.addEventListener('keydown', event => {
      if (event.key === 'F2') { event.preventDefault(); beginRename(item.id); return; }
      if (event.key === 'Enter') openItem(item.id);
      const arrows = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
      if (!arrows[event.key]) return;
      event.preventDefault();
      if (!['free','grid'].includes(board.arrangement)) return;
      const steps = board.arrangement === 'grid' ? { ArrowLeft:[-88,0], ArrowRight:[88,0], ArrowUp:[0,-104], ArrowDown:[0,104] } : arrows;
      const [dx,dy]=steps[event.key],ids=selectedIds.has(item.id)?[...selectedIds]:[item.id];
      // Rapid key presses must use the preceding move's returned coordinates.
      keyboardTask=keyboardTask.then(()=>run(async()=>{
        const current=board.items.find(entry=>entry.id===item.id);
        if(!current || ids.some(id=>!board.items.some(entry=>entry.id===id)))return;
        render(await api.invoke('organizer-position',{id:item.id,ids,x:current.position.x+dx,y:current.position.y+dy}));
        [...$('item-surface').children].find(node=>node.dataset.itemId===item.id)?.focus();
      }));
    });
    button.addEventListener('contextmenu', event => {
      event.preventDefault(); selectedItem = item.id;
      const rect = button.getBoundingClientRect();
      const point = { x:event.clientX || rect.left+20, y:event.clientY || rect.top+20, extended:event.shiftKey };
      run(async () => {
        const result = await api.invoke('organizer-context-menu', item.id, point);
        if (result.fallback) {
          $('remove').textContent = item.originalPath ? '移回原位置' : '從整理視窗移除';
          $('item-menu').hidden = false;
          $('item-menu').style.left = `${Math.max(0, Math.min(point.x, innerWidth - 180))}px`;
          $('item-menu').style.top = `${Math.max(0, Math.min(point.y, innerHeight - 110))}px`;
          return;
        }
        if (result.action === 'remove') render({ ...board, items:result.items });
        if (result.action === 'rename') beginRename(item.id);
        status('');
      });
    });
    surface.append(button);
    api.invoke('organizer-icon', item.id).then(icon => {
      if (!icon || version !== renderVersion) return;
      const img = document.createElement('img'); img.src = icon; img.alt = ''; img.draggable = false;
      fallback.replaceWith(img);
      updateSurface();
    }).catch(() => {});
  }
  updateSurface();
  scheduleAutomaticLayout();
}

function beginRename(id) {
  const item = board.items.find(item => item.id === id);
  const button = [...$('item-surface').children].find(node => node.dataset.itemId === id);
  if (!item || !button || button.querySelector('input')) return;
  const name = button.querySelector('span'), input = document.createElement('input');
  input.className = 'rename-input'; input.value = item.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  input.setAttribute('aria-label','檔案名稱'); input.maxLength = 255;
  name.replaceWith(input); input.focus();
  const dot = input.value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  let saving = false;
  input.onpointerdown = input.ondblclick = event => event.stopPropagation();
  input.onkeydown = event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); render(board); }
    if (event.key !== 'Enter' || saving) return;
    event.preventDefault(); saving = true;
    run(async () => {
      try { const result = await api.invoke('organizer-rename', id, input.value); render({ ...board, items:result.items }); status(''); }
      finally { saving = false; if(input.isConnected) input.focus(); }
    });
  };
  input.onblur = () => { if (!saving && input.isConnected) render(board); };
}

async function openItem(id, reveal = false) {
  await run(async () => { const result = await api.invoke('organizer-open', id, reveal); status(result.error); });
}
async function added(result) {
  if (!result) return;
  render(result.board);
  status(result.errors?.length ? result.errors.join(' ') : result.skipped ? `${result.skipped} 個項目無法加入，請確認檔案存在，且每個視窗最多 300 個項目。` : '');
}
$('hide').onclick = () => run(() => api.invoke('organizer-hide'));
$('lock').onclick = () => run(async () => render(await api.invoke('organizer-update', { locked: !board.locked })));
$('edit').onclick = () => { if (!board.locked) run(() => api.invoke('organizer-settings-open')); };
document.addEventListener('click', () => { $('item-menu').hidden = true; });
$('open').onclick = () => openItem(selectedItem);
$('reveal').onclick = () => openItem(selectedItem, true);
$('remove').onclick = () => run(async () => { render(await api.invoke('organizer-remove', selectedItem)); status(''); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='a' && !event.target.closest?.('input,textarea,select')) {
    event.preventDefault();selectedIds=new Set(board.items.map(item=>item.id));updateSelection();return;
  }
  if (event.key !== 'Escape') return;
  $('item-menu').hidden = true;
  const drag = clearDrag();
  if (drag) { drag.item.position = { x: drag.x, y: drag.y }; drag.button.style.left = `${drag.x}px`; drag.button.style.top = `${drag.y}px`; updateSurface(); }
  if(!nativeDragPending){selectedIds.clear();updateSelection();clearDropPreview();}
});
$('items').addEventListener('pointerdown',event=>{
  if(event.target.closest('.item') || event.button!==0 || nativeDragPending)return;
  selectedIds.clear();selectionAnchor=undefined;updateSelection();
});
// Report a reference operation to the drag source. Reporting Move can make
// Explorer remove the original even though we only recorded its path.
document.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'link'; if (board) showDropPreview(event); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) clearDropPreview(); });
document.addEventListener('drop', event => {
  event.preventDefault(); clearDropPreview();
  const paths = Array.from(event.dataTransfer.files, file => api.getDroppedFilePath(file)).filter(Boolean);
  if (!paths.length) return;
  const draggedPaths=organizerDrag?.paths || (organizerDrag ? [organizerDrag.path] : []);
  const transferToken = organizerDrag && organizerDrag.boardId !== board.id && paths.length===draggedPaths.length && draggedPaths.every(path=>paths.some(target=>target.toLowerCase()===path.toLowerCase())) ? organizerDrag.token : undefined;
  const position = dropPosition(event);
  const internal = paths.map(path=>board.items.find(item=>item.path.toLowerCase()===path.toLowerCase()));
  if (internal.every(Boolean) && !transferToken) {
    const anchor=internal.find(item=>item.path.toLowerCase()===organizerDrag?.path.toLowerCase()) || internal[0];
    placementTask = run(async () => { render(await api.invoke('organizer-position', { id:anchor.id,ids:internal.map(item=>item.id), ...position })); status(''); });
  } else placementTask = run(async () => added(await api.invoke('organizer-add', paths, position, transferToken)));
});
api.on('organizer-drag-state', (_event, state) => { organizerDrag = state; if (!state) clearDropPreview(); });
api.on('organizer-items-updated', (_event, items) => { if (board) render({ ...board, items }); });
api.on('organizer-view-updated', (_event, state) => {
  if (Array.isArray(state.migrationErrors)) status(state.migrationErrors.join(' '));
  if (state.statusOnly) return;
  appearancePreview = state.preview;
  if (board && state.board) {
    // Appearance previews must not recreate file nodes or interrupt dragging.
    const appearanceOnly = state.preview && JSON.stringify(state.board) === JSON.stringify(board);
    if (appearanceOnly) applyAppearance();
    else render(state.board);
  }
});
new ResizeObserver(() => { updateSurface(); scheduleAutomaticLayout(); }).observe($('items'));
$('resize').onpointerdown = event => {
  if (board.locked) return;
  event.preventDefault();
  $('resize').setPointerCapture(event.pointerId);
  const start = { x: event.screenX, y: event.screenY, width: innerWidth, height: innerHeight };
  $('resize').onpointermove = movement => run(() => api.invoke('organizer-resize', { width: start.width + movement.screenX - start.x, height: start.height + movement.screenY - start.y }));
  $('resize').onpointerup = () => { $('resize').onpointermove = null; };
  $('resize').onlostpointercapture = () => { $('resize').onpointermove = null; };
};
run(async () => {
  const data = await api.invoke('organizer-get'); render(data);
  if (data.migrationErrors?.length) status(data.migrationErrors.join(' '));
});
