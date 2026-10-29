// Hash router. Views are registered by app.js; a view returns { html, tab, title, after } or null.

import { ICONS } from './ui/dom.js';

export const VIEWS = {};
let token = 0;
let renders = 0;

export function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const query = new URLSearchParams(location.hash.split('?')[1] ?? '');
  return { name: parts[0] || 'matches', id: parts[1], sub: parts[2], query };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function tabBar(active) {
  const tab = (id, label, icon) => `<a class="tab ${active === id ? 'active' : ''}" href="#/${id}">${ICONS[icon]}<span>${label}</span></a>`;
  return `<nav class="tabbar">${tab('matches', 'Матчи', 'ball')}${tab('teams', 'Команды', 'people')}${tab('settings', 'Настройки', 'gear')}</nav>`;
}

export async function render() {
  const mine = ++token;
  const r = route();
  const view = VIEWS[r.name] ?? VIEWS.matches;
  let out;
  try {
    out = await view(r);
  } catch (e) {
    console.error(e);
    out = { html: `<main class="content"><div class="empty"><h2>Ошибка</h2><p>${String(e.message ?? e)}</p><a class="btn" href="#/matches">К матчам</a></div></main>` };
  }
  if (mine !== token) return;
  if (!out) {
    go('#/matches');
    return;
  }
  const app = document.getElementById('app');
  app.innerHTML = out.html + (out.tab ? tabBar(out.tab) : '');
  document.body.classList.toggle('with-tabs', Boolean(out.tab));
  document.body.dataset.view = r.name;
  document.body.dataset.render = String(++renders);
  document.title = out.title ? `${out.title} · Волейбол Стат` : 'Волейбол Стат';
  out.after?.();
}
