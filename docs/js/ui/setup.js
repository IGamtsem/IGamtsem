// Match preparation: new match with roster and rules, and the starting lineup of each set.

import { state, newMatch, saveMatch, saveTeam, demoTeam, openMatch, addEntry, deleteMatch, rosterMap } from '../core.js';
import { POSITIONS, POSITION_SHORT, RULE_PROFILES, SYSTEMS } from '../model/constants.js';
import { setTarget } from '../model/engine.js';
import { exportMatch } from '../model/exchange.js';
import { h, actions, forms, changes, navBar, localDateTimeValue, fmtDateTime, confirmBox, alertBox, shareFile, safeFilePart, ICONS } from './dom.js';
import { go, render, route } from '../router.js';

// ---------- New match ----------

export function viewNewMatch({ query }) {
  const teams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const teamId = query.get('team') ?? teams[0]?.id;
  const team = teams.find((t) => t.id === teamId);
  const p = RULE_PROFILES.fivb2025;

  const teamField = teams.length
    ? `<label class="field"><span>Моя команда</span><select name="team" data-change="new-match-team">${teams
        .map((t) => `<option value="${t.id}" ${t.id === teamId ? 'selected' : ''}>${h(t.name)}</option>`)
        .join('')}</select></label>`
    : `<div class="field note">Команд пока нет. <button type="button" class="link" data-act="setup-demo">Создать демо-команду</button> или добавьте свою на вкладке «Команды».</div>`;

  const roster = team
    ? [...team.players]
        .sort((a, b) => a.number - b.number)
        .map(
          (pl) => `<label class="roster-row">
            <input type="checkbox" name="in_${pl.id}" checked>
            <input class="roster-num" name="num_${pl.id}" type="number" inputmode="numeric" min="0" max="99" value="${pl.number}">
            <span class="roster-name">${h(pl.name)}</span><span class="roster-pos">${h(POSITIONS[pl.position] ?? '')}</span>
          </label>`
        )
        .join('')
    : '';

  return {
    tab: 'matches',
    title: 'Новый матч',
    html:
      navBar({ back: '#/matches', backLabel: 'Матчи', title: 'Новый матч' }) +
      `<main class="content narrow"><form data-form="new-match" autocomplete="off">
        <div class="group form">
          ${teamField}
          <label class="field"><span>Соперник</span><input name="opponent" required placeholder="Название команды"></label>
          <label class="field"><span>Турнир</span><input name="tournament" placeholder="Необязательно"></label>
          <label class="field"><span>Дата и время</span><input name="date" type="datetime-local" value="${localDateTimeValue()}"></label>
        </div>
        <p class="hint">Часовой пояс: ${h(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>

        <h3 class="section-title">Регламент</h3>
        <div class="group form">
          <label class="field"><span>Профиль правил</span><select name="profileKey">${Object.entries(RULE_PROFILES)
            .map(([k, v]) => `<option value="${k}">${h(v.name)}</option>`)
            .join('')}</select></label>
          <label class="field"><span>Матч</span><select name="bestOf"><option value="5">До 3 побед (5 партий)</option><option value="3">До 2 побед (3 партии)</option></select></label>
          <label class="field"><span>Очков в партии</span><input name="points" type="number" inputmode="numeric" min="5" max="50" value="${p.pointsPerSet}"></label>
          <label class="field"><span>В решающей</span><input name="deciding" type="number" inputmode="numeric" min="5" max="50" value="${p.decidingSetPoints}"></label>
          <label class="field"><span>Замен в партии</span><input name="subs" type="number" inputmode="numeric" min="0" max="20" value="${p.subsPerSet}"></label>
          <label class="field check"><span>Либеро может подавать</span><input name="liberoServe" type="checkbox"></label>
        </div>
        <p class="hint">Изменения регламента FIVB для отдельных турниров 2026 не применяются автоматически. Для местной лиги выберите «Пользовательский» и задайте свои значения.</p>

        <h3 class="section-title">Игра и запись</h3>
        <div class="group form">
          <label class="field"><span>Игровая система</span><select name="system">${Object.entries(SYSTEMS)
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join('')}</select></label>
          <label class="field"><span>Режим</span><select name="mode"><option value="quick">Быстрый (живой матч)</option><option value="detailed">Подробный (по видео)</option></select></label>
        </div>

        ${team ? `<h3 class="section-title">Заявка на матч · номер можно изменить</h3><div class="group roster">${roster}</div>` : ''}
        <button class="btn primary wide" type="submit" ${team ? '' : 'disabled'}>Создать матч и расстановку</button>
      </form></main>`,
  };
}

