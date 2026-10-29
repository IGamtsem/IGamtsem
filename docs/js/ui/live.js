// Live input (spec §5): player → action → grade, rally end in one tap, undo/redo always visible,
// substitutions, libero, timeouts, sanctions, replay. Keyboard shortcuts for laptops.

import { state, openMatch, addEntry, setFields, undo, redo, rosterMap, playerLabel, saveMatch } from '../core.js';
import { SKILLS, SKILL_ORDER, GRADES, gradeInfo, POSITION_SHORT, ATTACK_TYPES, DIRECTIONS, SERVE_TYPES, SYSTEM, DIFFICULTY, REASONS, other, isFront } from '../model/constants.js';
import { positionOfSlot, setTarget } from '../model/engine.js';
import { h, actions, ICONS, confirmBox, alertBox, askText, openSheet, closeSheet, sheetBar, isDialogOpen, toast, score } from './dom.js';
import { go, render, route } from '../router.js';
import { keyName } from './home.js';

const EXTRA_SKILLS = new Set(['A', 'E', 'B', 'S', 'D']);

function live() {
  const id = state.current?.match.id;
  if (!state.ui.live || state.ui.live.matchId !== id) {
    state.ui.live = { matchId: id, player: null, skill: null, extrasFor: null, reasonFor: null, flipped: false, buf: '', keyMode: 'idle' };
    applySuggestion();
  }
  return state.ui.live;
}

// ---------- Suggestion of the expected next action ----------

export function suggest(built) {
  const cur = built.current;
  if (cur.phase !== 'live') return {};
  const snap = cur.snap;
  const touches = cur.openRally?.touches ?? [];
  if (!touches.length) {
    return cur.serving === 'us' ? { player: snap.court[0].player, skill: 'S', opp: 'R' } : { skill: 'R', opp: 'S' };
  }
  const last = touches[touches.length - 1];
  if (last.team === 'us') {
    switch (last.skill) {
      case 'S':
        return { skill: 'D', opp: 'R' };
      case 'R':
      case 'D':
      case 'C':
      case 'F': {
        const setter = snap.setter && snap.onCourt.includes(snap.setter) && snap.setter !== last.player ? snap.setter : null;
        return { player: setter, skill: 'E', opp: 'B' };
      }
      case 'E':
        return { player: last.target ?? null, skill: 'A', opp: 'B' };
      case 'A':
        return { skill: 'C', opp: 'D' };
      default:
        return { skill: 'D', opp: 'A' };
    }
  }
  switch (last.skill) {
    case 'S':
      return { skill: 'R', opp: 'R' };
    case 'B':
      return { skill: 'C', opp: 'D' };
    case 'A':
      return { skill: 'D', opp: 'A' };
    default:
      return { skill: 'B', opp: 'A' };
  }
}

function applySuggestion() {
  const L = state.ui.live;
  const built = state.current?.built;
  if (!L || !built) return;
  const s = suggest(built);
  L.suggestion = s;
  L.player = isQuick(state.current.match, L) ? null : s.player ?? null;
  L.skill = s.skill ?? null;
  L.keyMode = 'idle';
  L.buf = '';
}

// ---------- View ----------

export async function viewLive({ id }) {
  const cur = await openMatch(id);
  if (!cur) return null;
  const { match, built } = cur;
  const L = live();
  const c = built.current;
  const map = rosterMap(match);

  if (!c.set) {
    go(`#/lineup/${id}`);
    return null;
  }

  const set = c.set;
  const snap = c.snap;
  const top = topBar(match, built, set);
  let body;

  if (built.phase === 'setOver' || built.phase === 'matchOver') {
    const over = built.phase === 'matchOver';
    body = `<div class="phase-card">
      <h2>${over ? 'Матч окончен' : `Партия ${set.number} окончена`}</h2>
      <div class="phase-score">${score(set.score)}</div>
      <p>${over ? `Счёт по партиям ${built.setsWon.us}:${built.setsWon.them}` : 'Задайте стартовую расстановку следующей партии.'}</p>
      <div class="row-buttons center">
        ${over ? '' : `<a class="btn primary" href="#/lineup/${id}">Расстановка партии ${set.number + 1}</a>`}
        <a class="btn" href="#/feed/${id}">Лента</a><a class="btn" href="#/reports/${id}/team">Отчёты</a>
      </div>
      <p class="hint">Если партия закончилась по ошибке ввода, нажмите «Отменить» вверху.</p>
    </div>`;
  } else {
    const quick = isQuick(match, L);
    body = `<div class="live-grid">
      <section class="live-court">${courtHtml(match, built, L, map)}${quick ? '' : benchHtml(match, built, L, map)}</section>
      <section class="live-pad">${quick ? quickPadHtml(match, built, L, map) : padHtml(match, built, L, map)}</section>
    </div>`;
  }

  return {
    title: `Партия ${set.number}`,
    html: `<div class="live-top">${top}</div><main class="content wide live">${body}${rallyStrip(built, map)}${toolsHtml(match, built, L)}</main>`,
  };
}

