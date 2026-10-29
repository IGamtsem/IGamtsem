import * as D from './domain.js';
import { load, save, uid, demoTeam, isValidData, requestPersistence } from './store.js';

let data = load();
const ui = { selected: null, statsCat: 'summary', statsSet: 0 };
const app = document.getElementById('app');

// ---------- Helpers ----------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const teamById = (id) => data.teams.find((t) => t.id === id);
const matchById = (id) => data.matches.find((m) => m.id === id);
const teamName = (m) => teamById(m.teamId)?.name ?? m.teamName;
const rosterOf = (team) =>
  [...(team?.players ?? [])].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
const sortedEvents = (m) => [...m.events].sort((a, b) => a.seq - b.seq);

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function localDateTimeValue(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function commit() {
  if (!save(data)) {
    alertBox('Не удалось сохранить', 'Похоже, закончилось место в хранилище браузера. Сохраните резервную копию.');
  }
  render();
}

function currentMatch() {
  return matchById(route().id);
}

// ---------- Routing ----------

function route() {
  const [name = 'matches', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'matches', id };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const VIEWS = {
  matches: viewMatches,
  teams: viewTeams,
  team: viewTeam,
  'new-match': viewNewMatch,
  match: viewMatch,
  live: viewLive,
  stats: viewStats,
};

function render() {
  const r = route();
  const out = (VIEWS[r.name] ?? viewMatches)(r);
  if (!out) {
    go('#/matches');
    return;
  }
  app.innerHTML = out.html + (out.tab ? tabBar(out.tab) : '');
  document.body.classList.toggle('with-tabs', Boolean(out.tab));
  document.title = out.title ? `${out.title} · Волейбол Стат` : 'Волейбол Стат';
}

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

// ---------- Layout pieces ----------

const ICONS = {
  ball: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5c-2.5 3-3 7-1 10.5M21 9.5c-3.7-1-7.8 0-10 3.5M6 19.5c1.2-3.6 4-6 7.9-6.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20c.6-3.8 3.2-6 6.5-6s5.9 2.2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M17 14c2.6 0 4.3 1.8 4.7 4.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 12H15a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chevron: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function tabBar(active) {
  const tab = (id, label, icon) =>
    `<a class="tab ${active === id ? 'active' : ''}" href="#/${id}">${ICONS[icon]}<span>${label}</span></a>`;
  return `<nav class="tabbar">${tab('matches', 'Матчи', 'ball')}${tab('teams', 'Команды', 'people')}</nav>`;
}

function largeHeader(title, action = '') {
  return `<header class="large-header"><h1>${h(title)}</h1>${action}</header>`;
}

function navBar({ back, backLabel = 'Назад', title, right = '', left }) {
  const leftHtml = left ?? (back ? `<a class="nav-btn back" href="${back}">‹ ${h(backLabel)}</a>` : '');
  return `<header class="navbar"><div class="nav-side">${leftHtml}</div><h1>${h(title)}</h1><div class="nav-side right">${right}</div></header>`;
}

function emptyState(title, text, actions = '') {
  return `<div class="empty"><div class="empty-icon">${ICONS.ball}</div><h2>${h(title)}</h2><p>${h(text)}</p><div class="empty-actions">${actions}</div></div>`;
}

// ---------- Views: matches ----------

function matchRow(m) {
  const board = D.scoreboard(m);
  const sub = [fmtDate(m.date), m.tournament].filter(Boolean).map(h).join(' · ');
  const live = m.isFinished ? '' : `<div class="live-tag">Сет ${m.currentSet} · ${board.current.us}:${board.current.them}</div>`;
  return `<a class="row" href="#/match/${m.id}">
    <div class="row-main"><div class="row-title">${h(teamName(m))} — ${h(m.opponent)}</div><div class="row-sub">${sub}</div></div>
    <div class="row-end"><div class="sets-score">${board.setsUs}:${board.setsThem}</div>${live}</div>
    ${ICONS.chevron}
  </a>`;
}

function viewMatches() {
  const matches = [...data.matches].sort((a, b) => new Date(b.date) - new Date(a.date));
  const add = `<a class="icon-btn" href="#/new-match" aria-label="Новый матч">${ICONS.plus}</a>`;
  if (matches.length === 0) {
    return {
      tab: 'matches',
      title: 'Матчи',
      html: largeHeader('Матчи', add) + emptyState(
        'Нет матчей',
        'Начните матч, чтобы записывать подачи, приём, атаки и блоки по ходу игры.',
        '<a class="btn primary" href="#/new-match">Новый матч</a>'
      ),
    };
  }
  const section = (title, list) =>
    list.length ? `<h3 class="section-title">${title}</h3><div class="group">${list.map(matchRow).join('')}</div>` : '';
  return {
    tab: 'matches',
    title: 'Матчи',
    html: largeHeader('Матчи', add) +
      `<main class="content">${section('Идут', matches.filter((m) => !m.isFinished))}${section('Завершены', matches.filter((m) => m.isFinished))}</main>`,
  };
}

function viewNewMatch() {
  const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name));
  const teamField = teams.length
    ? `<label class="field"><span>Моя команда</span><select name="team" required>${teams
        .map((t) => `<option value="${t.id}">${h(t.name)}</option>`)
        .join('')}</select></label>`
    : `<div class="field note">Команд пока нет. <button type="button" class="link" data-act="demo-team">Создать демо-команду</button> или добавьте свою на вкладке «Команды».</div>`;
  return {
    tab: 'matches',
    title: 'Новый матч',
    html: navBar({ back: '#/matches', backLabel: 'Матчи', title: 'Новый матч' }) +
      `<main class="content"><form data-form="new-match" autocomplete="off">
        <div class="group form">
          ${teamField}
          <label class="field"><span>Соперник</span><input name="opponent" required placeholder="Название команды"></label>
          <label class="field"><span>Турнир</span><input name="tournament" placeholder="Необязательно"></label>
          <label class="field"><span>Дата</span><input name="date" type="datetime-local" value="${localDateTimeValue()}"></label>
        </div>
        <h3 class="section-title">Формат</h3>
        <div class="group form">
          <label class="field"><span>Матч</span><select name="bestOf"><option value="5">До 3 побед (5 сетов)</option><option value="3">До 2 побед (3 сета)</option></select></label>
          <label class="field"><span>Очков в сете</span><input name="points" type="number" inputmode="numeric" min="5" max="50" value="25"></label>
          <label class="field"><span>В решающем сете</span><input name="deciding" type="number" inputmode="numeric" min="5" max="50" value="15"></label>
        </div>
        <button class="btn primary wide" type="submit" ${teams.length ? '' : 'disabled'}>Начать матч</button>
      </form></main>`,
  };
}

function viewMatch({ id }) {
  const m = matchById(id);
  if (!m) return null;
  const board = D.scoreboard(m);
  const events = sortedEvents(m);
  const log = [...board.sets].reverse().map((s) => {
    const list = events.filter((e) => e.set === s.number).reverse();
    if (!list.length) return '';
    return `<h3 class="section-title">Сет ${s.number} · ${s.us}:${s.them}</h3><div class="group">${list.map(eventRow).join('')}</div>`;
  }).join('');

  const primary = m.isFinished
    ? `<button class="btn wide" data-act="resume">Возобновить запись</button>`
    : `<a class="btn primary wide" href="#/live/${m.id}">Продолжить запись</a>`;

  return {
    tab: 'matches',
    title: `${teamName(m)} — ${m.opponent}`,
    html: navBar({ back: '#/matches', backLabel: 'Матчи', title: `${teamName(m)} — ${m.opponent}` }) +
      `<main class="content">
        <div class="score-card">
          <div class="score-teams"><span>${h(teamName(m))}</span><strong>${board.setsUs} : ${board.setsThem}</strong><span>${h(m.opponent)}</span></div>
          <div class="score-sets">${board.sets.map((s) => `${s.us}:${s.them}`).join('&nbsp;&nbsp;')}</div>
          <div class="score-date">${h(fmtDateTime(m.date))}${m.tournament ? ` · ${h(m.tournament)}` : ''}</div>
        </div>
        ${primary}
        <div class="group">
          <a class="row" href="#/stats/${m.id}"><div class="row-main"><div class="row-title">Статистика игроков</div></div>${ICONS.chevron}</a>
          <button class="row" data-act="export-csv"><div class="row-main"><div class="row-title accent">Экспорт в CSV</div></div></button>
        </div>
        ${log || '<p class="hint">Действий пока нет.</p>'}
        <button class="btn danger wide" data-act="delete-match">Удалить матч</button>
      </main>`,
  };
}

function eventRow(e) {
  const w = D.pointWinner(e.skill, e.outcome);
  const badge = w === 'us' ? '<span class="pt us">+1</span>' : w === 'them' ? '<span class="pt them">−1</span>' : '';
  return `<div class="row event"><div class="row-main">${h(D.eventSummary(e))}</div>${badge}<button class="del" data-act="delete-event" data-seq="${e.seq}" aria-label="Удалить">✕</button></div>`;
}

// ---------- Views: live input ----------

function viewLive({ id }) {
  const m = matchById(id);
  if (!m) return null;
  const team = teamById(m.teamId);
  const roster = rosterOf(team);
  const board = D.scoreboard(m);
  const selected = roster.find((p) => p.id === ui.selected) ?? null;

  const right = `<button class="icon-btn" data-act="undo" aria-label="Отменить" ${m.events.length ? '' : 'disabled'}>${ICONS.undo}</button>
    <button class="nav-btn" data-act="end-set" ${m.isFinished || board.current.us === board.current.them ? 'disabled' : ''}>Сет ✓</button>`;

  const header = `<div class="live-top">
    ${navBar({ left: `<a class="nav-btn" href="#/match/${m.id}">Закрыть</a>`, title: m.isFinished ? 'Матч завершён' : `Сет ${m.currentSet}`, right })}
    <div class="scoreboard">
      <div class="sb-team"><div class="sb-name">${h(teamName(m))}</div><div class="sb-sets">Сеты: ${board.setsUs}</div></div>
      <div class="sb-score">${board.current.us}<span>:</span>${board.current.them}</div>
      <div class="sb-team right"><div class="sb-name">${h(m.opponent)}</div><div class="sb-sets">Сеты: ${board.setsThem}</div></div>
    </div>
    ${board.sets.length > 1 ? `<div class="sb-history">${board.sets.slice(0, -1).map((s) => `${s.us}:${s.them}`).join('&nbsp;&nbsp;&nbsp;')}</div>` : ''}
  </div>`;

  let body;
  if (m.isFinished) {
    const won = board.setsUs > board.setsThem;
    body = `<div class="finished"><div class="trophy ${won ? 'won' : ''}">🏆</div><h2>${won ? 'Победа' : 'Поражение'}</h2>
      <p>Кнопка ↶ отменит последнее действие и вернёт матч в игру.</p>
      <a class="btn primary" href="#/stats/${m.id}">Статистика</a></div>`;
  } else {
    const players = roster.length
      ? `<div class="players">${roster.map((p) => `<button class="player ${p.id === ui.selected ? 'selected' : ''} ${p.position === 'libero' ? 'libero' : ''}" data-act="select" data-id="${p.id}">
          <span class="num">${p.number}</span><span class="name">${h(p.name)}</span></button>`).join('')}</div>`
      : '<p class="hint">В составе нет игроков. Добавьте их на вкладке «Команды», а пока можно вести счёт кнопками «Без игрока».</p>';

    const pad = D.PLAYER_SKILLS.map((skill) => `<div class="pad-row"><div class="pad-label">${D.SKILLS[skill].title}</div>${D.SKILLS[skill].outcomes
      .map((o) => outcomeButton(skill, o, !selected)).join('')}</div>`).join('');

    body = `${players}
      <div class="pad">
        <div class="pad-who ${selected ? '' : 'muted'}">${selected ? `#${selected.number} ${h(selected.name)}` : 'Выберите игрока'}</div>
        ${pad}
      </div>
      <div class="pad">
        <div class="pad-who">Без игрока</div>
        <div class="pad-row">${D.TEAM_SKILLS.map((s) => outcomeButton(s, 'neutral', false)).join('')}</div>
      </div>`;
  }

  const recent = sortedEvents(m).slice(-6).reverse();
  const recentHtml = recent.length
    ? `<h3 class="section-title">Последние действия</h3><div class="group">${recent.map((e) => {
        const w = D.pointWinner(e.skill, e.outcome);
        const badge = w === 'us' ? '<span class="pt us">+1</span>' : w === 'them' ? '<span class="pt them">−1</span>' : '';
        return `<div class="row event"><div class="row-main">${h(D.eventSummary(e))}</div>${badge}</div>`;
      }).join('')}</div>`
    : '';

  return { title: 'Запись матча', html: `${header}<main class="content live">${body}${recentHtml}</main>` };
}

function outcomeButton(skill, outcome, disabled) {
  const w = D.pointWinner(skill, outcome);
  const tone = w === 'us' ? 'good' : w === 'them' ? 'bad' : 'neutral';
  return `<button class="out ${tone}" data-act="rec" data-skill="${skill}" data-outcome="${outcome}" ${disabled ? 'disabled' : ''}>${h(D.outcomeTitle(skill, outcome))}</button>`;
}

// ---------- Views: stats ----------

function viewStats({ id }) {
  const m = matchById(id);
  if (!m) return null;
  if (ui.statsSet > m.currentSet) ui.statsSet = 0;
  const cat = D.CATEGORIES.find((c) => c.id === ui.statsCat) ?? D.CATEGORIES[0];
  const table = D.statsTable(m, teamById(m.teamId)?.players ?? [], ui.statsSet || null);

  const chips = D.CATEGORIES.map((c) =>
    `<button class="chip ${c.id === cat.id ? 'active' : ''}" data-act="stats-cat" data-id="${c.id}">${c.title}</button>`).join('');
  const setOptions = [0, ...Array.from({ length: m.currentSet }, (_, i) => i + 1)];
  const segments = setOptions.map((n) =>
    `<button class="seg ${n === ui.statsSet ? 'active' : ''}" data-act="stats-set" data-n="${n}">${n === 0 ? 'Матч' : `Сет ${n}`}</button>`).join('');

  const cells = (line) => cat.columns.map((c) => `<td>${h(c.value(line))}</td>`).join('');
  const rows = table.players.filter((r) => cat.has(r.line));
  const tableHtml = rows.length
    ? `<div class="table-wrap"><table class="stats">
        <thead><tr><th class="player-col">Игрок</th>${cat.columns.map((c) => `<th>${h(c.title)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr><th class="player-col"><b>${r.number ?? '–'}</b> ${h(r.name)}</th>${cells(r.line)}</tr>`).join('')}</tbody>
        <tfoot><tr><th class="player-col">Команда</th>${cells(table.team.line)}</tr></tfoot>
      </table></div>`
    : '<p class="hint">В этом отрезке таких действий ещё не записано.</p>';

  return {
    tab: 'matches',
    title: 'Статистика',
    html: navBar({ back: `#/match/${m.id}`, backLabel: 'Матч', title: 'Статистика' }) +
      `<main class="content">
        <div class="chips">${chips}</div>
        <div class="segmented">${segments}</div>
        ${tableHtml}
        <p class="hint">${h(cat.legend)}</p>
      </main>`,
  };
}

// ---------- Views: teams ----------

function viewTeams() {
  const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name));
  const add = `<button class="icon-btn" data-act="add-team" aria-label="Новая команда">${ICONS.plus}</button>`;
  const list = teams.length
    ? `<div class="group">${teams.map((t) => `<a class="row" href="#/team/${t.id}"><div class="row-main"><div class="row-title">${h(t.name)}</div><div class="row-sub">Игроков: ${t.players.length}</div></div>${ICONS.chevron}</a>`).join('')}</div>`
    : emptyState('Нет команд', 'Создайте команду и добавьте игроков, чтобы вести статистику.',
        '<button class="btn primary" data-act="add-team">Создать команду</button><button class="btn" data-act="demo-team">Демо-команда</button>');

  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const install = standalone ? '' : `<h3 class="section-title">Установка</h3><div class="group"><div class="row"><div class="row-main row-sub">
    В Safari нажмите «Поделиться» и выберите «На экран Домой». Приложение получит свою иконку и будет работать без интернета.</div></div></div>`;

  return {
    tab: 'teams',
    title: 'Команды',
    html: largeHeader('Команды', add) + `<main class="content">${list}
      <h3 class="section-title">Данные</h3>
      <div class="group">
        <button class="row" data-act="backup"><div class="row-main"><div class="row-title accent">Сохранить резервную копию</div></div></button>
        <label class="row"><div class="row-main"><div class="row-title accent">Восстановить из копии</div></div><input type="file" accept="application/json,.json" data-change="import" hidden></label>
      </div>
      <p class="hint">Данные хранятся только на этом телефоне. Время от времени сохраняйте копию в «Файлы» или iCloud Drive.</p>
      ${install}
    </main>`,
  };
}