changes['new-match-team'] = (el) => go(`#/new-match?team=${el.value}`);

actions['setup-demo'] = async () => {
  const t = demoTeam();
  await saveTeam(t);
  go(`#/new-match?team=${t.id}`);
};

forms['new-match'] = async (fd) => {
  const team = state.teams.find((t) => t.id === fd.get('team'));
  const opponent = String(fd.get('opponent') ?? '').trim();
  if (!team || !opponent) return;
  const roster = team.players
    .filter((p) => fd.get(`in_${p.id}`))
    .map((p) => ({ playerId: p.id, number: parseInt(fd.get(`num_${p.id}`), 10) || p.number, name: p.name, position: p.position }));
  if (roster.length < 6) {
    alertBox('Мало игроков в заявке', 'Для расстановки нужно не меньше шести игроков.');
    return;
  }
  const nums = roster.map((p) => p.number);
  if (new Set(nums).size !== nums.length && !(await confirmBox('Повторяются номера', 'В заявке есть одинаковые номера. Продолжить?', 'Продолжить'))) return;
  const clamp = (v, d, lo = 5, hi = 50) => Math.min(hi, Math.max(lo, parseInt(v, 10) || d));
  const date = new Date(fd.get('date'));
  const match = newMatch({
    team,
    opponent,
    tournament: String(fd.get('tournament') ?? '').trim(),
    date: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
    profileKey: fd.get('profileKey'),
    profile: {
      bestOf: Number(fd.get('bestOf')) === 3 ? 3 : 5,
      pointsPerSet: clamp(fd.get('points'), 25),
      decidingSetPoints: clamp(fd.get('deciding'), 15),
      subsPerSet: clamp(fd.get('subs'), 6, 0, 20),
      liberoCanServe: Boolean(fd.get('liberoServe')),
    },
    system: fd.get('system'),
    mode: fd.get('mode'),
    roster,
  });
  await saveMatch(match);
  go(`#/lineup/${match.id}`);
};

// ---------- Match hub ----------

export async function viewMatch({ id }) {
  const cur = await openMatch(id);
  if (!cur) return null;
  const { match, built } = cur;
  const sets = built.sets
    .map(
      (s) =>
        `<div class="set-chip ${s.winner === 'us' ? 'won' : s.winner === 'them' ? 'lost' : ''}"><span>Партия ${s.number}</span><b>${s.score.us}:${s.score.them}</b></div>`
    )
    .join('');
  const next =
    built.phase === 'needSetStart' || built.phase === 'setOver'
      ? `<a class="btn primary wide" href="#/lineup/${id}">Расстановка партии ${built.sets.length + 1}</a>`
      : built.phase === 'live'
      ? `<a class="btn primary wide" href="#/live/${id}">Продолжить запись</a>`
      : '';
  const done = built.phase === 'matchOver' ? `<a class="btn wide" href="#/live/${id}">Открыть запись</a>` : '';
  const p = match.profile;
  return {
    tab: 'matches',
    title: `${match.teamName} — ${match.opponent}`,
    html:
      navBar({ back: '#/matches', backLabel: 'Матчи', title: `${match.teamName} — ${match.opponent}` }) +
      `<main class="content narrow">
        <div class="score-card">
          <div class="score-teams"><span>${h(match.teamName)}</span><strong>${built.setsWon.us} : ${built.setsWon.them}</strong><span>${h(match.opponent)}</span></div>
          <div class="set-chips">${sets}</div>
          <div class="score-date">${h(fmtDateTime(match.date))}${match.tournament ? ` · ${h(match.tournament)}` : ''}</div>
          <div class="score-date">${h(p.name)} · до ${Math.floor(p.bestOf / 2) + 1} побед · ${p.pointsPerSet}/${p.decidingSetPoints} · ${SYSTEMS[match.system]} · ${match.mode === 'detailed' ? 'подробный режим' : 'быстрый режим'} · ${h(match.scale)}</div>
        </div>
        ${next}${done}
        <div class="group">
          <a class="row" href="#/feed/${id}">${ICONS.list}<div class="row-main"><div class="row-title">Лента розыгрышей</div><div class="row-sub">Все касания, исправления, поиск</div></div>${ICONS.chevron}</a>
          <a class="row" href="#/reports/${id}/team">${ICONS.chart}<div class="row-main"><div class="row-title">Отчёты</div><div class="row-sub">Команда, игроки, связующий, расстановки, серии</div></div>${ICONS.chevron}</a>
          <a class="row" href="#/roster/${id}">${ICONS.people}<div class="row-main"><div class="row-title">Заявка на матч</div><div class="row-sub">${match.roster.length} игроков</div></div>${ICONS.chevron}</a>
        </div>
        <div class="group">
          <button class="row" data-act="export-json">${ICONS.download}<div class="row-main"><div class="row-title accent">Экспорт матча (JSON)</div><div class="row-sub">Полный журнал, расстановки, шкала и регламент</div></div></button>
        </div>
        ${built.notices.filter((n) => n.kind === 'warning').length ? `<p class="hint warn-text">${ICONS.warn} В журнале есть предупреждения — смотрите ленту.</p>` : ''}
        <button class="btn danger wide" data-act="delete-match">Удалить матч</button>
      </main>`,
  };
}

