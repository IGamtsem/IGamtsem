import { loadAll } from './core.js';
import { requestPersistence } from './db.js';
import { actions, forms, changes } from './ui/dom.js';
import { VIEWS, render } from './router.js';
import { viewMatches, viewTeams, viewTeam, viewSettings } from './ui/home.js';
import { viewNewMatch, viewMatch, viewRoster, viewLineup } from './ui/setup.js';
import { viewLive } from './ui/live.js';
import { viewFeed } from './ui/feed.js';
import { viewReports } from './ui/reports.js';

Object.assign(VIEWS, {
  matches: viewMatches,
  teams: viewTeams,
  team: viewTeam,
  settings: viewSettings,
  'new-match': viewNewMatch,
  match: viewMatch,
  roster: viewRoster,
  lineup: viewLineup,
  live: viewLive,
  feed: viewFeed,
  reports: viewReports,
});

const busy = new WeakSet();

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  // Ignore a second tap on the same control while its write is still in flight.
  if (busy.has(el)) return;
  busy.add(el);
  try {
    await fn({ ...el.dataset }, el);
  } catch (err) {
    console.error(err);
    alert(`Ошибка: ${err.message ?? err}`);
  } finally {
    busy.delete(el);
  }
});

document.addEventListener('submit', async (e) => {
  const fn = forms[e.target.dataset.form];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(new FormData(e.target), e.target);
  } catch (err) {
    console.error(err);
    alert(`Ошибка: ${err.message ?? err}`);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) changes[el.dataset.change]?.(el);
});

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

async function start() {
  requestPersistence();
  try {
    await loadAll();
  } catch (err) {
    document.getElementById('app').innerHTML = `<main class="content"><div class="empty"><h2>Хранилище недоступно</h2><p>${err.message ?? err}</p><p>Откройте приложение не в приватном режиме браузера.</p></div></main>`;
    return;
  }
  await render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
