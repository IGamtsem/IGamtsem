// Matches list, teams and rosters, settings and backups.

import { state, saveTeam, deleteTeam, demoTeam, uid, saveSettings, importMatch, DEFAULT_SETTINGS } from '../core.js';
import * as db from '../db.js';
import { POSITIONS } from '../model/constants.js';
import { parseMatchExport } from '../model/exchange.js';
import {
  h, actions, forms, changes, ICONS, navBar, largeHeader, emptyState, fmtDate, confirmBox, alertBox, askText,
  openSheet, closeSheet, sheetBar, shareFile, toast,
} from './dom.js';
import { go, render, route } from '../router.js';

// ---------- Matches ----------

function matchRow(m) {
  const s = m.summary;
  const sets = s ? `${s.setsWon.us}:${s.setsWon.them}` : '0:0';
  const sub = [fmtDate(m.date), m.tournament].filter(Boolean).map(h).join(' · ');
  const live =
    m.status === 'finished' || !s || !s.set
      ? ''
      : `<div class="live-tag">Партия ${s.set} · ${s.score.us}:${s.score.them}</div>`;
  const setScores = s?.sets?.length ? `<div class="row-sub mono">${s.sets.map((x) => `${x.us}:${x.them}`).join('  ')}</div>` : '';
  return `<a class="row" href="#/match/${m.id}">
    <div class="row-main"><div class="row-title">${h(m.teamName)} — ${h(m.opponent)}</div><div class="row-sub">${sub}</div>${setScores}</div>
    <div class="row-end"><div class="sets-score">${sets}</div>${live}</div>${ICONS.chevron}</a>`;
}

export function viewMatches() {
  const list = [...state.matches].sort((a, b) => new Date(b.date) - new Date(a.date));
  const actionsHtml = `<label class="icon-btn" title="Импорт матча из JSON">${ICONS.upload}<input type="file" accept="application/json,.json" data-change="import-match" hidden></label>
    <a class="icon-btn" href="#/new-match" aria-label="Новый матч">${ICONS.plus}</a>`;
  if (!list.length) {
    return {
      tab: 'matches',
      title: 'Матчи',
      html:
        largeHeader('Матчи', actionsHtml) +
        emptyState(
          'Нет матчей',
          'Создайте команду с заявкой, затем начните матч: стартовая расстановка, подача, и дальше запись по розыгрышам.',
          '<a class="btn primary" href="#/new-match">Новый матч</a>'
        ),
    };
  }
  const section = (title, items) =>
    items.length ? `<h3 class="section-title">${title}</h3><div class="group">${items.map(matchRow).join('')}</div>` : '';
  return {
    tab: 'matches',
    title: 'Матчи',
    html:
      largeHeader('Матчи', actionsHtml) +
      `<main class="content">${section('Идут', list.filter((m) => m.status !== 'finished'))}${section(
        'Завершены',
        list.filter((m) => m.status === 'finished')
      )}</main>`,
  };
}

changes['import-match'] = async (el) => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = parseMatchExport(await file.text());
  } catch (e) {
    alertBox('Не удалось импортировать', e.message);
    return;
  }
  const exists = state.matches.some((m) => m.id === parsed.match.id);
  if (exists && !(await confirmBox('Матч уже есть', 'Заменить его версией из файла? Текущий журнал этого матча будет перезаписан.', 'Заменить', true))) return;
  await importMatch(parsed.match, parsed.entries);
  toast('Матч импортирован');
  go(`#/match/${parsed.match.id}`);
};

// ---------- Teams ----------

export function viewTeams() {
  const teams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const add = `<button class="icon-btn" data-act="add-team" aria-label="Новая команда">${ICONS.plus}</button>`;
  const list = teams.length
    ? `<div class="group">${teams
        .map(
          (t) =>
            `<a class="row" href="#/team/${t.id}"><div class="row-main"><div class="row-title">${h(t.name)}</div><div class="row-sub">Игроков: ${t.players.length}</div></div>${ICONS.chevron}</a>`
        )
        .join('')}</div>`
    : emptyState(
        'Нет команд',
        'Добавьте команду и игроков. Номер в заявке можно поменять для каждого матча отдельно.',
        '<button class="btn primary" data-act="add-team">Создать команду</button><button class="btn" data-act="demo-team">Демо-команда</button>'
      );
  return { tab: 'teams', title: 'Команды', html: largeHeader('Команды', add) + `<main class="content">${list}</main>` };
}