function topBar(match, built, set) {
  const c = built.current;
  const serveDot = (team) => (c.serving === team && built.phase === 'live' ? '<span class="serve-dot" title="Подаёт"></span>' : '');
  const snap = c.snap;
  const target = setTarget(match.profile, set.number);
  return `<header class="live-header">
    <a class="nav-btn back" href="#/match/${match.id}">${ICONS.back}<span>Матч</span></a>
    <div class="scoreboard">
      <div class="sb-team"><div class="sb-name">${serveDot('us')}${h(match.teamName)}</div><div class="sb-sets">Партии ${built.setsWon.us}</div></div>
      <div class="sb-score"><span>${c.score.us}</span><i>:</i><span>${c.score.them}</span></div>
      <div class="sb-team right"><div class="sb-name">${h(match.opponent)}${serveDot('them')}</div><div class="sb-sets">Партии ${built.setsWon.them}</div></div>
    </div>
    <div class="live-actions">
      <button class="icon-btn" data-act="live-undo" title="Отменить (Ctrl+Z)" ${state.current.entries.some((e) => !e.deleted) ? '' : 'disabled'}>${ICONS.undo}</button>
      <button class="icon-btn" data-act="live-redo" title="Повторить (Ctrl+Shift+Z)" ${state.redo.length ? '' : 'disabled'}>${ICONS.redo}</button>
    </div>
  </header>
  <div class="live-meta">
    <span>Партия ${set.number} · до ${target}</span>
    ${snap.pLabel ? `<span class="badge">${snap.pLabel}</span>` : `<span class="badge muted">сдвиг ${snap.shift}</span>`}
    <span>Замены ${set.subs}/${match.profile.subsPerSet}</span>
    <span>Тайм-ауты ${set.timeouts.us}:${set.timeouts.them}</span>
    <span class="meta-sets">${built.sets.filter((s) => s.ended).map((s) => score(s.score)).join(' · ')}</span>
  </div>`;
}

function playerTile(pid, map, L, extra = '', cls = '') {
  const p = map.get(pid);
  const sel = L.player === pid ? 'selected' : '';
  const sug = !L.player && L.suggestion?.player === pid ? 'suggested' : '';
  return `<button class="ptile ${cls} ${sel} ${sug}" data-act="live-player" data-id="${pid}">
    <span class="num">${p?.number ?? '?'}</span><span class="name">${h(p?.name ?? 'Игрок')}</span>${extra}</button>`;
}

function courtHtml(match, built, L, map) {
  const c = built.current;
  const snap = c.snap;
  const byPos = new Map(snap.court.map((x) => [x.pos, x]));
  const rowsNormal = [[4, 3, 2], [5, 6, 1]];
  const rows = L.flipped ? [[1, 6, 5], [2, 3, 4]] : rowsNormal;
  const cell = (pos) => {
    const x = byPos.get(pos);
    const tags = [
      `<span class="pos">${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][pos]}</span>`,
      x.libero ? '<span class="tag lib">Л</span>' : '',
      snap.setter === x.player ? '<span class="tag set">Св</span>' : '',
      pos === 1 && c.serving === 'us' ? '<span class="tag srv">подача</span>' : '',
    ].join('');
    return playerTile(x.player, map, L, `<span class="tags">${tags}</span>`, `${isFront(pos) ? 'front' : 'back'} ${x.libero ? 'is-libero' : ''}`);
  };
  const net = '<div class="court-net">сетка</div>';
  const rowHtml = (r) => `<div class="court-row">${r.map(cell).join('')}</div>`;
  return `<div class="court ${L.flipped ? 'flipped' : ''}">${L.flipped ? rowHtml(rows[0]) + rowHtml(rows[1]) + net : net + rowHtml(rows[0]) + rowHtml(rows[1])}</div>`;
}

function benchHtml(match, built, L, map) {
  const set = built.current.set;
  const onCourt = new Set(built.current.snap.onCourt);
  const liberosOff = set.liberos.filter((id) => !onCourt.has(id));
  const bench = match.roster
    .filter((p) => !onCourt.has(p.playerId) && !set.liberos.includes(p.playerId))
    .sort((a, b) => a.number - b.number);
  return `<div class="bench">
    <button class="ptile opp ${L.player === 'opp' ? 'selected' : ''}" data-act="live-player" data-id="opp"><span class="num">С</span><span class="name">${h(match.opponent)}</span></button>
    <button class="ptile unk ${L.player === 'unk' ? 'selected' : ''}" data-act="live-player" data-id="unk" title="Наш игрок не определён"><span class="num">?</span><span class="name">Не определён</span></button>
    ${liberosOff.map((id) => playerTile(id, map, L, '<span class="tags"><span class="tag lib">Л</span></span>', 'mini')).join('')}
    ${bench.map((p) => playerTile(p.playerId, map, L, '', 'mini bench-p')).join('')}
  </div>`;
}

function gradeButtons(team, skill, enabled) {
  const grades = Object.keys(GRADES[skill]);
  return grades
    .map((g, i) => {
      const info = gradeInfo(skill, g);
      let tone = info.tone;
      if (team === 'them') tone = tone === 'good' ? 'opp-good' : tone === 'bad' ? 'opp-bad' : tone;
      return `<button class="grade ${tone}" data-act="live-grade" data-grade="${g}" ${enabled ? '' : 'disabled'}>
        <span class="g-sym">${h(info.symbol)}</span><span class="g-label">${h(info.label)}</span><kbd>${i + 1}</kbd></button>`;
    })
    .concat(
      `<button class="grade neutral" data-act="live-grade" data-grade="?" ${enabled ? '' : 'disabled'}><span class="g-sym">?</span><span class="g-label">Не оценено</span></button>`
    )
    .join('');
}