function viewTeam({ id }) {
  const team = teamById(id);
  if (!team) return null;
  const roster = rosterOf(team);
  const rows = roster.map((p) => `<button class="row" data-act="edit-player" data-id="${p.id}">
      <div class="num-badge">${p.number}</div><div class="row-main"><div class="row-title">${h(p.name)}</div></div>
      <div class="row-sub">${h(D.POSITIONS[p.position] ?? '')}</div></button>`).join('');
  return {
    tab: 'teams',
    title: team.name,
    html: navBar({ back: '#/teams', backLabel: 'Команды', title: team.name }) +
      `<main class="content">
        <h3 class="section-title">Название</h3>
        <div class="group form"><label class="field"><input data-change="team-name" value="${h(team.name)}" placeholder="Название команды"></label></div>
        <h3 class="section-title">Состав</h3>
        <div class="group">${rows}<button class="row" data-act="add-player"><div class="row-main"><div class="row-title accent">+ Добавить игрока</div></div></button></div>
        <p class="hint">Удалённый игрок остаётся в статистике уже сыгранных матчей.</p>
        <button class="btn danger wide" data-act="delete-team">Удалить команду</button>
      </main>`,
  };
}

// ---------- Dialogs ----------

let dialogOpen = false;

/** Small centred dialog. Resolves with the chosen button's value, or the text for an input dialog. */
function dialog({ title, message = '', input = null, buttons }) {
  return new Promise((resolve) => {
    dialogOpen = true;
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<form class="dialog" role="dialog" aria-modal="true">
      <h2>${h(title)}</h2>${message ? `<p>${h(message)}</p>` : ''}
      ${input ? `<input class="dialog-input" value="${h(input.value ?? '')}" placeholder="${h(input.placeholder ?? '')}">` : ''}
      <div class="dialog-buttons">${buttons.map((b, i) => `<button type="${b.submit ? 'submit' : 'button'}" data-i="${i}" class="${b.style ?? ''}">${h(b.label)}</button>`).join('')}</div>
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
    wrap.querySelector('.dialog-input')?.focus();
  });
}