actions['add-team'] = async () => {
  const name = (await askText('Новая команда', 'Название'))?.trim();
  if (!name) return;
  const team = { id: uid(), name, createdAt: Date.now(), players: [] };
  await saveTeam(team);
  go(`#/team/${team.id}`);
};

actions['demo-team'] = async () => {
  await saveTeam(demoTeam());
  render();
};

const byNumber = (a, b) => a.number - b.number || a.name.localeCompare(b.name, 'ru');

export function viewTeam({ id }) {
  const team = state.teams.find((t) => t.id === id);
  if (!team) return null;
  const rows = [...team.players]
    .sort(byNumber)
    .map(
      (p) => `<button class="row" data-act="edit-player" data-id="${p.id}">
      <div class="num-badge">${p.number}</div><div class="row-main"><div class="row-title">${h(p.name)}</div></div>
      <div class="row-sub">${h(POSITIONS[p.position] ?? '')}</div></button>`
    )
    .join('');
  return {
    tab: 'teams',
    title: team.name,
    html:
      navBar({ back: '#/teams', backLabel: 'Команды', title: team.name }) +
      `<main class="content narrow">
        <h3 class="section-title">Название</h3>
        <div class="group form"><label class="field"><input data-change="team-name" value="${h(team.name)}" placeholder="Название команды"></label></div>
        <h3 class="section-title">Игроки</h3>
        <div class="group">${rows}
          <button class="row" data-act="add-player"><div class="row-main"><div class="row-title accent">+ Добавить игрока</div></div></button>
          <button class="row" data-act="import-roster"><div class="row-main"><div class="row-title accent">Вставить список (CSV)</div></div></button>
        </div>
        <p class="hint">ID игрока постоянный: статистика сохраняется при смене номера. Номер здесь — по умолчанию для новых заявок.</p>
        <button class="btn danger wide" data-act="delete-team">Удалить команду</button>
      </main>`,
  };
}

changes['team-name'] = async (el) => {
  const team = state.teams.find((t) => t.id === route().id);
  const name = el.value.trim();
  if (!team || !name) return;
  team.name = name;
  await saveTeam(team);
  render();
};

function playerSheet(team, player) {
  const next = team.players.reduce((m, p) => Math.max(m, p.number), 0) + 1;
  const options = Object.entries(POSITIONS)
    .map(([k, v]) => `<option value="${k}" ${(player?.position ?? 'outside') === k ? 'selected' : ''}>${v}</option>`)
    .join('');
  openSheet(`<form data-form="player" autocomplete="off">
    ${sheetBar(player ? 'Игрок' : 'Новый игрок', { done: 'Готово' })}
    <input type="hidden" name="teamId" value="${team.id}"><input type="hidden" name="playerId" value="${player?.id ?? ''}">
    <div class="group form">
      <label class="field"><span>Имя</span><input name="name" required value="${h(player?.name ?? '')}" placeholder="Фамилия и имя" autocapitalize="words"></label>
      <label class="field"><span>Номер</span><input name="number" type="number" inputmode="numeric" min="0" max="99" required value="${player?.number ?? next}"></label>
      <label class="field"><span>Амплуа</span><select name="position">${options}</select></label>
    </div>
    ${player ? '<button type="button" class="btn danger wide" data-act="delete-player">Удалить игрока</button>' : ''}
  </form>`);
  if (!player) document.querySelector('.sheet input[name="name"]')?.focus();
}

actions['add-player'] = () => {
  const team = state.teams.find((t) => t.id === route().id);
  if (team) playerSheet(team, null);
};

actions['edit-player'] = ({ id }) => {
  const team = state.teams.find((t) => t.id === route().id);
  const p = team?.players.find((x) => x.id === id);
  if (p) playerSheet(team, p);
};

