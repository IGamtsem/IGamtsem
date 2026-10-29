// Small UI toolkit: escaping, formatting, dialogs, sheets and file sharing. No framework.

import { state } from '../core.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Registry for delegated events; screens add handlers by name. */
export const actions = {};
export const forms = {};
export const changes = {};

// ---------- Formatting ----------

const num1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtPct(p, { showN = false } = {}) {
  if (!p || p.value == null) return '—';
  return `${num1.format(p.value * 100)}%${showN ? ` (${p.num}/${p.den})` : ''}`;
}

export function isSmall(p) {
  return p && p.value != null && p.den < (state.settings?.smallSample ?? 20);
}

/** Table cell for a percentage: value, N on hover/long-press, muted when the sample is small. */
export function pctCell(p) {
  if (!p || p.value == null) return `<td class="num na" title="Нет наблюдений">—</td>`;
  const small = isSmall(p);
  return `<td class="num${small ? ' few' : ''}" title="${p.num} из ${p.den}${small ? ' · мало наблюдений' : ''}">${fmtPct(p)}${small ? '<sup>*</sup>' : ''}</td>`;
}

export const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(iso).toLocaleDateString('ru-RU', opts);

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function localDateTimeValue(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export const score = (s) => `${s.us}:${s.them}`;

// ---------- Icons ----------

const svg = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const stroke = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  ball: svg(`<circle cx="12" cy="12" r="9.5" ${stroke}/><path d="M12 2.5c-2.5 3-3 7-1 10.5M21 9.5c-3.7-1-7.8 0-10 3.5M6 19.5c1.2-3.6 4-6 7.9-6.5" ${stroke}/>`),
  people: svg(`<circle cx="9" cy="8" r="3.5" ${stroke}/><path d="M2.5 20c.6-3.8 3.2-6 6.5-6s5.9 2.2 6.5 6" ${stroke}/><circle cx="17" cy="9" r="2.6" ${stroke}/><path d="M17 14c2.6 0 4.3 1.8 4.7 4.6" ${stroke}/>`),
  gear: svg(`<circle cx="12" cy="12" r="3" ${stroke}/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" ${stroke}/>`),
  plus: svg(`<path d="M12 5v14M5 12h14" ${stroke}/>`),
  undo: svg(`<path d="M9 7 4 12l5 5" ${stroke}/><path d="M4.5 12H15a5 5 0 0 1 0 10h-3" ${stroke}/>`),
  redo: svg(`<path d="m15 7 5 5-5 5" ${stroke}/><path d="M19.5 12H9a5 5 0 0 0 0 10h3" ${stroke}/>`),
  chevron: svg(`<path d="m9 5 7 7-7 7" ${stroke}/>`, 'chev'),
  back: svg(`<path d="m15 5-7 7 7 7" ${stroke}/>`),
  list: svg(`<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" ${stroke}/>`),
  chart: svg(`<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" ${stroke}/>`),
  swap: svg(`<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" ${stroke}/>`),
  flip: svg(`<path d="M12 3v18M8 7 4 12l4 5M16 7l4 5-4 5" ${stroke}/>`),
  download: svg(`<path d="M12 4v11M7 10l5 5 5-5M5 20h14" ${stroke}/>`),
  upload: svg(`<path d="M12 20V9M7 14l5-5 5 5M5 4h14" ${stroke}/>`),
  court: svg(`<rect x="3" y="4" width="18" height="16" rx="1.5" ${stroke}/><path d="M3 12h18M9 4v16M15 4v16" ${stroke}/>`),
  whistle: svg(`<circle cx="9" cy="14" r="5" ${stroke}/><path d="M13 10h8v4h-4" ${stroke}/>`),
  replay: svg(`<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" ${stroke}/>`),
  flag: svg(`<path d="M5 21V4M5 4h11l-2 4 2 4H5" ${stroke}/>`),
  card: svg(`<rect x="6" y="3" width="12" height="18" rx="2" ${stroke}/>`),
  pause: svg(`<path d="M9 5v14M15 5v14" ${stroke}/>`),
  warn: svg(`<path d="M12 3 2 21h20L12 3zM12 10v5M12 18h.01" ${stroke}/>`),
};

// ---------- Dialogs ----------

