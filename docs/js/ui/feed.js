// Rally feed (spec §5 "Лента"): rallies and touches, incomplete records, corrections, search.
// Every correction is an amendment that keeps the previous version with author, time and reason.

import { state, openMatch, amendEntry, deleteEntry, insertEntry, rosterMap, playerLabel } from '../core.js';
import { SKILLS, SKILL_ORDER, GRADES, gradeInfo, REASONS, ATTACK_TYPES, DIRECTIONS, SERVE_TYPES, SYSTEM, DIFFICULTY, POSITION_SHORT } from '../model/constants.js';
import { h, actions, forms, changes, navBar, openSheet, closeSheet, sheetBar, confirmBox, toast, score, ICONS, fmtDateTime } from './dom.js';
import { render, route } from '../router.js';
import { describeEntry } from './live.js';

function feedState(id, query) {
  if (!state.ui.feed || state.ui.feed.matchId !== id || query.get('reset')) {
    state.ui.feed = {
      matchId: id,
      set: query.get('set') ?? '',
      player: query.get('player') ?? '',
      skill: query.get('skill') ?? '',
      grade: query.get('grade') ?? '',
      p: query.get('p') ?? '',
      q: '',
      flags: query.get('flags') ?? '',
      newestFirst: true,
    };
  }
  return state.ui.feed;
}

const touchMatches = (t, F) =>
  (!F.player || (F.player === 'opp' ? t.team === 'them' : F.player === 'unk' ? t.team === 'us' && !t.player : t.player === F.player || (t.with ?? []).includes(F.player))) &&
  (!F.skill || t.skill === F.skill) &&
  (!F.grade || t.grade === F.grade);

function rallyMatches(r, F) {
  if (F.set && String(r.set) !== F.set) return false;
  if (F.p && r.snap.pLabel !== F.p) return false;
  if (F.flags === 'incomplete' && (r.complete || r.replayed)) return false;
  if (F.flags === 'check' && !r.needsCheck && !r.warnings.length) return false;
  if (F.flags === 'replayed' && !r.replayed) return false;
  if (F.q) {
    const q = F.q.replace(/\s/g, '');
    if (![score(r.scoreBefore), r.scoreAfter ? score(r.scoreAfter) : ''].some((s) => s.includes(q))) return false;
  }
  if (F.player || F.skill || F.grade) return [...r.touches, ...r.linked].some((t) => touchMatches(t, F));
  return true;
}

