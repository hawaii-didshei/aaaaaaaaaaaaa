const jekaStates = [
  { id: 'hide',   label: 'Жека прячется' },
  { id: 'wave',   label: 'Жека машет' },
  { id: 'stand',  label: 'Жека стоит' },
  { id: 'think',  label: 'Жека задумывается' },
  { id: 'angry',  label: 'Жека злится' },
  { id: 'brick',  label: 'В Жеку прилетел кирпич' },
  { id: 'shy',    label: 'Жека смущена' }
];

const COLORS = {
  accent:      '#1e88e5',
  accentDark:  '#1565c0',
  accentHover: '#1976d2',
  accentSoft:  '#e3f2fd',
  border:      '#bbdefb',
  text:        '#2c2c2c',
  textMuted:   '#666'
};

const DB_NAME = 'fortport_jeka_db';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

let activeBlobUrls = {};
let isReplacing = false;
let storageReady = false;
let lastSeenSrc = null;
let lastOurUrl = null;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbPut(key, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(blob, key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGetAllKeys() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbDelete(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbClear() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function showToast(message, color = COLORS.accent) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    background: ${color}; color: #fff; padding: 12px 20px;
    border-radius: 6px; font-family: sans-serif; font-size: 14px;
    box-shadow: 0 4px 14px rgba(21,101,192,0.35); opacity: 0;
    transition: opacity .25s ease;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = '1'));
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

function getRandomCustomUrl() {
  const urls = Object.values(activeBlobUrls);
  if (urls.length === 0) return null;
  return urls[Math.floor(Math.random() * urls.length)];
}

function findMascotVideo() {
  return document.querySelector('video.mascot-video, .mascot-video video');
}

function replaceMascotVideo() {
  if (isReplacing) return;
  if (!storageReady) return;

  const videoEl = findMascotVideo();
  if (!videoEl) return;

  const liveSrc = videoEl.currentSrc || videoEl.src || '';
  if (!liveSrc) return;

  const ourValues = new Set(Object.values(activeBlobUrls));

  if (ourValues.has(liveSrc)) {
    lastOurUrl = liveSrc;
    lastSeenSrc = liveSrc;
    return;
  }

  if (liveSrc === lastSeenSrc) return;
  lastSeenSrc = liveSrc;

  if (ourValues.size === 0) return;
  if (!lastOurUrl && !liveSrc.startsWith('blob:')) return;

  const customUrl = getRandomCustomUrl();
  if (!customUrl) return;

  isReplacing = true;
  try {
    if (typeof videoEl.pause === 'function') videoEl.pause();
    videoEl.src = customUrl;
    if (typeof videoEl.load === 'function') {
      videoEl.load();
      const p = videoEl.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    lastOurUrl = customUrl;
    lastSeenSrc = customUrl;
  } catch (e) {
    console.warn('[FortPort] replace error:', e);
  } finally {
    requestAnimationFrame(() => { isReplacing = false; });
  }
}

const scheduleApply = debounce(replaceMascotVideo, 100);

async function loadFromDB() {
  Object.keys(activeBlobUrls).forEach((k) => {
    try { URL.revokeObjectURL(activeBlobUrls[k]); } catch (_) {}
  });
  activeBlobUrls = {};

  const keys = await dbGetAllKeys();
  for (const key of keys) {
    const blob = await dbGet(key);
    if (blob instanceof Blob) {
      activeBlobUrls[key] = URL.createObjectURL(blob);
    }
  }
}

function checkAndInjectSettings() {
  if (!location.href.includes('/settings')) return;
  if (document.querySelector('.fp-custom-jeka-section')) return;
  if (!storageReady) return;

  const all = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span'));
  const jekaHeader = all.find((el) =>
    el.textContent &&
    el.textContent.trim() === 'Помощник Жека' &&
    el.children.length === 0
  ) || all.find((el) =>
    el.textContent &&
    el.textContent.includes('Помощник Жека') &&
    el.children.length === 0
  );

  if (!jekaHeader) return;

  let target = jekaHeader;
  for (let i = 0; i < 4 && target.parentElement; i++) {
    target = target.parentElement;
  }
  if (!target) return;

  const container = document.createElement('div');
  container.className = 'fp-custom-jeka-section';
  container.style.cssText =
    'margin-top:20px; padding:18px; border:1px solid ' + COLORS.border + ';' +
    'border-radius:10px; font-family:sans-serif; background:' + COLORS.accentSoft + ';' +
    'box-shadow:0 2px 10px rgba(21,101,192,0.08);';

  container.innerHTML =
    '<h3 style="margin-top:0; color:' + COLORS.accentDark + '; display:flex; align-items:center; gap:8px;">' +
      '<span style="font-size:20px;">:D</span> Кастомизация Жеки' +
    '</h3>' +
    '<p style="font-size:12px; color:' + COLORS.textMuted + '; margin-bottom:15px; line-height:1.5;">' +
      'Загрузите свои видео. Файлы сохраняются в браузере и не пропадают после перезагрузки.' +
    '</p>' +
    '<div id="jeka-inputs-list" style="display:grid; gap:12px; margin-bottom:15px;"></div>' +
    '<div style="display:flex; gap:10px; flex-wrap:wrap;">' +
      '<button id="save-jeka-media" style="padding:10px 22px; background:' + COLORS.accent + '; color:#fff; ' +
        'border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; ' +
        'transition: background .15s; box-shadow:0 2px 6px rgba(30,136,229,0.35);">' +
        'Применить изменения' +
      '</button>' +
      '<button id="clear-jeka-media" style="padding:10px 22px; background:#fff; color:#d32f2f; ' +
        'border:1px solid #d32f2f; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px;">' +
        'Убрать все файлы' +
      '</button>' +
    '</div>';

  target.appendChild(container);
  const listContainer = container.querySelector('#jeka-inputs-list');

  jekaStates.forEach((state) => {
    const item = document.createElement('div');
    item.style.cssText =
      'display:flex; align-items:center; justify-content:space-between;' +
      'border-bottom:1px solid ' + COLORS.border + '; padding-bottom:10px;';

    const currentUrl = activeBlobUrls[state.id];
    const previewContent = currentUrl
      ? `<video src="${currentUrl}" muted autoplay loop playsinline style="width:100%;height:100%;object-fit:contain;"></video>`
      : '<span style="font-size:16px; color:' + COLORS.accent + '; opacity:0.4;">❓</span>';

    const urlDisplay = currentUrl
      ? '<div style="font-size:10px; color:' + COLORS.accent + '; font-weight:600;">● Файл загружен</div>'
      : '<div style="font-size:10px; color:#999;">○ Файл отсутствует</div>';

    item.innerHTML =
      `<div style="min-width:160px; flex-shrink:0; text-align:left;">
        <span style="font-size:13px; font-weight:600; color:${COLORS.text}; display:block;">${state.label}:</span>
        ${urlDisplay}
      </div>
      <input type="file" id="file-${state.id}" accept="video/mp4,video/webm,image/gif,image/png"
             style="font-size:12px; flex-grow:1; margin:0 10px; color:${COLORS.text};">
      <div id="preview-${state.id}"
           style="width:54px;height:54px;border:2px solid ${COLORS.border};
                  display:flex;align-items:center;justify-content:center;overflow:hidden;
                  background:#fff;border-radius:8px;">${previewContent}</div>`;

    listContainer.appendChild(item);
  });

  const saveBtn = container.querySelector('#save-jeka-media');
  saveBtn.addEventListener('mouseenter', () => { saveBtn.style.background = COLORS.accentHover; });
  saveBtn.addEventListener('mouseleave', () => { saveBtn.style.background = COLORS.accent; });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Сохранение…';

    try {
      let updated = false;

      for (const state of jekaStates) {
        const input = container.querySelector('#file-' + state.id);
        const file = input?.files?.[0];
        if (!file) continue;

        await dbPut(state.id, file);

        if (activeBlobUrls[state.id]) {
          URL.revokeObjectURL(activeBlobUrls[state.id]);
        }
        activeBlobUrls[state.id] = URL.createObjectURL(file);

        const preview = container.querySelector('#preview-' + state.id);
        if (preview) {
          preview.innerHTML =
            `<video src="${activeBlobUrls[state.id]}" muted autoplay loop playsinline
                    style="width:100%;height:100%;object-fit:contain;"></video>`;
        }
        updated = true;
      }

      if (!updated) {
        showToast('Вы не выбрали ни одного файла', '#f57c00');
        return;
      }

      showToast('Файлы сохранены!');
      scheduleApply();
    } catch (e) {
      console.error('[FortPort] save error', e);
      showToast('Ошибка сохранения: ' + (e?.message || e), '#d32f2f');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });

  const clearBtn = container.querySelector('#clear-jeka-media');
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Убрать все загруженные файлы? Жека вернётся к оригиналу.')) return;

    try {
      await dbClear();
      Object.values(activeBlobUrls).forEach((u) => {
        try { URL.revokeObjectURL(u); } catch (_) {}
      });
      activeBlobUrls = {};
      showToast('Все файлы убраны.');
      const existing = document.querySelector('.fp-custom-jeka-section');
      if (existing) {
        existing.remove();
        checkAndInjectSettings();
      }
    } catch (e) {
      console.error('[FortPort] clear error', e);
      showToast('Ошибка очистки: ' + (e?.message || e), '#d32f2f');
    }
  });
}

const scheduleInject = debounce(checkAndInjectSettings, 200);

(async function init() {
  try {
    db = await openDB();
  } catch (e) {
    console.error('[FortPort] IndexedDB open error:', e);
    return;
  }

  await loadFromDB();
  storageReady = true;

  const observer = new MutationObserver(() => {
    scheduleInject();
    scheduleApply();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });

  window.addEventListener('beforeunload', () => {
    Object.values(activeBlobUrls).forEach((u) => {
      try { URL.revokeObjectURL(u); } catch (_) {}
    });
  });

  checkAndInjectSettings();
  scheduleApply();
  setInterval(scheduleApply, 2000);
})();