function padHtml(match, built, L, map) {
  const keys = state.settings.keys;
  const team = L.player === 'opp' ? 'them' : 'us';
  const sug = L.suggestion ?? {};
  const suggestedSkill = team === 'them' ? sug.opp : sug.skill;
  const who =
    L.player === 'opp'
      ? `Соперник`
      : L.player === 'unk'
      ? 'Наш игрок (не определён)'
      : L.player
      ? playerLabel(L.player, map)
      : 'Выберите игрока';

  const skills = SKILL_ORDER.map(
    (s) =>
      `<button class="skill ${L.skill === s ? 'active' : ''} ${suggestedSkill === s ? 'suggested' : ''}" data-act="live-skill" data-skill="${s}" title="${SKILLS[s].title}">
        <b>${s}</b><span>${SKILLS[s].short}</span><kbd>${keyName(keys[s])}</kbd></button>`
  ).join('');

  const canGrade = Boolean(L.player && L.skill);
  const kb = keyStatus(L, map);

  const back = match.mode !== 'detailed' ? '<button class="link q-back" data-act="q-full" data-value="0">← Быстрый ввод</button>' : '';
  return `${back}<div class="pad-who ${L.player ? '' : 'muted'}">${h(who)}${L.skill ? ` · <b>${SKILLS[L.skill].title}</b>` : ''}</div>
    <div class="skills">${skills}</div>
    <div class="grades">${L.skill ? gradeButtons(team, L.skill, canGrade) : '<p class="hint">Выберите действие</p>'}</div>
    ${extrasHtml(built, L, map)}
    ${reasonHtml(built, L)}
    <div class="points">
      <button class="btn point us" data-act="live-point" data-winner="us">Очко ${h(match.teamName)}<kbd>${keyName(keys.pointUs)}</kbd></button>
      <button class="btn point them" data-act="live-point" data-winner="them">Очко ${h(match.opponent)}<kbd>${keyName(keys.pointThem)}</kbd></button>
    </div>
    ${kb ? `<div class="kb-status">${kb}</div>` : ''}
    ${noticesHtml(built, map)}`;
}

function keyStatus(L, map) {
  if (L.buf) return `Клавиатура: номер <b>${h(L.buf)}</b> → клавиша действия`;
  if (L.keyMode === 'grade') return 'Клавиатура: цифра оценки 1–7, Esc — сброс';
  return '';
}

function lastEntry(id) {
  return state.current.entries.find((e) => e.id === id && !e.deleted);
}

function chips(list, current, act, extraData = '') {
  return list
    .map(
      ([value, label]) =>
        `<button class="chip ${current === value ? 'active' : ''}" data-act="${act}" data-value="${h(value)}" ${extraData}>${h(label)}</button>`
    )
    .join('');
}