const confirmBox = (title, message, okLabel, destructive = false) =>
  dialog({ title, message, buttons: [{ label: 'Отмена', value: false }, { label: okLabel, value: true, submit: true, style: destructive ? 'destructive' : 'bold' }] });

const alertBox = (title, message) => dialog({ title, message, buttons: [{ label: 'OK', value: true, submit: true, style: 'bold' }] });

const askText = (title, placeholder, value = '') =>
  dialog({ title, input: { placeholder, value }, buttons: [{ label: 'Отмена' }, { label: 'Готово', submit: true, style: 'bold' }] });

/** Bottom sheet with a form, used for the player editor. */
function openSheet(html) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay sheet-overlay';
  wrap.innerHTML = `<div class="sheet">${html}</div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove();
  });
  document.body.append(wrap);
  return wrap;
}

function closeSheet() {
  document.querySelector('.sheet-overlay')?.remove();
}

function playerSheet(team, player) {
  const nextNumber = team.players.reduce((m, p) => Math.max(m, p.number), 0) + 1;
  const positions = Object.entries(D.POSITIONS).map(([k, v]) =>
    `<option value="${k}" ${(player?.position ?? 'outside') === k ? 'selected' : ''}>${v}</option>`).join('');
  openSheet(`<form data-form="player" autocomplete="off">
    <input type="hidden" name="teamId" value="${team.id}">
    <input type="hidden" name="playerId" value="${player?.id ?? ''}">
    <div class="sheet-bar"><button type="button" class="nav-btn" data-close>Отмена</button><h2>${player ? 'Игрок' : 'Новый игрок'}</h2><button type="submit" class="nav-btn bold">Готово</button></div>
    <div class="group form">
      <label class="field"><span>Имя</span><input name="name" required value="${h(player?.name ?? '')}" placeholder="Фамилия и имя" autocapitalize="words"></label>
      <label class="field"><span>Номер</span><input name="number" type="number" inputmode="numeric" min="0" max="99" required value="${player?.number ?? nextNumber}"></label>
      <label class="field"><span>Амплуа</span><select name="position">${positions}</select></label>
    </div>
    ${player ? '<button type="button" class="btn danger wide" data-act="delete-player">Удалить игрока</button>' : ''}
  </form>`);
  if (!player) document.querySelector('.sheet input[name="name"]')?.focus();
}

// ---------- Files ----------

async function shareFile(name, text, type) {
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

// ---------- Set end ----------

async function promptSetEnd(m, winner) {
  if (dialogOpen) return;
  const board = D.scoreboard(m);
  const ends = D.closingEndsMatch(m, board, winner);
  const ok = await dialog({
    title: `Сет ${m.currentSet} — ${board.current.us}:${board.current.them}`,
    message: winner === 'us' ? `Сет за «${teamName(m)}».` : `Сет за соперником («${m.opponent}»).`,
    buttons: [
      { label: 'Продолжить сет', value: false },
      { label: ends ? 'Завершить матч' : 'Завершить сет', value: true, submit: true, style: 'bold' },
    ],
  });
  if (ok) {
    D.closeCurrentSet(m);
    commit();
  }
}

// ---------- Actions ----------

const actions = {
  'demo-team'() {
    data.teams.push(demoTeam());
    commit();
  },

  async 'add-team'() {
    const name = (await askText('Новая команда', 'Название'))?.trim();
    if (!name) return;
    const team = { id: uid(), name, createdAt: Date.now(), players: [] };
    data.teams.push(team);
    save(data);
    go(`#/team/${team.id}`);
  },

  async 'delete-team'() {
    const team = teamById(route().id);
    if (!team || !(await confirmBox(`Удалить «${team.name}»?`, 'Сыгранные матчи и их статистика останутся.', 'Удалить', true))) return;
    data.teams = data.teams.filter((t) => t !== team);
    save(data);
    go('#/teams');
  },

  'add-player'() {
    const team = teamById(route().id);
    if (team) playerSheet(team, null);
  },

  'edit-player'({ id }) {
    const team = teamById(route().id);
    const player = team?.players.find((p) => p.id === id);
    if (player) playerSheet(team, player);
  },

  async 'delete-player'() {
    const form = document.querySelector('.sheet form');
    const team = teamById(form.teamId.value);
    const player = team?.players.find((p) => p.id === form.playerId.value);
    if (!player || !(await confirmBox(`Удалить ${player.name}?`, 'Статистика в сыгранных матчах сохранится.', 'Удалить', true))) return;
    team.players = team.players.filter((p) => p !== player);
    closeSheet();
    commit();
  },

  select({ id }) {
    ui.selected = ui.selected === id ? null : id;
    render();
  },

  rec({ skill, outcome }) {
    const m = currentMatch();
    if (!m || m.isFinished) return;
    const isTeam = Boolean(D.SKILLS[skill]?.team);
    const player = isTeam ? null : teamById(m.teamId)?.players.find((p) => p.id === ui.selected);
    if (!isTeam && !player) return;
    D.recordEvent(m, skill, outcome, player);
    ui.selected = null;
    navigator.vibrate?.(12);
    commit();
    const winner = D.scoreboard(m).currentRuleWinner;
    if (winner) promptSetEnd(m, winner);
  },

  undo() {
    const m = currentMatch();
    if (!m) return;
    D.undoLast(m);
    ui.selected = null;
    commit();
  },

  'end-set'() {
    const m = currentMatch();
    if (!m || m.isFinished) return;
    const { us, them } = D.scoreboard(m).current;
    if (us !== them) promptSetEnd(m, us > them ? 'us' : 'them');
  },

  resume() {
    const m = currentMatch();
    if (!m) return;
    m.isFinished = false;
    save(data);
    go(`#/live/${m.id}`);
  },

  async 'delete-event'({ seq }) {
    const m = currentMatch();
    const e = m?.events.find((x) => x.seq === Number(seq));
    if (!e || !(await confirmBox('Удалить действие?', D.eventSummary(e), 'Удалить', true))) return;
    m.events = m.events.filter((x) => x !== e);
    commit();
  },

  async 'delete-match'() {
    const m = currentMatch();
    if (!m || !(await confirmBox('Удалить матч?', 'Вся записанная статистика матча пропадёт.', 'Удалить', true))) return;
    data.matches = data.matches.filter((x) => x !== m);
    save(data);
    go('#/matches');
  },

  'export-csv'() {
    const m = currentMatch();
    if (!m) return;
    // The byte order mark makes Excel read the file as UTF-8.
    shareFile(D.csvFileName(m), '﻿' + D.matchCsv(m, teamById(m.teamId)?.players ?? []), 'text/csv');
  },

  backup() {
    const day = localDateTimeValue().slice(0, 10);
    shareFile(`volleystats-backup-${day}.json`, JSON.stringify(data), 'application/json');
  },

  'stats-cat'({ id }) {
    ui.statsCat = id;
    render();
  },

  'stats-set'({ n }) {
    ui.statsSet = Number(n);
    render();
  },
};