forms.player = async (fd) => {
  const team = state.teams.find((t) => t.id === fd.get('teamId'));
  if (!team) return;
  const name = String(fd.get('name') ?? '').trim();
  const number = parseInt(fd.get('number'), 10);
  if (!name || Number.isNaN(number)) return;
  const id = fd.get('playerId');
  const clash = team.players.find((p) => p.number === number && p.id !== id);
  if (clash && !(await confirmBox(`Номер ${number} уже у игрока ${clash.name}`, 'Сохранить всё равно?', 'Сохранить'))) return;
  const fields = { name, number, position: String(fd.get('position')) };
  const existing = team.players.find((p) => p.id === id);
  if (existing) Object.assign(existing, fields);
  else team.players.push({ id: uid(), ...fields });
  await saveTeam(team);
  closeSheet();
  render();
};

actions['delete-player'] = async () => {
  const form = document.querySelector('.sheet form');
  const team = state.teams.find((t) => t.id === form.teamId.value);
  const p = team?.players.find((x) => x.id === form.playerId.value);
  if (!p || !(await confirmBox(`Удалить ${p.name}?`, 'В сыгранных матчах он останется в заявке и статистике.', 'Удалить', true))) return;
  team.players = team.players.filter((x) => x !== p);
  await saveTeam(team);
  closeSheet();
  render();
};

actions['delete-team'] = async () => {
  const team = state.teams.find((t) => t.id === route().id);
  if (!team || !(await confirmBox(`Удалить «${team.name}»?`, 'Матчи и их статистика останутся.', 'Удалить', true))) return;
  await deleteTeam(team.id);
  go('#/teams');
};

const POSITION_ALIASES = {
  св: 'setter', связ: 'setter', связующий: 'setter', s: 'setter', setter: 'setter',
  д: 'outside', ди: 'outside', доигровщик: 'outside', oh: 'outside', outside: 'outside',
  дг: 'opposite', диаг: 'opposite', диагональный: 'opposite', o: 'opposite', opp: 'opposite', opposite: 'opposite',
  ц: 'middle', центр: 'middle', центральный: 'middle', m: 'middle', mb: 'middle', middle: 'middle',
  л: 'libero', либеро: 'libero', l: 'libero', libero: 'libero',
};

/** Parses "number;name;position" lines (comma or tab also accepted). */
export function parseRosterCsv(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[;\t,]/).map((x) => x.trim());
    const number = parseInt(parts[0], 10);
    if (Number.isNaN(number) || !parts[1]) continue;
    const pos = POSITION_ALIASES[(parts[2] ?? '').toLowerCase()] ?? 'universal';
    out.push({ number, name: parts[1], position: pos });
  }
  return out;
}

actions['import-roster'] = () => {
  openSheet(`<form data-form="import-roster">${sheetBar('Список игроков', { done: 'Добавить' })}
    <p class="hint">По одному игроку в строке: номер; фамилия имя; амплуа. Амплуа: Св, Д, Дг, Ц, Л (можно полностью).</p>
    <textarea name="csv" rows="10" class="textarea" placeholder="1;Иванов Иван;Св&#10;4;Петров Пётр;Д"></textarea>
  </form>`);
};

forms['import-roster'] = async (fd) => {
  const team = state.teams.find((t) => t.id === route().id);
  if (!team) return;
  const list = parseRosterCsv(String(fd.get('csv') ?? ''));
  if (!list.length) {
    alertBox('Ничего не найдено', 'Проверьте формат: номер; имя; амплуа');
    return;
  }
  for (const p of list) {
    const same = team.players.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
    if (same) Object.assign(same, p);
    else team.players.push({ id: uid(), ...p });
  }
  await saveTeam(team);
  closeSheet();
  toast(`Добавлено игроков: ${list.length}`);
  render();
};

// ---------- Settings ----------

const KEY_LABELS = {
  S: 'Подача', R: 'Приём', E: 'Передача', A: 'Атака', B: 'Блок', D: 'Защита', C: 'Страховка', F: 'Свободный мяч',
  opponent: 'Выбрать соперника', pointUs: 'Очко нам', pointThem: 'Очко соперника',
};