function extrasHtml(built, L, map) {
  const e = L.extrasFor && lastEntry(L.extrasFor);
  if (!e || e.type !== 'touch' || !EXTRA_SKILLS.has(e.skill)) return '';
  const snap = built.current.snap;
  let inner = '';
  if (e.skill === 'A') {
    inner = `<div class="extra-row"><span>Тип</span>${chips(Object.entries(ATTACK_TYPES), e.attackType, 'live-extra', 'data-field="attackType"')}</div>
      <div class="extra-row"><span>Направление</span>${chips(Object.entries(DIRECTIONS), e.direction, 'live-extra', 'data-field="direction"')}</div>`;
  } else if (e.skill === 'E') {
    const targets = snap.onCourt.filter((pid) => pid !== e.player && !snap.court.find((x) => x.player === pid)?.libero);
    inner = `<div class="extra-row"><span>Система</span>${chips(Object.entries(SYSTEM), e.system, 'live-extra', 'data-field="system"')}</div>
      <div class="extra-row"><span>Кому</span>${chips(targets.map((pid) => [pid, `#${map.get(pid)?.number ?? '?'}`]), e.target, 'live-extra', 'data-field="target"')}
      ${chips(Object.entries(DIRECTIONS).slice(0, 5), e.direction, 'live-extra', 'data-field="direction"')}</div>`;
  } else if (e.skill === 'B' && e.team === 'us') {
    const front = snap.court.filter((x) => isFront(x.pos) && x.player !== e.player).map((x) => x.player);
    const withSet = new Set(e.with ?? []);
    inner = `<div class="extra-row"><span>Участники блока</span>${front
      .map((pid) => `<button class="chip ${withSet.has(pid) ? 'active' : ''}" data-act="live-block-with" data-id="${pid}">#${map.get(pid)?.number ?? '?'} ${h(map.get(pid)?.name ?? '')}</button>`)
      .join('')}</div>`;
  } else if (e.skill === 'S') {
    inner = `<div class="extra-row"><span>Подача</span>${chips(Object.entries(SERVE_TYPES), e.serveType, 'live-extra', 'data-field="serveType"')}</div>`;
  } else if (e.skill === 'D') {
    inner = `<div class="extra-row"><span>Сложность</span>${chips(Object.entries(DIFFICULTY), e.difficulty, 'live-extra', 'data-field="difficulty"')}</div>`;
  }
  if (!inner) return '';
  return `<div class="extras"><div class="extras-title">Уточнить: ${SKILLS[e.skill].title.toLowerCase()} ${e.player ? playerLabel(e.player, map) : e.team === 'them' ? 'соперника' : ''} <span class="muted">(необязательно)</span>
    <button class="link" data-act="live-extras-close">скрыть</button></div>${inner}</div>`;
}

function reasonHtml(built, L) {
  const e = L.reasonFor && lastEntry(L.reasonFor);
  if (!e || e.type !== 'point') return '';
  const rally = built.rallies.find((r) => r.endEntryId === e.id);
  const options = Object.entries(REASONS).filter(([k]) => k !== 'serveError' || rally?.receiving === e.winner);
  return `<div class="extras"><div class="extras-title">Причина очка (${e.winner === 'us' ? 'нам' : 'сопернику'})</div>
    <div class="extra-row">${chips(options, e.reason, 'live-reason')}</div></div>`;
}

function noticesHtml(built, map) {
  const c = built.current;
  const set = c.set;
  const out = [];
  const rally = c.openRally;
  for (const w of rally?.warnings ?? []) out.push(`<div class="notice warn">${ICONS.warn} ${h(w)}</div>`);
  const last = built.notices[built.notices.length - 1];
  if (last?.kind === 'liberoAutoOut' && last.set === set.number && !set.libero && set.liberos.length) {
    const back = c.snap.court.filter((x) => !isFront(x.pos) && !(x.pos === 1 && c.serving === 'us' && !state.current.match.profile.liberoCanServe));
    out.push(`<div class="notice">Либеро ушёл с передней линии. Ввести либеро вместо:
      ${back.map((x) => `<button class="chip" data-act="live-libero-quick" data-id="${x.player}" data-slot="${x.slot}">#${map.get(x.player)?.number ?? '?'}</button>`).join('')}</div>`);
  }
  return out.join('');
}

function rallyStrip(built, map) {
  if (built.phase !== 'live' && !built.current.lastRally) return '';
  const c = built.current;
  const open = c.openRally;
  const touchChip = (t) => {
    const g = gradeInfo(t.skill, t.grade);
    const who = t.team === 'them' ? 'С' : t.player ? map.get(t.player)?.number ?? '?' : '?';
    return `<span class="tchip ${t.team} ${g.tone}">${who} ${t.skill}${h(g.symbol)}</span>`;
  };
  const current = open
    ? `<div class="rally-now"><span class="muted">Розыгрыш:</span> ${open.touches.map(touchChip).join('')}</div>`
    : `<div class="rally-now muted">${c.serving === 'us' ? 'Наша подача' : 'Подаёт соперник'} · новый розыгрыш</div>`;
  const last = c.lastRally;
  const lastHtml = last
    ? `<div class="rally-last">${
        last.replayed
          ? 'Последний розыгрыш переигран'
          : `Последний: ${last.winner === 'us' ? '+1 нам' : '+1 сопернику'} · ${REASONS[last.reason] ?? ''} · ${score(last.scoreAfter)} ${last.touches
              .map(touchChip)
              .join('')}`
      }${last.complete || last.replayed ? '' : ' <span class="flag">неполный</span>'}</div>`
    : '';
  return `<div class="rally-strip">${built.phase === 'live' ? current : ''}${lastHtml}</div>`;
}

function toolsHtml(match, built, L) {
  const id = match.id;
  const liveNow = built.phase === 'live';
  return `<div class="tools">
    <button class="tool" data-act="live-sub" ${liveNow ? '' : 'disabled'}>${ICONS.swap}<span>Замена</span></button>
    <button class="tool" data-act="live-libero" ${liveNow ? '' : 'disabled'}>${ICONS.people}<span>Либеро</span></button>
    <button class="tool" data-act="live-timeout" data-team="us" ${liveNow ? '' : 'disabled'}>${ICONS.pause}<span>Тайм-аут наш</span></button>
    <button class="tool" data-act="live-timeout" data-team="them" ${liveNow ? '' : 'disabled'}>${ICONS.pause}<span>Тайм-аут соп.</span></button>
    <button class="tool" data-act="live-sanction" ${liveNow ? '' : 'disabled'}>${ICONS.card}<span>Санкция</span></button>
    <button class="tool" data-act="live-replay" ${liveNow ? '' : 'disabled'}>${ICONS.replay}<span>Переиграть</span></button>
    <button class="tool" data-act="live-end-set" ${liveNow ? '' : 'disabled'}>${ICONS.flag}<span>Конец партии</span></button>
    <button class="tool" data-act="live-flip">${ICONS.flip}<span>Сторона</span></button>
    <button class="tool" data-act="live-mode">${ICONS.swap}<span>${match.mode === 'detailed' ? 'Режим: подробный' : 'Режим: быстрый'}</span></button>
    <a class="tool" href="#/feed/${id}">${ICONS.list}<span>Лента</span></a>
    <a class="tool" href="#/reports/${id}/team">${ICONS.chart}<span>Отчёты</span></a>
  </div>`;
}

// ---------- Quick mode (spec §5: result, serve/reception and the attacking finish first) ----------

export function isQuick(match, L) {
  return match.mode !== 'detailed' && !L?.fullPad;
}

function qbtn(label, symbol, tone, act, value, disabled = false) {
  return `<button class="grade ${tone}" data-act="${act}" data-value="${h(value)}" ${disabled ? 'disabled' : ''}>
    <span class="g-sym">${h(symbol)}</span><span class="g-label">${h(label)}</span></button>`;
}

function qend(team, kind, title, sub = '') {
  return `<button class="qend ${team}" data-act="q-end" data-kind="${kind}"><b>${h(title)}</b>${sub ? `<span>${h(sub)}</span>` : ''}</button>`;
}

// Grades offered per skill in quick mode: the whole attack scale, the useful block outcomes,
// and a four-step dig scale (the overpass grade D/ stays in detailed input).
const QUICK_ROWS = [
  ['A', ['K', 'C', 'B', 'E']],
  ['B', ['P', 'S', 'T', '=']],
  ['D', ['+', '!', '-', '=']],
];

function quickPadHtml(match, built, L, map) {
  const c = built.current;
  const touches = c.openRally?.touches ?? [];
  const weServe = c.serving === 'us';
  const server = c.snap.court[0].player;
  const sel = L.player && L.player !== 'opp' && L.player !== 'unk' ? L.player : null;
  const ourServe = touches.find((t) => t.team === 'us' && t.skill === 'S');
  const ourRecv = touches.find((t) => t.team === 'us' && t.skill === 'R');

  let first = '';
  if (weServe) {
    first = ourServe
      ? ''
      : `<div class="q-block"><div class="q-title">Подача · ${h(playerLabel(server, map))}</div>
          <div class="q-row three">${qbtn('Эйс', '#', 'good', 'q-serve', '#')}${qbtn('В игре', '·', 'neutral', 'q-serve', 'in')}${qbtn('Ошибка', '=', 'bad', 'q-serve', '=')}</div></div>`;
  } else if (!ourRecv && !touches.some((t) => t.team === 'us')) {
    const grades = ['#', '+', '!', '-', '/o', '='].map((g) => {
      const info = gradeInfo('R', g);
      return qbtn(g === '=' ? 'Эйс соп.' : info.label, info.symbol, info.tone, 'q-act', `R:${g}`, !sel);
    });
    first = `<div class="q-block"><div class="q-title">Приём · ${sel ? h(playerLabel(sel, map)) : '<span class="muted">выберите принимающего</span>'}</div>
      <div class="q-row six">${grades.join('')}</div></div>`;
  }

  // Highlight the row we expect next: after our first touch an attack, after theirs a block or dig.
  const sug = L.suggestion?.skill;
  const expected = sug === 'E' || sug === 'A' ? 'A' : sug === 'B' ? 'B' : sug === 'D' || sug === 'C' ? 'D' : null;
  const rows = QUICK_ROWS.map(
    ([skill, grades]) => `<div class="q-skill ${expected === skill && touches.length ? 'expected' : ''}">
      <div class="q-skill-name">${SKILLS[skill].title}</div>
      <div class="q-row four">${grades
        .map((g) => {
          const info = gradeInfo(skill, g);
          return qbtn(info.label, info.symbol, info.tone, 'q-act', `${skill}:${g}`, !sel);
        })
        .join('')}</div></div>`
  ).join('');

  const who = sel
    ? `${h(playerLabel(sel, map))} <button class="link" data-act="q-clear">снять</button>`
    : '<span class="muted">Нажмите на игрока на площадке</span>';

  return `${first}
    <div class="q-player">${who}</div>
    ${rows}
    <div class="q-team">
      <div class="q-team-title">Итог без игрока</div>
      <div class="q-team-row">
        ${!weServe && !touches.length ? qend('us', 'opp-serve-error', 'Ошибка подачи соп.', '+1 нам') : ''}
        ${qend('us', 'us-opp-error', 'Ошибка соперника', '+1 нам')}
        ${qend('them', 'them-kill', 'Атака соперника', '+1 им')}
        ${qend('them', 'them-block', 'Блок соперника', '+1 им')}
        ${!weServe && !ourRecv ? qend('them', 'them-ace', 'Эйс соперника', '+1 им') : ''}
        ${qend('them', 'us-error', 'Наша ошибка', '+1 им')}
      </div>
    </div>
    <button class="link q-more" data-act="q-full" data-value="1">Подробный ввод (пас, страховка, уточнения) →</button>
    ${noticesHtml(built, map)}`;
}

async function quickTouch(team, player, skill, grade) {
  if (state.current.built.phase !== 'live') return;
  await addEntry('touch', { team, player, skill, grade });
  const L = state.ui.live;
  L.player = null;
  navigator.vibrate?.(10);
  applySuggestion();
  render();
}

async function quickPoint(winner, reason) {
  if (state.current.built.phase !== 'live') return;
  await addEntry('point', { winner, reason });
  const L = state.ui.live;
  L.player = null;
  applySuggestion();
  render();
}

const selected = () => {
  const p = state.ui.live?.player;
  return p && p !== 'opp' && p !== 'unk' ? p : null;
};

actions['q-serve'] = ({ value }) => quickTouch('us', state.current.built.current.snap.court[0].player, 'S', value);

actions['q-act'] = ({ value }) => {
  const p = selected();
  if (!p) return;
  const [skill, grade] = value.split(':');
  return quickTouch('us', p, skill, grade);
};

actions['q-clear'] = () => {
  state.ui.live.player = null;
  render();
};

actions['q-end'] = ({ kind }) => {
  switch (kind) {
    case 'opp-serve-error':
      return quickTouch('them', null, 'S', '=');
    case 'us-opp-error':
      return quickPoint('us', 'error');
    case 'them-kill':
      return quickTouch('them', null, 'A', 'K');
    case 'them-block':
      return quickTouch('them', null, 'B', 'P');
    case 'them-ace':
      return quickTouch('them', null, 'S', '#');
    case 'us-error':
      return quickPoint('them', 'error');
    default:
      return undefined;
  }
};

actions['q-full'] = ({ value }) => {
  const L = state.ui.live;
  L.fullPad = value === '1';
  applySuggestion();
  render();
};

actions['live-mode'] = async () => {
  const m = state.current.match;
  m.mode = m.mode === 'detailed' ? 'quick' : 'detailed';
  await saveMatch(m);
  state.ui.live.fullPad = false;
  applySuggestion();
  toast(m.mode === 'detailed' ? 'Подробный режим: все касания и уточнения' : 'Быстрый режим: подача/приём и итог розыгрыша');
  render();
};

// ---------- Recording ----------

async function recordGrade(grade) {
  const L = state.ui.live;
  if (!L?.player || !L.skill || state.current.built.phase !== 'live') return;
  if (!GRADES[L.skill][grade] && grade !== '?') return;
  const team = L.player === 'opp' ? 'them' : 'us';
  const player = L.player === 'opp' || L.player === 'unk' ? null : L.player;
  const e = await addEntry('touch', { team, player, skill: L.skill, grade });
  L.extrasFor = EXTRA_SKILLS.has(e.skill) && grade !== '?' ? e.id : null;
  if (e.skill === 'B' && team === 'us' && !['P', 'S', 'T', 'R'].includes(grade)) L.extrasFor = null;
  L.reasonFor = null;
  navigator.vibrate?.(10);
  applySuggestion();
  render();
}

async function recordPoint(winner) {
  if (state.current.built.phase !== 'live') return;
  const e = await addEntry('point', { winner, reason: 'unknown' });
  const L = state.ui.live;
  L.reasonFor = e.id;
  L.extrasFor = null;
  applySuggestion();
  render();
}

actions['live-player'] = ({ id }) => {
  const L = state.ui.live;
  const wasTeam = L.player === 'opp' ? 'them' : 'us';
  L.player = L.player === id ? null : id;
  const nowTeam = L.player === 'opp' ? 'them' : 'us';
  if (L.player && (wasTeam !== nowTeam || !L.skill)) L.skill = nowTeam === 'them' ? L.suggestion?.opp ?? 'A' : L.suggestion?.skill ?? 'A';
  L.keyMode = 'idle';
  L.buf = '';
  render();
};

actions['live-skill'] = ({ skill }) => {
  const L = state.ui.live;
  L.skill = skill;
  render();
};

actions['live-grade'] = ({ grade }) => recordGrade(grade);

actions['live-point'] = ({ winner }) => recordPoint(winner);

actions['live-extra'] = async ({ field, value }) => {
  const L = state.ui.live;
  const e = lastEntry(L.extrasFor);
  if (!e) return;
  await setFields(e.id, { [field]: e[field] === value ? null : value });
  render();
};

actions['live-block-with'] = async ({ id }) => {
  const e = lastEntry(state.ui.live.extrasFor);
  if (!e) return;
  const set = new Set(e.with ?? []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  await setFields(e.id, { with: [...set] });
  render();
};

actions['live-extras-close'] = () => {
  state.ui.live.extrasFor = null;
  render();
};

actions['live-reason'] = async ({ value }) => {
  const e = lastEntry(state.ui.live.reasonFor);
  if (!e) return;
  await setFields(e.id, { reason: value });
  state.ui.live.reasonFor = null;
  render();
};

actions['live-undo'] = async () => {
  const e = await undo();
  if (!e) return;
  toast(`Отменено: ${describeEntry(e)}`);
  applySuggestion();
  state.ui.live.extrasFor = null;
  state.ui.live.reasonFor = null;
  render();
};

actions['live-redo'] = async () => {
  if (!(await redo())) return;
  applySuggestion();
  render();
};

actions['live-flip'] = () => {
  state.ui.live.flipped = !state.ui.live.flipped;
  render();
};

actions['live-timeout'] = async ({ team }) => {
  const set = state.current.built.current.set;
  if (set.timeouts[team] >= 2 && !(await confirmBox('Третий тайм-аут?', 'По регламенту в партии два тайм-аута на команду.', 'Записать'))) return;
  await addEntry('timeout', { team });
  toast(team === 'us' ? 'Тайм-аут нашей команды' : 'Тайм-аут соперника');
  render();
};

actions['live-replay'] = async () => {
  const c = state.current.built.current;
  const msg = c.openRally
    ? 'Касания текущего розыгрыша не попадут в отчёты.'
    : 'Последний розыгрыш будет аннулирован: счёт, подача и переход вернутся к состоянию до него.';
  if (!(await confirmBox('Переиграть розыгрыш?', msg, 'Переиграть'))) return;
  await addEntry('replay', {});
  applySuggestion();
  render();
};

actions['live-end-set'] = async () => {
  const c = state.current.built.current;
  if (!(await confirmBox('Завершить партию?', `Партия ${c.set.number} будет закрыта при счёте ${score(c.score)} до достижения целевого счёта.`, 'Завершить', true))) return;
  await addEntry('setEnd', {});
  render();
};

// ---------- Substitutions (spec §11) ----------

export function subWarnings(built, match, changes) {
  const set = built.current.set;
  const out = [];
  const history = built.timeline.filter((t) => t.kind === 'sub' && t.set === set.number).flatMap((t) => t.entry.changes ?? []);
  if (set.subs + changes.length > match.profile.subsPerSet) out.push(`Превышен лимит замен в партии (${match.profile.subsPerSet}).`);
  for (const ch of changes) {
    const starter = set.startSlots[ch.slot - 1];
    const enteredBefore = history.filter((x) => x.in === ch.in).length;
    const leftBefore = history.filter((x) => x.out === ch.in).length;
    if (set.startSlots.includes(ch.in)) {
      if (ch.in !== starter) out.push('Стартовый игрок может вернуться только на своё место в расстановке.');
      else if (!leftBefore) out.push('Этот игрок не уходил с площадки.');
      else if (enteredBefore) out.push('Стартовый игрок уже возвращался в этой партии.');
    } else if (enteredBefore) {
      out.push('Запасной игрок может выйти на замену лишь один раз за партию.');
    }
    if (ch.out !== starter && ch.in !== starter) out.push('Запасного может сменить только стартовый игрок этого места.');
  }
  return out;
}

function renderSubSheet() {
  const { match, built } = state.current;
  const map = rosterMap(match);
  const set = built.current.set;
  const S = state.ui.sub;
  const used = new Set(S.changes.flatMap((c) => [c.out, c.in]));
  const court = set.slotPlayers.map((pid, i) => ({ pid, slot: i + 1, pos: positionOfSlot(i + 1, set.shift) })).filter((x) => !used.has(x.pid));
  const bench = match.roster.filter((p) => !set.slotPlayers.includes(p.playerId) && !set.liberos.includes(p.playerId) && !used.has(p.playerId));
  const warnings = subWarnings(built, match, S.changes);
  const sheet = openSheet(`${sheetBar('Замена', { done: null })}
    <div class="sub-cols">
      <div><h3 class="section-title">Уходит</h3><div class="pick">${court
        .sort((a, b) => a.pos - b.pos)
        .map(
          (x) => `<button class="chip ${S.out === x.pid ? 'active' : ''}" data-act="sub-out" data-id="${x.pid}" data-slot="${x.slot}">#${map.get(x.pid)?.number} ${h(map.get(x.pid)?.name ?? '')} <small>поз. ${x.pos}</small></button>`
        )
        .join('')}</div></div>
      <div><h3 class="section-title">Выходит</h3><div class="pick">${bench
        .map((p) => `<button class="chip" data-act="sub-in" data-id="${p.playerId}" ${S.out ? '' : 'disabled'}>#${p.number} ${h(p.name)}</button>`)
        .join('') || '<p class="hint">Запасных нет</p>'}</div></div>
    </div>
    ${S.changes.length ? `<h3 class="section-title">${S.changes.length > 1 ? 'Двойная замена' : 'Замена'}</h3><div class="group">${S.changes
      .map((c, i) => `<div class="row"><div class="row-main">#${map.get(c.out)?.number} ${h(map.get(c.out)?.name ?? '')} → #${map.get(c.in)?.number} ${h(map.get(c.in)?.name ?? '')}</div><button class="del" data-act="sub-remove" data-i="${i}">✕</button></div>`)
      .join('')}</div>` : '<p class="hint">Выберите уходящего игрока, затем выходящего. Для двойной замены добавьте вторую пару — обе сохранятся одной записью.</p>'}
    <label class="field check plain"><span>Исключительная замена</span><input type="checkbox" data-act="sub-exceptional" ${S.exceptional ? 'checked' : ''}></label>
    ${warnings.length ? `<div class="notice warn">${ICONS.warn} ${warnings.map(h).join('<br>')}</div>` : ''}
    <button class="btn primary wide" data-act="sub-save" ${S.changes.length ? '' : 'disabled'}>${warnings.length ? 'Сохранить с комментарием' : 'Сохранить замену'}</button>`);
  return sheet;
}