const forms = {
  'new-match'(fd) {
    const team = teamById(fd.get('team'));
    const opponent = String(fd.get('opponent') ?? '').trim();
    if (!team || !opponent) return;
    const date = new Date(fd.get('date'));
    const points = (name, fallback) => Math.min(50, Math.max(5, parseInt(fd.get(name), 10) || fallback));
    const match = {
      id: uid(),
      teamId: team.id,
      teamName: team.name,
      opponent,
      tournament: String(fd.get('tournament') ?? '').trim(),
      date: (isNaN(date) ? new Date() : date).toISOString(),
      bestOf: Number(fd.get('bestOf')) === 3 ? 3 : 5,
      pointsPerSet: points('points', 25),
      decidingSetPoints: points('deciding', 15),
      currentSet: 1,
      isFinished: false,
      events: [],
    };
    data.matches.push(match);
    ui.selected = null;
    save(data);
    go(`#/live/${match.id}`);
  },

  async player(fd) {
    const team = teamById(fd.get('teamId'));
    if (!team) return;
    const name = String(fd.get('name') ?? '').trim();
    const number = parseInt(fd.get('number'), 10);
    if (!name || isNaN(number)) return;
    const playerId = fd.get('playerId');
    const clash = team.players.find((p) => p.number === number && p.id !== playerId);
    if (clash && !(await confirmBox(`Номер ${number} уже у игрока ${clash.name}`, 'Сохранить всё равно?', 'Сохранить'))) return;
    const fields = { name, number, position: String(fd.get('position')) };
    const existing = team.players.find((p) => p.id === playerId);
    if (existing) Object.assign(existing, fields);
    else team.players.push({ id: uid(), ...fields });
    closeSheet();
    commit();
  },
};

const changes = {
  'team-name'(el) {
    const team = teamById(route().id);
    const name = el.value.trim();
    if (!team || !name) return;
    team.name = name;
    commit();
  },

  async import(el) {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      parsed = null;
    }
    if (!isValidData(parsed)) {
      alertBox('Не тот файл', 'Это не резервная копия Волейбол Стат.');
      return;
    }
    const ok = await confirmBox(
      'Восстановить из копии?',
      `В копии команд: ${parsed.teams.length}, матчей: ${parsed.matches.length}. Текущие данные на телефоне будут заменены.`,
      'Заменить',
      true
    );
    if (!ok) return;
    data = parsed;
    commit();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset }, el);
});

document.addEventListener('submit', (e) => {
  const fn = forms[e.target.dataset.form];
  if (!fn) return;
  e.preventDefault();
  fn(new FormData(e.target), e.target);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) changes[el.dataset.change]?.(el);
});

// ---------- Start ----------

requestPersistence();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