actions['export-json'] = async () => {
  const cur = state.current;
  const data = exportMatch(cur.match, cur.entries);
  const day = cur.match.date.slice(0, 10);
  await shareFile(`volley_${day}_${safeFilePart(cur.match.opponent)}.json`, JSON.stringify(data, null, 1), 'application/json');
};

actions['delete-match'] = async () => {
  const cur = state.current;
  if (!cur || !(await confirmBox('Удалить матч?', 'Журнал и вся статистика матча будут удалены с устройства.', 'Удалить', true))) return;
  await deleteMatch(cur.match.id);
  go('#/matches');
};

// ---------- Match roster ----------

export async function viewRoster({ id }) {
  const cur = await openMatch(id);
  if (!cur) return null;
  const rows = [...cur.match.roster]
    .sort((a, b) => a.number - b.number)
    .map(
      (p) => `<label class="roster-row"><input class="roster-num" data-change="roster-num" data-id="${p.playerId}" type="number" inputmode="numeric" min="0" max="99" value="${p.number}">
        <span class="roster-name">${h(p.name)}</span><span class="roster-pos">${h(POSITIONS[p.position] ?? '')}</span></label>`
    )
    .join('');
  return {
    tab: 'matches',
    title: 'Заявка',
    html:
      navBar({ back: `#/match/${id}`, backLabel: 'Матч', title: 'Заявка на матч' }) +
      `<main class="content narrow"><div class="group roster">${rows}</div>
       <p class="hint">Номер меняется только в этом матче. Статистика привязана к постоянному ID игрока.</p></main>`,
  };
}

changes['roster-num'] = async (el) => {
  const m = state.current.match;
  const p = m.roster.find((x) => x.playerId === el.dataset.id);
  const n = parseInt(el.value, 10);
  if (!p || Number.isNaN(n)) return;
  p.number = n;
  await saveMatch(m);
};

// ---------- Set lineup ----------

const COURT_ORDER = [4, 3, 2, 5, 6, 1];