actions['live-sub'] = () => {
  state.ui.sub = { changes: [], out: null, outSlot: null, exceptional: false };
  renderSubSheet();
};

actions['sub-out'] = ({ id, slot }) => {
  state.ui.sub.out = id;
  state.ui.sub.outSlot = Number(slot);
  renderSubSheet();
};

actions['sub-in'] = ({ id }) => {
  const S = state.ui.sub;
  if (!S.out) return;
  S.changes.push({ slot: S.outSlot, out: S.out, in: id });
  S.out = null;
  S.outSlot = null;
  renderSubSheet();
};

actions['sub-remove'] = ({ i }) => {
  state.ui.sub.changes.splice(Number(i), 1);
  renderSubSheet();
};

actions['sub-exceptional'] = () => {
  state.ui.sub.exceptional = !state.ui.sub.exceptional;
  renderSubSheet();
};

actions['sub-save'] = async () => {
  const S = state.ui.sub;
  const { built, match } = state.current;
  const warnings = subWarnings(built, match, S.changes);
  let comment = '';
  if (S.exceptional) {
    comment = (await askText('Основание исключительной замены', 'Травма, болезнь…')) ?? '';
    if (!comment.trim()) return;
  } else if (warnings.length) {
    const text = await askText('Замена не по регламенту', 'Решение судьи, комментарий', '', warnings.join(' '));
    if (text == null) return;
    comment = text;
  }
  await addEntry('sub', {
    changes: S.changes,
    kind: S.exceptional ? 'exceptional' : 'normal',
    override: Boolean(warnings.length),
    comment: comment.trim(),
    warnings,
  });
  closeSheet();
  applySuggestion();
  render();
};