export function keyName(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Equal', '=').replace('Minus', '−').replace('Backquote', '`');
}

export function viewSettings() {
  const s = state.settings;
  const keys = Object.entries(KEY_LABELS)
    .map(
      ([k, label]) =>
        `<label class="field"><span>${label}</span><input class="key-input" readonly data-key="${k}" value="${h(keyName(s.keys[k]))}"></label>`
    )
    .join('');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return {
    tab: 'settings',
    title: 'Настройки',
    html:
      largeHeader('Настройки') +
      `<main class="content narrow">
        <h3 class="section-title">Записи</h3>
        <div class="group form">
          <label class="field"><span>Автор записей</span><input data-change="setting" data-name="author" value="${h(s.author)}"></label>
          <label class="field"><span>Порог «мало наблюдений»</span><input data-change="setting" data-name="smallSample" type="number" min="1" max="200" value="${s.smallSample}"></label>
        </div>
        <p class="hint">Автор и время сохраняются в каждом исправлении. Проценты с меньшим числом наблюдений отмечаются звёздочкой.</p>

        <h3 class="section-title">Горячие клавиши (ноутбук)</h3>
        <div class="group form">${keys}</div>
        <p class="hint">Нажмите на поле и затем нужную клавишу. На площадке: номер игрока цифрами (Enter — сразу), клавиша действия, затем цифра оценки 1–7 по порядку кнопок. Esc — сброс выбора, Ctrl+Z / Ctrl+Shift+Z — отмена и повтор.</p>
        <button class="btn wide" data-act="reset-keys">Вернуть клавиши по умолчанию</button>

        <h3 class="section-title">Резервная копия</h3>
        <div class="group">
          <button class="row" data-act="backup-all"><div class="row-main"><div class="row-title accent">Сохранить всё в файл</div><div class="row-sub">Команды, матчи и журналы в одном JSON</div></div></button>
          <label class="row"><div class="row-main"><div class="row-title accent">Восстановить из файла</div><div class="row-sub">Добавит недостающее и заменит совпадающие матчи</div></div><input type="file" accept="application/json,.json" data-change="restore-all" hidden></label>
        </div>
        <p class="hint">Данные хранятся только на этом устройстве (IndexedDB). Сервера синхронизации в этой версии нет — сохраняйте копию после каждого матча.</p>
        ${
          standalone
            ? ''
            : `<h3 class="section-title">Установка</h3><div class="group"><div class="row"><div class="row-main row-sub">В Safari: «Поделиться» → «На экран Домой». В Chrome: меню → «Установить приложение». После установки работает без интернета.</div></div></div>`
        }
      </main>`,
  };
}

changes.setting = async (el) => {
  const s = { ...state.settings };
  const name = el.dataset.name;
  if (name === 'smallSample') s.smallSample = Math.max(1, parseInt(el.value, 10) || 20);
  else s[name] = el.value.trim() || DEFAULT_SETTINGS[name];
  await saveSettings(s);
};

actions['reset-keys'] = async () => {
  await saveSettings({ ...state.settings, keys: { ...DEFAULT_SETTINGS.keys } });
  render();
};

document.addEventListener('keydown', async (e) => {
  const input = e.target.closest?.('.key-input');
  if (!input) return;
  e.preventDefault();
  if (e.code === 'Tab' || e.code === 'Escape') return;
  const keys = { ...state.settings.keys, [input.dataset.key]: e.code };
  await saveSettings({ ...state.settings, keys });
  input.value = keyName(e.code);
  input.blur();
});

actions['backup-all'] = async () => {
  const entries = await db.getAll('entries');
  const data = {
    format: 'volleystats-backup',
    exportedAt: new Date().toISOString(),
    teams: state.teams,
    matches: state.matches,
    entries,
  };
  const day = new Date().toISOString().slice(0, 10);
  await shareFile(`volleystats-backup-${day}.json`, JSON.stringify(data), 'application/json');
};

changes['restore-all'] = async (el) => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (data?.format !== 'volleystats-backup' || !Array.isArray(data.matches)) {
    alertBox('Не тот файл', 'Это не резервная копия Волейбол Стат.');
    return;
  }
  if (!(await confirmBox('Восстановить?', `Команд: ${data.teams.length}, матчей: ${data.matches.length}.`, 'Восстановить'))) return;
  for (const t of data.teams) await saveTeam(t);
  for (const m of data.matches) {
    await importMatch(m, data.entries.filter((e) => e.matchId === m.id));
  }
  toast('Данные восстановлены');
  go('#/matches');
};