export async function viewFeed({ id, query }) {
  const cur = await openMatch(id);
  if (!cur) return null;
  const { match, built } = cur;
  const F = feedState(id, query);
  const map = rosterMap(match);
  const filtering = F.player || F.skill || F.grade || F.p || F.q || F.flags;

  let items = built.timeline.filter((item) => {
    if (item.kind === 'rally') return rallyMatches(item.rally, F);
    if (filtering && (F.player || F.skill || F.grade || F.p || F.q || F.flags)) return false;
    if (F.set && item.set != null && String(item.set) !== F.set) return false;
    return true;
  });
  if (F.newestFirst) items = items.reverse();

  const total = built.rallies.length;
  const shown = items.filter((i) => i.kind === 'rally').length;

  const select = (name, options, value) =>
    `<select data-change="feed-filter" data-name="${name}">${options.map(([v, l]) => `<option value="${h(v)}" ${String(v) === String(value) ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;

  const players = [['', 'Все игроки'], ...[...match.roster].sort((a, b) => a.number - b.number).map((p) => [p.playerId, `#${p.number} ${p.name}`]), ['unk', 'Наш, не определён'], ['opp', 'Соперник']];
  const gradeOptions = [['', 'Все оценки'], ...(F.skill ? Object.keys(GRADES[F.skill]).map((g) => [g, `${gradeInfo(F.skill, g).symbol} ${gradeInfo(F.skill, g).label}`]) : []), ['?', '? не оценено']];
  const pLabels = [...new Set(built.rallies.map((r) => r.snap.pLabel).filter(Boolean))].sort();

  const filters = `<div class="filters">
    ${select('set', [['', 'Все партии'], ...built.sets.map((s) => [s.number, `Партия ${s.number}`])], F.set)}
    ${select('player', players, F.player)}
    ${select('skill', [['', 'Все действия'], ...SKILL_ORDER.map((s) => [s, `${s} · ${SKILLS[s].title}`])], F.skill)}
    ${select('grade', gradeOptions, F.grade)}
    ${select('p', [['', 'Все расстановки'], ...pLabels.map((p) => [p, p])], F.p)}
    ${select('flags', [['', 'Все розыгрыши'], ['incomplete', 'Неполные'], ['check', 'Требуют проверки'], ['replayed', 'Переигранные']], F.flags)}
    <input class="search" data-change="feed-filter" data-name="q" placeholder="Счёт, напр. 20:18" value="${h(F.q)}">
    <button class="btn small" data-act="feed-order">${F.newestFirst ? 'Сначала новые' : 'Сначала старые'}</button>
    ${filtering || F.set ? '<button class="btn small" data-act="feed-reset">Сбросить</button>' : ''}
  </div>`;

  const body = items.length
    ? items.map((item) => itemHtml(item, built, map, F)).join('')
    : '<p class="hint">Ничего не найдено.</p>';

  return {
    tab: 'matches',
    title: 'Лента',
    html:
      navBar({ back: `#/match/${id}`, backLabel: 'Матч', title: 'Лента розыгрышей', sub: `${match.teamName} — ${match.opponent} · показано ${shown} из ${total}`, right: `<a class="nav-btn" href="#/live/${id}">Запись</a>` }) +
      `<main class="content wide">${filters}<div class="feed">${body}</div></main>`,
  };
}

function touchRow(t, map, F, linked = false) {
  const g = gradeInfo(t.skill, t.grade);
  const who = t.team === 'them' ? 'Соперник' : t.player ? playerLabel(t.player, map) : 'Наш, не определён';
  const extras = [
    t.attackType && ATTACK_TYPES[t.attackType],
    t.direction && DIRECTIONS[t.direction],
    t.system && t.system !== 'unk' && SYSTEM[t.system],
    t.target && `→ ${playerLabel(t.target, map)}`,
    t.serveType && SERVE_TYPES[t.serveType],
    t.difficulty && t.difficulty !== 'unk' && DIFFICULTY[t.difficulty],
    t.with?.length && `блок с ${t.with.map((p) => playerLabel(p, map)).join(', ')}`,
    t.assistBy && `пас ${playerLabel(t.assistBy, map)}`,
    linked && 'связанная запись',
  ]
    .filter(Boolean)
    .map(h)
    .join(' · ');
  const hit = (F.player || F.skill || F.grade) && touchMatches(t, F);
  const history = t.history?.filter((x) => x.reason && x.reason !== 'Отмена' && x.reason !== 'Повтор').length ? '<span class="flag info">изменено</span>' : '';
  return `<button class="trow ${t.team} ${hit ? 'hit' : ''}" data-act="feed-edit" data-id="${t.id}">
    <span class="t-skill">${t.skill}</span><span class="t-grade ${g.tone}">${h(g.symbol)}</span>
    <span class="t-who">${h(who)}</span><span class="t-label">${h(g.label)}</span>
    <span class="t-extra">${extras}</span>${history}</button>`;
}

function itemHtml(item, built, map, F) {
  if (item.kind === 'rally') {
    const r = item.rally;
    const flags = [
      r.replayed && '<span class="flag">переигран</span>',
      !r.replayed && !r.complete && `<span class="flag" title="${h(r.gaps.join('; '))}">неполный</span>`,
      r.needsCheck && '<span class="flag bad">проверить</span>',
    ]
      .filter(Boolean)
      .join('');
    const result = r.winner
      ? `<b class="${r.winner}">${r.winner === 'us' ? '+1 нам' : '+1 сопернику'}</b> ${h(REASONS[r.reason] ?? '')}`
      : r.replayed
      ? ''
      : '<span class="muted">идёт</span>';
    return `<div class="rally-card ${r.replayed ? 'replayed' : ''}">
      <div class="rc-head">
        <span class="rc-n">П${r.set} · №${r.setIndex}</span>
        <span class="mono">${score(r.scoreBefore)}${r.scoreAfter ? ` → ${score(r.scoreAfter)}` : ''}</span>
        <span>${r.serving === 'us' ? 'наша подача' : 'подача соперника'}</span>
        ${r.snap.pLabel ? `<span class="badge">${r.snap.pLabel}</span>` : ''}
        <span class="rc-result">${result}</span>${flags}
        <button class="link" data-act="feed-rally" data-id="${r.id}">Изменить</button>
      </div>
      <div class="rc-touches">${r.touches.map((t) => touchRow(t, map, F)).join('')}${r.linked.map((t) => touchRow(t, map, F, true)).join('')}${
        r.touches.length ? '' : '<div class="muted small">Касания не записаны</div>'
      }</div>
      ${r.warnings.length ? `<div class="notice warn">${ICONS.warn} ${r.warnings.map(h).join('; ')}</div>` : ''}
    </div>`;
  }
  if (item.kind === 'notice') {
    return `<div class="feed-note ${item.notice.kind === 'warning' ? 'warn' : ''}">${item.notice.kind === 'warning' ? ICONS.warn : ''} ${h(item.notice.text)}</div>`;
  }
  if (item.kind === 'setStart') {
    const e = item.entry;
    const line = e.slots.map((pid, i) => `${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}: ${map.get(pid)?.number ?? '?'}`).join(' · ');
    return `<div class="feed-set"><b>Партия ${item.set}</b> · ${h(line)}${e.liberos?.length ? ` · Л: ${e.liberos.map((l) => map.get(l)?.number).join(', ')}` : ''} · первая подача: ${e.firstServe === 'us' ? 'наша' : 'соперника'}
      <button class="link" data-act="feed-edit-lineup" data-id="${e.id}">Изменить</button></div>`;
  }
  const e = item.entry;
  const label = describeEntry(e, map);
  const extra = e.type === 'sub' && e.comment ? ` · ${h(e.comment)}` : '';
  const at = item.score ? `<span class="mono">${score(item.score)}</span> ` : '';
  return `<div class="feed-note">${at}${h(label)}${extra} <button class="link" data-act="feed-delete" data-id="${e.id}">Удалить</button></div>`;
}

changes['feed-filter'] = (el) => {
  const F = state.ui.feed;
  F[el.dataset.name] = el.value;
  if (el.dataset.name === 'skill') F.grade = '';
  render();
};

actions['feed-order'] = () => {
  state.ui.feed.newestFirst = !state.ui.feed.newestFirst;
  render();
};

actions['feed-reset'] = () => {
  Object.assign(state.ui.feed, { set: '', player: '', skill: '', grade: '', p: '', q: '', flags: '' });
  render();
};

// ---------- Touch editor ----------

function touchForm({ entry, title, insertAfter = null, rally = null }) {
  const { match } = state.current;
  const draft = state.ui.touchDraft;
  const roster = [...match.roster].sort((a, b) => a.number - b.number);
  const opt = (list, value) => list.map(([v, l]) => `<option value="${h(v ?? '')}" ${String(v ?? '') === String(value ?? '') ? 'selected' : ''}>${h(l)}</option>`).join('');
  const grades = Object.keys(GRADES[draft.skill]).map((g) => [g, `${gradeInfo(draft.skill, g).symbol} ${gradeInfo(draft.skill, g).label}`]);
  const players = [['', draft.team === 'them' ? 'Соперник (без персонализации)' : 'Не определён'], ...(draft.team === 'us' ? roster.map((p) => [p.playerId, `#${p.number} ${p.name}`]) : [])];

  // A touch inserted after the one that decided the rally would open a new rally, so that slot is not offered.
  const insertable = rally ? (rally.reasonSource === 'touch' ? rally.touches.slice(0, -1) : rally.touches) : [];
  const afterOptions = rally
    ? [['__start', 'В начало розыгрыша'], ...insertable.map((t) => [t.id, `После ${t.skill} ${gradeInfo(t.skill, t.grade).symbol}`])]
    : [];

  const extra = [];
  if (draft.skill === 'A') {
    extra.push(`<label class="field"><span>Тип атаки</span><select name="attackType">${opt([['', '—'], ...Object.entries(ATTACK_TYPES)], draft.attackType)}</select></label>`);
    extra.push(`<label class="field"><span>Направление</span><select name="direction">${opt([['', '—'], ...Object.entries(DIRECTIONS)], draft.direction)}</select></label>`);
  }
  if (draft.skill === 'E') {
    extra.push(`<label class="field"><span>Система</span><select name="system">${opt([['', '—'], ...Object.entries(SYSTEM)], draft.system)}</select></label>`);
    extra.push(`<label class="field"><span>Адресат</span><select name="target">${opt([['', '—'], ...roster.map((p) => [p.playerId, `#${p.number} ${p.name}`])], draft.target)}</select></label>`);
    extra.push(`<label class="field"><span>Направление</span><select name="direction">${opt([['', '—'], ...Object.entries(DIRECTIONS)], draft.direction)}</select></label>`);
  }
  if (draft.skill === 'S') extra.push(`<label class="field"><span>Тип подачи</span><select name="serveType">${opt([['', '—'], ...Object.entries(SERVE_TYPES)], draft.serveType)}</select></label>`);
  if (draft.skill === 'D') extra.push(`<label class="field"><span>Сложность</span><select name="difficulty">${opt([['', '—'], ...Object.entries(DIFFICULTY)], draft.difficulty)}</select></label>`);
  if (draft.skill === 'B' && draft.team === 'us') {
    const withSet = new Set(draft.with ?? []);
    extra.push(`<div class="field col"><span>Другие участники блока</span><div class="pick">${roster
      .filter((p) => p.playerId !== draft.player)
      .map((p) => `<label class="chip-check"><input type="checkbox" name="with" value="${p.playerId}" ${withSet.has(p.playerId) ? 'checked' : ''}> #${p.number}</label>`)
      .join('')}</div></div>`);
  }

  const history = (entry?.history ?? [])
    .map((x) => `<li>${h(fmtDateTime(x.at))} · ${h(x.author ?? '')} · ${h(x.reason ?? x.action ?? '')}${x.before ? ` · было: ${h(Object.entries(x.before).map(([k, v]) => `${k}=${v ?? '—'}`).join(', '))}` : ''}</li>`)
    .join('');

  openSheet(`<form data-form="feed-touch" autocomplete="off">
    ${sheetBar(title, { done: 'Сохранить' })}
    <input type="hidden" name="id" value="${entry?.id ?? ''}">
    <div class="group form">
      <label class="field"><span>Команда</span><select name="team" data-change="touch-draft">${opt([['us', state.current.match.teamName], ['them', state.current.match.opponent]], draft.team)}</select></label>
      <label class="field"><span>Игрок</span><select name="player" data-change="touch-draft">${opt(players, draft.player)}</select></label>
      <label class="field"><span>Действие</span><select name="skill" data-change="touch-draft">${opt(SKILL_ORDER.map((s) => [s, `${s} · ${SKILLS[s].title}`]), draft.skill)}</select></label>
      <label class="field"><span>Оценка</span><select name="grade">${opt([...grades, ['?', '? Не оценено']], draft.grade)}</select></label>
      ${extra.join('')}
      <label class="field check"><span>Связанная запись того же очка</span><input type="checkbox" name="linked" ${draft.linked ? 'checked' : ''}></label>
      ${rally && !entry ? `<label class="field"><span>Вставить</span><select name="after">${opt(afterOptions, afterOptions[afterOptions.length - 1]?.[0])}</select></label>` : ''}
      <label class="field"><span>Причина правки</span><input name="reason" placeholder="Например: по видео"></label>
    </div>
    <p class="hint">Связанная запись описывает то же очко с другой стороны (например, ошибка защиты после атаки соперника) и не начинает новый розыгрыш.</p>
    ${entry ? '<button type="button" class="btn danger wide" data-act="feed-delete-touch">Удалить касание</button>' : ''}
    ${history ? `<h3 class="section-title">История изменений</h3><ul class="history">${history}</ul>` : ''}
  </form>`);
  state.ui.touchSheet = { entry, title, insertAfter, rally };
}

changes['touch-draft'] = (el) => {
  const d = state.ui.touchDraft;
  const form = el.form;
  d.team = form.team.value;
  d.player = form.player.value || null;
  if (d.team === 'them') d.player = null;
  if (el.name === 'skill') {
    d.skill = el.value;
    if (!GRADES[d.skill][d.grade]) d.grade = Object.keys(GRADES[d.skill])[0];
  } else {
    d.grade = form.grade.value;
  }
  const s = state.ui.touchSheet;
  touchForm(s);
};

actions['feed-edit'] = ({ id }) => {
  const entry = state.current.entries.find((e) => e.id === id);
  if (!entry) return;
  state.ui.touchDraft = { ...entry, with: [...(entry.with ?? [])] };
  touchForm({ entry, title: 'Касание' });
};

forms['feed-touch'] = async (fd) => {
  const s = state.ui.touchSheet;
  const fields = {
    team: fd.get('team'),
    player: fd.get('team') === 'them' ? null : fd.get('player') || null,
    skill: fd.get('skill'),
    grade: fd.get('grade'),
    linked: Boolean(fd.get('linked')),
  };
  for (const k of ['attackType', 'direction', 'system', 'target', 'serveType', 'difficulty']) {
    if (fd.has(k)) fields[k] = fd.get(k) || null;
  }
  if (fields.skill === 'B') fields.with = fd.getAll('with');
  const reason = String(fd.get('reason') ?? '').trim() || 'Исправление в ленте';
  if (s.entry) {
    await amendEntry(s.entry.id, fields, reason);
    toast('Исправлено, отчёты пересчитаны');
  } else {
    const after = fd.get('after');
    const rally = s.rally;
    const afterId = fields.linked
      ? rally.entryIds[rally.entryIds.length - 1]
      : after === '__start'
      ? prevEntryId(rally.entryIds[0])
      : after;
    await insertEntry(afterId, 'touch', fields);
    toast('Касание добавлено');
  }
  closeSheet();
  render();
};

/** Id of the active entry just before `id` in the log (null if it is the first). */
function prevEntryId(id) {
  const list = state.current.entries;
  const i = list.findIndex((e) => e.id === id);
  for (let j = i - 1; j >= 0; j--) if (!list[j].deleted) return list[j].id;
  return null;
}

actions['feed-delete-touch'] = async () => {
  const s = state.ui.touchSheet;
  if (!s.entry || !(await confirmBox('Удалить касание?', 'Запись останется в истории как удалённая, отчёты пересчитаются.', 'Удалить', true))) return;
  await deleteEntry(s.entry.id, 'Удалено в ленте');
  closeSheet();
  render();
};

actions['feed-delete'] = async ({ id }) => {
  const e = state.current.entries.find((x) => x.id === id);
  if (!e || !(await confirmBox('Удалить запись?', describeEntry(e), 'Удалить', true))) return;
  await deleteEntry(id, 'Удалено в ленте');
  render();
};

// ---------- Rally editor ----------

actions['feed-rally'] = ({ id }) => {
  const { built } = state.current;
  const r = built.rallies.find((x) => x.id === id);
  if (!r) return;
  const end = state.current.entries.find((e) => e.id === r.endEntryId);
  const explicit = end?.type === 'point';
  openSheet(`${sheetBar(`Розыгрыш П${r.set} №${r.setIndex}`)}
    <div class="group"><div class="row"><div class="row-main">
      <div class="row-title">${score(r.scoreBefore)}${r.scoreAfter ? ` → ${score(r.scoreAfter)}` : ''} · ${r.serving === 'us' ? 'наша подача' : 'подача соперника'} ${r.snap.pLabel ? `· ${r.snap.pLabel}` : ''}</div>
      <div class="row-sub">${r.gaps.length ? `Пробелы: ${h(r.gaps.join('; '))}` : 'Цепочка касаний полная'}</div></div></div></div>
    ${
      explicit
        ? `<h3 class="section-title">Итог розыгрыша</h3>
      <form data-form="feed-point" class="group form">
        <input type="hidden" name="id" value="${end.id}">
        <label class="field"><span>Очко</span><select name="winner"><option value="us" ${end.winner === 'us' ? 'selected' : ''}>${h(state.current.match.teamName)}</option><option value="them" ${end.winner === 'them' ? 'selected' : ''}>${h(state.current.match.opponent)}</option></select></label>
        <label class="field"><span>Причина</span><select name="reason">${Object.entries(REASONS).map(([k, v]) => `<option value="${k}" ${end.reason === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Причина правки</span><input name="why" placeholder="Например: по видео"></label>
        <button class="btn primary wide" type="submit">Сохранить итог</button>
      </form>
      <p class="hint">Смена победителя пересчитает счёт, подачу и переходы во всех следующих розыгрышах. Если появятся противоречия, они будут отмечены «проверить».</p>`
        : r.winner
        ? '<p class="hint">Итог определён последним касанием. Чтобы изменить его, исправьте оценку этого касания.</p>'
        : ''
    }
    <button class="btn wide" data-act="feed-add-touch" data-id="${r.id}">+ Добавить касание в розыгрыш</button>`);
};

forms['feed-point'] = async (fd) => {
  await amendEntry(fd.get('id'), { winner: fd.get('winner'), reason: fd.get('reason') }, String(fd.get('why') ?? '').trim() || 'Исправление итога');
  closeSheet();
  toast('Итог изменён, матч пересчитан');
  render();
};

actions['feed-add-touch'] = ({ id }) => {
  const r = state.current.built.rallies.find((x) => x.id === id);
  if (!r) return;
  state.ui.touchDraft = { team: 'us', player: null, skill: 'S', grade: 'in', linked: false, with: [] };
  touchForm({ entry: null, title: 'Новое касание', rally: r });
};

// ---------- Lineup editor ----------

actions['feed-edit-lineup'] = ({ id }) => {
  const e = state.current.entries.find((x) => x.id === id);
  if (!e) return;
  const map = rosterMap();
  const roster = [...state.current.match.roster].sort((a, b) => a.number - b.number);
  const sel = (name, value) =>
    `<select name="${name}"><option value="">—</option>${roster.map((p) => `<option value="${p.playerId}" ${p.playerId === value ? 'selected' : ''}>#${p.number} ${h(p.name)} · ${POSITION_SHORT[p.position] ?? ''}</option>`).join('')}</select>`;
  openSheet(`<form data-form="feed-lineup">${sheetBar('Стартовая расстановка', { done: 'Сохранить' })}
    <input type="hidden" name="id" value="${id}">
    <div class="group form">
      ${e.slots.map((pid, i) => `<label class="field"><span>Позиция ${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</span>${sel(`s${i}`, pid)}</label>`).join('')}
      <label class="field"><span>Либеро 1</span>${sel('l0', e.liberos?.[0])}</label>
      <label class="field"><span>Либеро 2</span>${sel('l1', e.liberos?.[1])}</label>
      <label class="field"><span>Первая подача</span><select name="firstServe"><option value="us" ${e.firstServe === 'us' ? 'selected' : ''}>Наша</option><option value="them" ${e.firstServe === 'them' ? 'selected' : ''}>Соперника</option></select></label>
      <label class="field"><span>Причина правки</span><input name="why" placeholder="Например: по протоколу"></label>
    </div>
    <p class="hint">Все расстановки партии будут пересчитаны. Несовпадения с записанными подачами будут отмечены.</p></form>`);
  void map;
};

forms['feed-lineup'] = async (fd) => {
  const slots = [0, 1, 2, 3, 4, 5].map((i) => fd.get(`s${i}`));
  if (slots.some((x) => !x) || new Set(slots).size !== 6) {
    toast('Нужны шесть разных игроков');
    return;
  }
  const liberos = [fd.get('l0'), fd.get('l1')].filter(Boolean);
  await amendEntry(fd.get('id'), { slots, liberos, firstServe: fd.get('firstServe') }, String(fd.get('why') ?? '').trim() || 'Исправление расстановки');
  closeSheet();
  toast('Расстановка изменена, партия пересчитана');
  render();
};

export { route };