// ---------- Libero ----------

function renderLiberoSheet() {
  const { match, built } = state.current;
  const map = rosterMap(match);
  const c = built.current;
  const set = c.set;
  const lib = state.ui.libero;
  if (!set.liberos.length) {
    openSheet(`${sheetBar('Либеро')}<p class="hint">В расстановке этой партии либеро не указан.</p>`);
    return;
  }
  const back = c.snap.court.filter((x) => !isFront(x.pos) && !x.libero);
  const servingBlock = (x) => x.pos === 1 && c.serving === 'us' && !match.profile.liberoCanServe;
  openSheet(`${sheetBar('Либеро')}
    ${set.libero ? `<div class="group"><div class="row"><div class="row-main">На площадке ${playerLabel(set.libero.id, map)} вместо ${playerLabel(set.libero.replaced, map)}</div></div></div>
      <button class="btn wide" data-act="libero-out">Либеро уходит — возвращается ${playerLabel(set.libero.replaced, map)}</button>` : ''}
    <h3 class="section-title">${set.libero ? 'Заменить на другого' : 'Либеро выходит вместо'}</h3>
    ${set.liberos.length > 1 ? `<div class="pick">${set.liberos.map((id) => `<button class="chip ${lib.id === id ? 'active' : ''}" data-act="libero-pick" data-id="${id}">${playerLabel(id, map)}</button>`).join('')}</div>` : ''}
    <div class="pick">${back
      .map(
        (x) => `<button class="chip" data-act="libero-in" data-id="${x.player}" data-slot="${x.slot}" ${servingBlock(x) ? 'disabled title="Либеро не может подавать по профилю"' : ''}>#${map.get(x.player)?.number} ${h(map.get(x.player)?.name ?? '')} <small>поз. ${x.pos}</small></button>`
      )
      .join('')}</div>
    <p class="hint">Порядок подачи и слот не меняются. Перед уходом слота в переднюю линию либеро выходит автоматически.</p>`);
}

actions['live-libero'] = () => {
  const set = state.current.built.current.set;
  state.ui.libero = { id: set.libero?.id ?? set.liberos[0] };
  renderLiberoSheet();
};

actions['libero-pick'] = ({ id }) => {
  state.ui.libero.id = id;
  renderLiberoSheet();
};

actions['libero-in'] = async ({ id, slot }) => {
  const set = state.current.built.current.set;
  const replaced = set.libero && set.libero.slot === Number(slot) ? set.libero.replaced : id;
  await addEntry('libero', { action: 'in', libero: state.ui.libero.id, replaced, slot: Number(slot) });
  closeSheet();
  render();
};

actions['live-libero-quick'] = async ({ id, slot }) => {
  const set = state.current.built.current.set;
  await addEntry('libero', { action: 'in', libero: set.liberos[0], replaced: id, slot: Number(slot) });
  render();
};

actions['libero-out'] = async () => {
  const set = state.current.built.current.set;
  await addEntry('libero', { action: 'out', libero: set.libero.id });
  closeSheet();
  render();
};

// ---------- Sanctions ----------

actions['live-sanction'] = () => {
  const { match } = state.current;
  openSheet(`${sheetBar('Санкция')}
    <p class="hint">Записывается вне розыгрыша. Очко по санкции меняет счёт и подачу, но не входит в SO/BP.</p>
    <h3 class="section-title">Наказана команда</h3>
    <div class="pick"><button class="chip" data-act="sanction" data-team="us" data-card="yellow">${h(match.teamName)}: предупреждение</button>
      <button class="chip" data-act="sanction" data-team="us" data-card="red">${h(match.teamName)}: штраф (очко сопернику)</button></div>
    <div class="pick"><button class="chip" data-act="sanction" data-team="them" data-card="yellow">${h(match.opponent)}: предупреждение</button>
      <button class="chip" data-act="sanction" data-team="them" data-card="red">${h(match.opponent)}: штраф (очко нам)</button></div>`);
};

actions.sanction = async ({ team, card }) => {
  await addEntry('sanction', { team, card, pointTo: card === 'red' ? other(team) : null });
  closeSheet();
  applySuggestion();
  render();
};

// ---------- Helpers ----------

export function describeEntry(e, map = rosterMap()) {
  switch (e.type) {
    case 'touch': {
      const g = gradeInfo(e.skill, e.grade);
      const who = e.team === 'them' ? 'Соперник' : e.player ? playerLabel(e.player, map) : 'Игрок не указан';
      return `${who} · ${SKILLS[e.skill].title} ${g.symbol} ${g.label}`;
    }
    case 'point':
      return `Очко ${e.winner === 'us' ? 'нам' : 'сопернику'}${e.reason && e.reason !== 'unknown' ? ` · ${REASONS[e.reason]}` : ''}`;
    case 'sub':
      return `Замена: ${(e.changes ?? []).map((c) => `${playerLabel(c.out, map)} → ${playerLabel(c.in, map)}`).join(', ')}`;
    case 'libero':
      return e.action === 'in' ? `Либеро ${playerLabel(e.libero, map)} вместо ${playerLabel(e.replaced, map)}` : `Либеро ${playerLabel(e.libero, map)} уходит`;
    case 'timeout':
      return `Тайм-аут ${e.team === 'us' ? 'наш' : 'соперника'}`;
    case 'sanction':
      return `Санкция ${e.team === 'us' ? 'нам' : 'сопернику'}${e.pointTo ? ' (очко)' : ''}`;
    case 'replay':
      return 'Переигровка';
    case 'setStart':
      return 'Начало партии';
    case 'setEnd':
      return 'Конец партии';
    default:
      return e.type;
  }
}

// ---------- Keyboard (laptop) ----------

let bufTimer = null;

function selectByNumber(num) {
  const { match, built } = state.current;
  const n = parseInt(num, 10);
  const onCourt = built.current.snap.onCourt;
  const candidates = match.roster.filter((p) => p.number === n);
  const p = candidates.find((x) => onCourt.includes(x.playerId)) ?? candidates[0];
  const L = state.ui.live;
  L.buf = '';
  if (!p) {
    toast(`Нет игрока с номером ${num}`);
    render();
    return false;
  }
  L.player = p.playerId;
  return true;
}

document.addEventListener('keydown', async (e) => {
  if (route().name !== 'live' || !state.ui.live || !state.current) return;
  if (e.target.closest?.('input, select, textarea')) return;
  if (isDialogOpen()) return;
  const L = state.ui.live;
  const keys = state.settings.keys;
  const built = state.current.built;

  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    await actions[e.shiftKey ? 'live-redo' : 'live-undo']();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    await actions['live-redo']();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (built.phase !== 'live') return;

  if (e.code === 'Escape') {
    L.player = null;
    L.skill = null;
    L.buf = '';
    L.keyMode = 'idle';
    render();
    return;
  }
  if (e.code === keys.pointUs || e.code === keys.pointThem) {
    e.preventDefault();
    await recordPoint(e.code === keys.pointUs ? 'us' : 'them');
    return;
  }
  if (e.code === keys.opponent) {
    e.preventDefault();
    L.player = 'opp';
    L.skill = L.suggestion?.opp ?? 'A';
    L.buf = '';
    L.keyMode = 'idle';
    render();
    return;
  }
  const skill = Object.keys(SKILLS).find((s) => keys[s] === e.code);
  if (skill) {
    e.preventDefault();
    if (L.buf && !selectByNumber(L.buf)) return;
    clearTimeout(bufTimer);
    if (!L.player) {
      toast('Сначала номер игрока или соперник');
      return;
    }
    L.skill = skill;
    L.keyMode = 'grade';
    render();
    return;
  }
  const digit = /^(Digit|Numpad)(\d)$/.exec(e.code)?.[2];
  if (digit != null) {
    e.preventDefault();
    if (L.keyMode === 'grade' && L.player && L.skill) {
      const grades = Object.keys(GRADES[L.skill]);
      const g = grades[Number(digit) - 1];
      if (g) await recordGrade(g);
      return;
    }
    L.buf += digit;
    clearTimeout(bufTimer);
    bufTimer = setTimeout(() => {
      if (L.buf) {
        selectByNumber(L.buf);
        render();
      }
    }, 900);
    render();
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    clearTimeout(bufTimer);
    if (L.buf) selectByNumber(L.buf);
    else if (L.player && L.skill) L.keyMode = 'grade';
    render();
  }
});