export async function viewLineup({ id }) {
  const cur = await openMatch(id);
  if (!cur) return null;
  const { match, built } = cur;
  if (built.phase === 'matchOver') {
    go(`#/match/${id}`);
    return null;
  }
  const setNo = built.phase === 'live' ? built.sets.length : built.sets.length + 1;
  if (built.phase === 'live') {
    go(`#/live/${id}`);
    return null;
  }
  const prev = built.sets[built.sets.length - 1];
  const draft = (state.ui.lineup?.matchId === id && state.ui.lineup?.set === setNo
    ? state.ui.lineup
    : (state.ui.lineup = {
        matchId: id,
        set: setNo,
        slots: prev ? prev.startSlots.slice() : Array(6).fill(''),
        liberos: prev ? prev.liberos.slice() : match.roster.filter((p) => p.position === 'libero').slice(0, 2).map((p) => p.playerId),
        firstServe: prev ? (prev.firstServe === 'us' ? 'them' : 'us') : 'us',
      }));

  const roster = [...match.roster].sort((a, b) => a.number - b.number);
  const map = rosterMap(match);
  const option = (pid, selected) =>
    `<option value="${pid}" ${pid === selected ? 'selected' : ''}>${map.get(pid) ? `${map.get(pid).number} ${h(map.get(pid).name)} · ${POSITION_SHORT[map.get(pid).position] ?? ''}` : '—'}</option>`;
  const cell = (pos) => `<label class="lineup-cell ${[2, 3, 4].includes(pos) ? 'front' : 'back'}">
      <span class="pos-label">${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][pos]}${pos === 1 ? ' · подача' : ''}</span>
      <select data-change="lineup-slot" data-pos="${pos}"><option value="">—</option>${roster.map((p) => option(p.playerId, draft.slots[pos - 1])).join('')}</select>
    </label>`;

  const liberoOptions = (i) =>
    `<select data-change="lineup-libero" data-i="${i}"><option value="">нет</option>${roster
      .map((p) => option(p.playerId, draft.liberos[i]))
      .join('')}</select>`;

  const target = setTarget(match.profile, setNo);
  return {
    title: `Партия ${setNo}`,
    html:
      navBar({ back: `#/match/${id}`, backLabel: 'Матч', title: `Расстановка · партия ${setNo}`, sub: `${match.teamName} — ${match.opponent} · до ${target}` }) +
      `<main class="content narrow">
        <div class="lineup-court">
          <div class="net">Сетка</div>
          ${COURT_ORDER.map(cell).join('')}
        </div>
        <div class="row-buttons">
          <button class="btn small" data-act="lineup-rotate" data-dir="1">${ICONS.replay} Переход вперёд</button>
          <button class="btn small" data-act="lineup-rotate" data-dir="-1">Назад</button>
          <button class="btn small" data-act="lineup-clear">Очистить</button>
        </div>
        <h3 class="section-title">Либеро</h3>
        <div class="group form">
          <label class="field"><span>Либеро 1</span>${liberoOptions(0)}</label>
          <label class="field"><span>Либеро 2</span>${liberoOptions(1)}</label>
        </div>
        <h3 class="section-title">Первая подача</h3>
        ${segmentedServe(draft.firstServe, match)}
        <p class="hint">Позиция I подаёт. Слоты порядка подачи закрепляются за позициями этой расстановки; замена меняет игрока, но не слот.</p>
        <button class="btn primary wide" data-act="lineup-start">Начать партию ${setNo}</button>
      </main>`,
  };
}

function segmentedServe(value, match) {
  return `<div class="segmented big">
    <button class="seg ${value === 'us' ? 'active' : ''}" data-act="lineup-serve" data-value="us">${h(match.teamName)}</button>
    <button class="seg ${value === 'them' ? 'active' : ''}" data-act="lineup-serve" data-value="them">${h(match.opponent)}</button>
  </div>`;
}

changes['lineup-slot'] = (el) => {
  const d = state.ui.lineup;
  const pos = Number(el.dataset.pos);
  const pid = el.value;
  const other = d.slots.indexOf(pid);
  if (pid && other !== -1 && other !== pos - 1) d.slots[other] = d.slots[pos - 1];
  d.slots[pos - 1] = pid;
  render();
};

changes['lineup-libero'] = (el) => {
  state.ui.lineup.liberos[Number(el.dataset.i)] = el.value;
};

actions['lineup-serve'] = ({ value }) => {
  state.ui.lineup.firstServe = value;
  render();
};

actions['lineup-rotate'] = ({ dir }) => {
  const s = state.ui.lineup.slots;
  // Moving forward one rotation: position 2 → 1, 1 → 6, …
  state.ui.lineup.slots = Number(dir) > 0 ? [...s.slice(1), s[0]] : [s[5], ...s.slice(0, 5)];
  render();
};

actions['lineup-clear'] = () => {
  state.ui.lineup.slots = Array(6).fill('');
  render();
};

actions['lineup-start'] = async () => {
  const d = state.ui.lineup;
  const { match } = state.current;
  const map = rosterMap(match);
  if (d.slots.some((x) => !x) || new Set(d.slots).size !== 6) {
    alertBox('Расстановка не заполнена', 'Нужны шесть разных игроков во всех позициях.');
    return;
  }
  const liberos = [...new Set(d.liberos.filter(Boolean))];
  if (liberos.some((l) => d.slots.includes(l))) {
    alertBox('Либеро в стартовой шестёрке', 'Либеро не может стоять в стартовой расстановке.');
    return;
  }
  const setters = d.slots.filter((pid) => map.get(pid)?.position === 'setter').length;
  const needed = match.system === '5-1' ? 1 : 2;
  if (setters !== needed) {
    const ok = await confirmBox(
      'Связующие',
      `Для системы ${SYSTEMS[match.system]} ожидается связующих: ${needed}, в расстановке: ${setters}. Без опорного связующего метки P1–P6 не строятся. Продолжить?`,
      'Продолжить'
    );
    if (!ok) return;
  }
  await addEntry('setStart', { set: d.set, slots: d.slots.slice(), liberos, firstServe: d.firstServe });
  state.ui.lineup = null;
  state.ui.live = null;
  go(`#/live/${match.id}`);
};