let dialogOpen = false;
export const isDialogOpen = () => dialogOpen || Boolean(document.querySelector('.sheet-overlay'));

/** Centred dialog. Resolves with the chosen button's value, or the text of an input dialog. */
export function dialog({ title, message = '', input = null, buttons }) {
  return new Promise((resolve) => {
    dialogOpen = true;
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<form class="dialog" role="dialog" aria-modal="true">
      <h2>${h(title)}</h2>${message ? `<p>${h(message)}</p>` : ''}
      ${input ? `<input class="dialog-input" value="${h(input.value ?? '')}" placeholder="${h(input.placeholder ?? '')}">` : ''}
      <div class="dialog-buttons">${buttons
        .map((b, i) => `<button type="${b.submit ? 'submit' : 'button'}" data-i="${i}" class="${b.style ?? ''}">${h(b.label)}</button>`)
        .join('')}</div>
    </form>`;
    const finish = (button) => {
      const text = wrap.querySelector('.dialog-input')?.value ?? null;
      wrap.remove();
      dialogOpen = false;
      resolve(input ? (button?.submit ? text : null) : button?.value);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b && b.type !== 'submit') {
        e.stopPropagation();
        finish(buttons[Number(b.dataset.i)]);
      }
    });
    wrap.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish(buttons.find((b) => b.submit));
    });
    document.body.append(wrap);
    (wrap.querySelector('.dialog-input') ?? wrap.querySelector('button[type=submit]'))?.focus();
  });
}

export const confirmBox = (title, message, okLabel = 'OK', destructive = false) =>
  dialog({
    title,
    message,
    buttons: [{ label: 'Отмена', value: false }, { label: okLabel, value: true, submit: true, style: destructive ? 'destructive' : 'bold' }],
  });

export const alertBox = (title, message) => dialog({ title, message, buttons: [{ label: 'OK', value: true, submit: true, style: 'bold' }] });

export const askText = (title, placeholder = '', value = '', message = '') =>
  dialog({ title, message, input: { placeholder, value }, buttons: [{ label: 'Отмена' }, { label: 'Готово', submit: true, style: 'bold' }] });

/** Bottom sheet (phone) / side panel (tablet) holding a form or a picker. */
export function openSheet(html, { wide = false } = {}) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'overlay sheet-overlay';
  wrap.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}">${html}</div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove();
  });
  document.body.append(wrap);
  return wrap.querySelector('.sheet');
}

export function closeSheet() {
  document.querySelector('.sheet-overlay')?.remove();
}

export function sheetBar(title, { done = null } = {}) {
  return `<div class="sheet-bar"><button type="button" class="nav-btn" data-close>Закрыть</button><h2>${h(title)}</h2>${
    done ? `<button type="submit" class="nav-btn bold">${h(done)}</button>` : '<span></span>'
  }</div>`;
}

let toastTimer = null;
export function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Files ----------

export async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}

export function safeFilePart(s) {
  return (
    String(s ?? '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .join('_') || 'match'
  );
}

// ---------- Layout ----------

export function navBar({ back, backLabel = 'Назад', title, right = '', sub = '' }) {
  const left = back ? `<a class="nav-btn back" href="${back}">${ICONS.back}<span>${h(backLabel)}</span></a>` : '';
  return `<header class="navbar"><div class="nav-side">${left}</div><div class="nav-title"><h1>${h(title)}</h1>${
    sub ? `<div class="nav-sub">${h(sub)}</div>` : ''
  }</div><div class="nav-side right">${right}</div></header>`;
}

export function largeHeader(title, action = '') {
  return `<header class="large-header"><h1>${h(title)}</h1><div class="lh-actions">${action}</div></header>`;
}

export function emptyState(title, text, buttons = '') {
  return `<div class="empty"><div class="empty-icon">${ICONS.ball}</div><h2>${h(title)}</h2><p>${h(text)}</p><div class="empty-actions">${buttons}</div></div>`;
}

export function segmented(name, options, active, act = 'seg') {
  return `<div class="segmented" role="tablist">${options
    .map(
      ([value, label]) =>
        `<button class="seg ${String(value) === String(active) ? 'active' : ''}" data-act="${act}" data-name="${name}" data-value="${h(value)}">${h(label)}</button>`
    )
    .join('')}</div>`;
}
