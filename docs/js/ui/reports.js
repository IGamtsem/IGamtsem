// Report screens (spec §12–14). Each table is described once and rendered both as HTML and as CSV,
// so the export always matches the screen, including numerators and denominators.

import { state, openMatch, rosterMap } from '../core.js';
import { POSITION_SHORT, REASONS, DIRECTIONS, SCALE_VERSION, DATA_VERSION } from '../model/constants.js';
import {
  playersReport, teamReport, setterReport, rotationsReport, receptionByRotation, lineupsReport, runsReport,
  distributionReport, scopeRallies, coverageNotice, pct,
} from '../model/stats.js';
import { setTarget } from '../model/engine.js';
import { h, actions, changes, navBar, pctCell, fmtPct, isSmall, shareFile, safeFilePart, openSheet, sheetBar, score, ICONS } from './dom.js';
import { go, render } from '../router.js';

const TABS = [
  ['team', 'Команда'],
  ['players', 'Игроки'],
  ['setter', 'Связующий'],
  ['rotations', 'Расстановки'],
  ['runs', 'Серии'],
];

function rs() {
  const id = state.current.match.id;
  if (!state.ui.reports || state.ui.reports.matchId !== id) {
    state.ui.reports = { matchId: id, set: '', endgame: false, p: '', playerTab: 'overview', key: 'p', sort: {}, hidden: {}, setter: {} };
  }
  return state.ui.reports;
}

// ---------- Generic table ----------

/** Column: { title, get(row), type: 'num'|'pct'|'frac'|'text', formula?, fixed? } */
const num = (title, get, formula) => ({ title, get, type: 'num', formula });
const per = (title, get, formula) => ({ title, get, type: 'pct', formula });
const frac = (title, get, formula) => ({ title, get, type: 'frac', formula });
const text = (title, get, fixed = false) => ({ title, get, type: 'text', fixed });

function cellHtml(col, row) {
  const v = col.get(row);
  if (col.type === 'pct') return pctCell(v);
  if (col.type === 'frac') {
    if (!v || !v.den) return '<td class="num na">—</td>';
    return `<td class="num${isSmall(v) ? ' few' : ''}" title="${v.num} из ${v.den}">${v.num}/${v.den} · ${fmtPct(v)}${isSmall(v) ? '<sup>*</sup>' : ''}</td>`;
  }
  if (col.type === 'num') return `<td class="num">${v ?? '—'}</td>`;
  return `<td class="${col.fixed ? 'fixed' : ''}">${v ?? ''}</td>`;
}

const sortValue = (col, row) => {
  const v = col.get(row);
  if (v && typeof v === 'object') return v.value ?? -Infinity;
  if (typeof v === 'number') return v;
  return String(v ?? '').replace(/<[^>]+>/g, '');
};

function tableHtml(id, title, cols, rows, { foot = [], rowAct = null, note = '' } = {}) {
  const R = rs();
  const hidden = new Set(R.hidden[id] ?? []);
  const visible = cols.filter((c) => c.fixed || !hidden.has(c.title));
  const sort = R.sort[id];
  let sorted = rows;
  if (sort && visible[sort.i]) {
    const col = visible[sort.i];
    sorted = [...rows].sort((a, b) => {
      const x = sortValue(col, a);
      const y = sortValue(col, b);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ru');
      return sort.dir * d;
    });
  }
  const head = visible
    .map((c, i) => `<th class="${c.type === 'text' ? '' : 'num'} ${c.fixed ? 'fixed' : ''}" ${c.formula ? `title="${h(c.formula)}"` : ''}>
      <button class="th-btn" data-act="rep-sort" data-table="${id}" data-i="${i}">${h(c.title)}${sort?.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`)
    .join('');
  const body = sorted
    .map((r) => `<tr ${rowAct ? `class="clickable" data-act="${rowAct.act}" ${rowAct.data(r)}` : ''}>${visible.map((c) => cellHtml(c, r)).join('')}</tr>`)
    .join('');
  const tfoot = foot.length ? `<tfoot>${foot.map((r) => `<tr>${visible.map((c) => cellHtml(c, r)).join('')}</tr>`).join('')}</tfoot>` : '';
  const formulas = visible.filter((c) => c.formula);
  state.ui.tables ??= {};
  state.ui.tables[id] = { title, cols: visible, rows: sorted, foot };
  return `<section class="report-block">
    <div class="rb-head"><h3>${h(title)}</h3>
      <div class="rb-actions">
        <button class="btn small" data-act="rep-cols" data-table="${id}">Колонки</button>
        <button class="btn small" data-act="rep-csv" data-table="${id}">${ICONS.download} CSV</button>
      </div></div>
    ${note ? `<p class="hint">${note}</p>` : ''}
    ${rows.length || foot.length ? `<div class="table-wrap"><table class="stats"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${tfoot}</table></div>` : '<p class="hint">Нет данных в выбранном отрезке.</p>'}
    ${formulas.length ? `<details class="formulas"><summary>Формулы</summary><ul>${formulas.map((c) => `<li><b>${h(c.title)}</b> — ${h(c.formula)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

actions['rep-sort'] = ({ table, i }) => {
  const R = rs();
  const cur = R.sort[table];
  const idx = Number(i);
  // Descending first, then ascending, then back to the default order.
  if (cur?.i !== idx) R.sort[table] = { i: idx, dir: -1 };
  else if (cur.dir === -1) R.sort[table] = { i: idx, dir: 1 };
  else R.sort[table] = null;
  render();
};

actions['rep-cols'] = ({ table }) => {
  const t = state.ui.tables[table];
  const R = rs();
  const hidden = new Set(R.hidden[table] ?? []);
  const all = TABLE_COLUMNS[table] ?? t.cols;
  openSheet(`${sheetBar(`Колонки: ${t.title}`)}<div class="group">${all
    .filter((c) => !c.fixed)
    .map((c) => `<label class="row"><div class="row-main">${h(c.title)}</div><input type="checkbox" data-change="rep-col" data-table="${table}" data-title="${h(c.title)}" ${hidden.has(c.title) ? '' : 'checked'}></label>`)
    .join('')}</div>`);
};

changes['rep-col'] = (el) => {
  const R = rs();
  const set = new Set(R.hidden[el.dataset.table] ?? []);
  if (el.checked) set.delete(el.dataset.title);
  else set.add(el.dataset.title);
  R.hidden[el.dataset.table] = [...set];
  render();
};

const TABLE_COLUMNS = {};

// ---------- CSV ----------

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const plain = (v) => String(v ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
const csvNum = (x) => (x == null ? '' : String(Math.round(x * 1000) / 10).replace('.', ','));

function filtersText() {
  const R = rs();
  const parts = [];
  parts.push(R.set ? `партия ${R.set}` : 'весь матч');
  if (R.endgame) parts.push('концовки');
  if (R.p) parts.push(R.p);
  for (const [k, v] of Object.entries(R.setter)) if (v) parts.push(`${k}=${v}`);
  return parts.join(', ');
}

actions['rep-csv'] = async ({ table }) => {
  const t = state.ui.tables[table];
  const { match, built } = state.current;
  const rallies = scopeRallies(built, match.profile, commonFilters());
  const cov = coverageNotice(rallies);
  const meta = [
    ['Отчёт', t.title],
    ['Матч', `${match.teamName} — ${match.opponent}`],
    ['Дата матча', new Date(match.date).toLocaleString('ru-RU', { timeZone: match.timeZone })],
    ['Дата формирования', new Date().toLocaleString('ru-RU')],
    ['Версия данных', DATA_VERSION],
    ['Шкала', match.scale ?? SCALE_VERSION],
    ['Регламент', match.profile.name],
    ['Фильтры', filtersText()],
    ['Полнота', `полных розыгрышей ${cov.total - cov.incomplete} из ${cov.total}`],
  ];
  const header = [];
  for (const c of t.cols) {
    if (c.type === 'pct' || c.type === 'frac') header.push(c.title, `${c.title} числ.`, `${c.title} знам.`);
    else header.push(c.title);
  }
  const line = (r) => {
    const out = [];
    for (const c of t.cols) {
      const v = c.get(r);
      if (c.type === 'pct' || c.type === 'frac') out.push(csvNum(v?.value), v?.den ? v.num : '', v?.den ?? '');
      else out.push(plain(v));
    }
    return out.map(csvCell).join(';');
  };
  const lines = [...meta.map((m) => m.map(csvCell).join(';')), '', header.map(csvCell).join(';'), ...t.rows.map(line), ...t.foot.map(line)];
  const name = `volley_${match.date.slice(0, 10)}_${safeFilePart(match.opponent)}_${safeFilePart(t.title)}.csv`;
  await shareFile(name, '﻿' + lines.join('\n'), 'text/csv');
};

// ---------- Common filters ----------

function commonFilters() {
  const R = rs();
  return { set: R.set ? Number(R.set) : null, endgame: R.endgame, pLabel: R.p || null };
}

function filterBar(built, { p = true } = {}) {
  const R = rs();
  const sets = built.sets.map((s) => s.number);
  const pLabels = [...new Set(built.rallies.map((r) => r.snap.pLabel).filter(Boolean))].sort();
  return `<div class="filters">
    <select data-change="rep-filter" data-name="set"><option value="">Весь матч</option>${sets.map((n) => `<option value="${n}" ${String(n) === R.set ? 'selected' : ''}>Партия ${n}</option>`).join('')}</select>
    ${p ? `<select data-change="rep-filter" data-name="p"><option value="">Все расстановки</option>${pLabels.map((x) => `<option ${x === R.p ? 'selected' : ''}>${x}</option>`).join('')}</select>` : ''}
    <label class="toggle"><input type="checkbox" data-change="rep-filter" data-name="endgame" ${R.endgame ? 'checked' : ''}> Концовки (от 20, в решающей от 10, разница ≤ 2)</label>
  </div>`;
}

changes['rep-filter'] = (el) => {
  const R = rs();
  R[el.dataset.name] = el.type === 'checkbox' ? el.checked : el.value;
  render();
};

function coverageBanner(built, match) {
  const rallies = scopeRallies(built, match.profile, commonFilters());
  const cov = coverageNotice(rallies);
  if (!cov.total) return '';
  const small = state.settings.smallSample;
  return `<div class="coverage ${cov.incomplete ? 'partial' : ''}">
    Розыгрышей: <b>${cov.total}</b> · полных записей: <b>${cov.total - cov.incomplete}</b>${
      cov.incomplete
        ? ` · <a href="#/feed/${match.id}?flags=incomplete&reset=1">неполных ${cov.incomplete}</a> — проценты передач и защиты считаются только по записанным касаниям, полнота не установлена`
        : ''
    }<br><span class="muted">«—» — нет наблюдений; <sup>*</sup> — меньше ${small} наблюдений. Наведите на процент, чтобы увидеть числитель и знаменатель.</span>
  </div>`;
}

// ---------- View ----------

export async function viewReports({ id, sub }) {
  const cur = await openMatch(id);
  if (!cur) return null;
  const { match, built } = cur;
  rs();
  const tab = TABS.some(([k]) => k === sub) ? sub : 'team';
  const tabs = `<div class="tabs">${TABS.map(([k, l]) => `<a class="tab-link ${k === tab ? 'active' : ''}" href="#/reports/${id}/${k}">${l}</a>`).join('')}</div>`;
  const map = rosterMap(match);
  let body = '';
  if (tab === 'team') body = teamTab(built, match, map);
  if (tab === 'players') body = playersTab(built, match, map);
  if (tab === 'setter') body = setterTab(built, match, map);
  if (tab === 'rotations') body = rotationsTab(built, match, map);
  if (tab === 'runs') body = runsTab(built, match, map);
  return {
    tab: 'matches',
    title: 'Отчёты',
    html:
      navBar({ back: `#/match/${id}`, backLabel: 'Матч', title: 'Отчёты', sub: `${match.teamName} — ${match.opponent} · ${built.setsWon.us}:${built.setsWon.them}` }) +
      `<main class="content wide">${tabs}${body}</main>`,
  };
}

// ---------- Team ----------

function teamTab(built, match, map) {
  const R = rs();
  const f = commonFilters();
  const rep = teamReport(built, match, f);
  const cols = [
    text('Партия', (r) => (r.set ? `Партия ${r.set}` : '<b>Матч</b>'), true),
    text('Счёт', (r) => (r.set ? score(r.score) : `${built.setsWon.us}:${built.setsWon.them}`)),
    num('Розыгрыши', (r) => r.rallies),
    num('Очки атакой', (r) => r.points.kill),
    num('Эйсы', (r) => r.points.ace),
    num('Очки блоком', (r) => r.points.block),
    num('Ошибки соперника', (r) => r.points.error, 'Очки на ошибках соперника вне атаки, эйсов и блока; включая ошибки подачи'),
    num('Санкции', (r) => r.points.sanction),
    num('TA', (r) => r.line.attack.TA, 'TA = K + E + B + C'),
    per('Kill %', (r) => r.line.attack.killPct, 'K / TA'),
    per('Eff %', (r) => r.line.attack.effPct, '(K − E − B) / TA'),
    per('Rec Positive %', (r) => r.line.reception.positive, '(R# + R+) / приёмы с известной оценкой'),
    per('SO %', (r) => r.so, 'Розыгрыши, выигранные на приёме / все розыгрыши на приёме (ошибки подачи соперника входят)'),
    per('SO in play %', (r) => r.soInPlay, 'Победы на приёме / розыгрыши на приёме после подач в игру'),
    per('BP %', (r) => r.bp, 'Розыгрыши, выигранные на своей подаче / все розыгрыши на своей подаче'),
    per('Покрытие', (r) => r.coverage, 'Полные записи розыгрышей / все розыгрыши'),
  ];
  TABLE_COLUMNS.team = cols;
  const team = tableHtml('team', 'Команда по партиям', cols, rep.perSet, { foot: [rep.total] });

  const dist = distributionReport(built, match, f);
  const dcols = [
    text('Причина', (r) => r.label, true),
    num(match.teamName, (r) => r.us),
    num(match.opponent, (r) => r.them),
  ];
  const drows = [
    ...Object.entries({ kill: REASONS.kill, ace: REASONS.ace, block: REASONS.block, error: 'Ошибки соперника', sanction: 'Санкции', unknown: REASONS.unknown }).map(
      ([k, label]) => ({ label, us: dist.us[k], them: dist.them[k] })
    ),
  ];
  TABLE_COLUMNS.dist = dcols;
  const distHtml = tableHtml('dist', 'Распределение очков', dcols, drows, {
    foot: [{ label: '<b>Итого</b>', us: dist.us.total, them: dist.them.total }],
    note: f.set == null && !f.pLabel && !f.endgame
      ? dist.consistent
        ? `Сумма причин совпадает со счётом ${score(dist.score)}. Санкции вне розыгрышей показаны отдельно.`
        : `${ICONS.warn} Сумма причин не совпадает со счётом ${score(dist.score)} — проверьте ленту.`
      : 'Отрезок отфильтрован: итог относится к выбранным розыгрышам.',
  });

  return filterBar(built) + coverageBanner(built, match) + team + distHtml + scoreChart(built, match);
}

function scoreChart(built, match) {
  if (!built.sets.length) return '';
  const charts = built.sets
    .map((s) => {
      const flow = s.flow.filter((p) => p.by !== 'replay');
      if (flow.length < 2) return '';
      const diffs = flow.map((p) => p.us - p.them);
      const max = Math.max(3, ...diffs.map(Math.abs));
      const W = 320;
      const H = 120;
      const pad = 8;
      const x = (i) => pad + (i / (flow.length - 1)) * (W - pad * 2);
      const y = (d) => H / 2 - (d / max) * (H / 2 - pad);
      const pts = flow.map((p, i) => `${x(i).toFixed(1)},${y(p.us - p.them).toFixed(1)}`).join(' ');
      const hits = flow
        .map((p, i) => `<circle class="hit" cx="${x(i).toFixed(1)}" cy="${y(p.us - p.them).toFixed(1)}" r="7"><title>${p.us}:${p.them}</title></circle>`)
        .join('');
      const last = flow[flow.length - 1];
      return `<figure class="chart">
        <figcaption>Партия ${s.number} · ${score(s.score)}</figcaption>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Разница в счёте по ходу партии ${s.number}">
          <line class="grid" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}"/>
          <text class="axis" x="2" y="12">+${max}</text><text class="axis" x="2" y="${H - 3}">−${max}</text>
          <polyline class="line" points="${pts}"/>
          <circle class="end" cx="${x(flow.length - 1).toFixed(1)}" cy="${y(last.us - last.them).toFixed(1)}" r="4"/>
          ${hits}
        </svg></figure>`;
    })
    .join('');
  return `<section class="report-block"><div class="rb-head"><h3>График счёта</h3></div>
    <p class="hint">Разница очков по ходу партии: выше линии — ведёт ${h(match.teamName)}, ниже — ${h(match.opponent)}. Наведите на точку, чтобы увидеть счёт.</p>
    <div class="charts">${charts}</div></section>`;
}

// ---------- Players ----------

const PLAYER_TABS = [
  ['overview', 'Обзор'],
  ['attack', 'Атака'],
  ['serve', 'Подача'],
  ['reception', 'Приём'],
  ['defense', 'Защита'],
  ['block', 'Блок'],
  ['sets', 'Передачи'],
];

const PLAYER_TAB_SKILL = { attack: 'A', serve: 'S', reception: 'R', defense: 'D', block: 'B', sets: 'E' };

function playerColumns(tab) {
  const fixed = [
    text('№', (r) => r.number ?? '', true),
    text('Игрок', (r) => r.nameHtml, true),
    text('Амплуа', (r) => r.pos, true),
  ];
  const L = (r) => r.line;
  switch (tab) {
    case 'attack':
      return [
        ...fixed,
        num('TA', (r) => L(r).attack.TA, 'K + E + B + C'),
        num('K', (r) => L(r).attack.K),
        num('E', (r) => L(r).attack.E, 'Собственные ошибки: аут, сетка, нарушение; без блока'),
        num('B', (r) => L(r).attack.B, 'Заблокировано в очко'),
        num('C', (r) => L(r).attack.C, 'Атака оставлена в игре'),
        per('Kill %', (r) => L(r).attack.killPct, 'K / TA'),
        per('Eff %', (r) => L(r).attack.effPct, '(K − E − B) / TA'),
        num('После R: TA', (r) => L(r).attack.afterR.ta, 'Первая атака владения, начатого приёмом'),
        per('После R: Kill %', (r) => L(r).attack.afterR.pct),
        num('После D: TA', (r) => L(r).attack.afterD.ta),
        per('После D: Kill %', (r) => L(r).attack.afterD.pct),
        num('После F/C: TA', (r) => L(r).attack.afterFC.ta),
        per('После F/C: Kill %', (r) => L(r).attack.afterFC.pct),
        num('Неизв. исход', (r) => L(r).attack.unknown),
      ];
    case 'serve':
      return [
        ...fixed,
        num('Подачи', (r) => L(r).serve.total),
        num('Эйсы', (r) => L(r).serve.aces),
        num('Ошибки', (r) => L(r).serve.errors),
        per('Ace %', (r) => L(r).serve.acePct, 'Эйсы / все подачи'),
        per('Error %', (r) => L(r).serve.errorPct, 'Ошибки / все подачи'),
        frac('Давление', (r) => L(r).serve.pressure, 'Приёмы соперника R− или R/ / известные приёмы после подач в игру; эйсы отдельно'),
        frac('BP на его подачах', (r) => r.serveRun.bp, 'Выигранные розыгрыши / розыгрыши на его подаче'),
        num('Макс. серия', (r) => r.serveRun.maxRun ?? '—', 'Наибольшее число подряд выигранных розыгрышей на его подаче'),
      ];
    case 'reception':
      return [
        ...fixed,
        num('Все R', (r) => L(r).R.total),
        num('Оценено', (r) => L(r).R.graded),
        num('#', (r) => L(r).R.c('#')),
        num('+', (r) => L(r).R.c('+')),
        num('!', (r) => L(r).R.c('!')),
        num('−', (r) => L(r).R.c('-')),
        num('/', (r) => L(r).reception.slash),
        num('=', (r) => L(r).R.c('=')),
        per('Perfect %', (r) => L(r).reception.perfect, 'R# / приёмы с известной оценкой'),
        per('Positive %', (r) => L(r).reception.positive, '(R# + R+) / приёмы с известной оценкой; включает Perfect'),
        per('Error %', (r) => L(r).reception.error, 'R= / приёмы с известной оценкой'),
        num('Перелёты', (r) => L(r).reception.overpass),
        num('Не оценено', (r) => L(r).R.unknown),
      ];
    case 'defense':
      return [
        ...fixed,
        num('Успешные D', (r) => L(r).defense.success, 'Защиты, после которых мяч остался в игре'),
        num('#', (r) => L(r).D.c('#')),
        num('+', (r) => L(r).D.c('+')),
        num('!', (r) => L(r).D.c('!')),
        num('−', (r) => L(r).D.c('-')),
        num('/', (r) => L(r).D.c('/')),
        num('D=', (r) => L(r).defense.errors, 'Только зафиксированные ошибки; командные неуспехи без исполнителя сюда не входят'),
        per('Controlled %', (r) => L(r).defense.controlled, '(D# + D+ + D!) / успешные D с оценкой; не процент всех спасённых атак'),
        num('C', (r) => L(r).defense.cover, 'Страховка, не входит в D'),
        num('F', (r) => L(r).defense.free, 'Свободный мяч, не входит в D'),
        num('Не оценено', (r) => L(r).defense.unknown),
      ];
    case 'block':
      return [
        ...fixed,
        num('Одиночные блоки', (r) => L(r).block.solo),
        num('Участия в групповом', (r) => L(r).block.group, 'Не суммируются как командные очки'),
        num('Полезные касания', (r) => L(r).block.soft),
        num('Другие касания', (r) => L(r).block.other),
        num('Тех. ошибки', (r) => L(r).block.errors),
        num('Не оценено', (r) => L(r).block.unknown),
      ];
    case 'sets':
      return [
        ...fixed,
        num('Все E', (r) => L(r).E.total),
        num('Оценено', (r) => L(r).E.graded),
        num('#', (r) => L(r).E.c('#')),
        num('+', (r) => L(r).E.c('+')),
        num('!', (r) => L(r).E.c('!')),
        num('−', (r) => L(r).E.c('-')),
        num('/', (r) => L(r).E.c('/')),
        num('=', (r) => L(r).E.c('=')),
        per('Set quality %', (r) => L(r).setting.quality, '(E# + E+) / передачи с известной оценкой'),
        per('Set Error %', (r) => L(r).setting.error, 'E= / передачи с известной оценкой'),
        num('Assists', (r) => L(r).assists, 'Последнее подготовительное касание партнёра перед выигрышной атакой'),
        num('Связанные TA', (r) => L(r).setting.linkedTA),
        per('Kill after set %', (r) => L(r).setting.killAfterSet, 'K по связанным A / связанные A с известным исходом'),
      ];
    default:
      return [
        ...fixed,
        num('Партии', (r) => r.exposure?.sets ?? '', 'Партии хотя бы с одним розыгрышем на площадке'),
        num('Розыгрыши на площадке', (r) => r.exposure?.rallies ?? ''),
        num('K', (r) => L(r).attack.K),
        num('Эйсы', (r) => L(r).serve.aces),
        num('Одиночные блоки', (r) => L(r).block.solo),
        num('Участия в групп. блоке', (r) => L(r).block.group),
        per('Attack Eff %', (r) => L(r).attack.effPct, '(K − E − B) / TA'),
        per('Rec Positive %', (r) => L(r).reception.positive, '(R# + R+) / приёмы с оценкой'),
        num('Успешные D', (r) => L(r).defense.success),
        num('Assists', (r) => L(r).assists),
        per('Покрытие', (r) => L(r).coverage, 'Касания с оценкой / все записанные касания'),
      ];
  }
}

function playersTab(built, match, map) {
  const R = rs();
  const tab = R.playerTab;
  const rep = playersReport(built, match, commonFilters());
  const rows = rep.rows.map((r) => ({ ...r, nameHtml: h(r.name), pos: POSITION_SHORT[r.position] ?? '' }));
  const foot = [{ number: '', nameHtml: '<b>Команда</b>', pos: '', line: rep.team.line, serveRun: rep.team.serveRun, exposure: null }];
  if (rep.unassigned) foot.push({ number: '', nameHtml: 'Не распределено по игрокам', pos: '', line: rep.unassigned.line, serveRun: { bp: pct(0, 0), maxRun: null }, exposure: null });
  const cols = playerColumns(tab);
  const id = `players-${tab}`;
  TABLE_COLUMNS[id] = cols;
  const skill = PLAYER_TAB_SKILL[tab];
  const sub = `<div class="chips-row">${PLAYER_TABS.map(([k, l]) => `<button class="chip ${k === tab ? 'active' : ''}" data-act="rep-ptab" data-value="${k}">${l}</button>`).join('')}</div>`;
  const note =
    'Командная строка включает действия без известного игрока, поэтому может не совпадать с суммой строк. Групповые блоки не суммируются как очки игроков. Нажмите на игрока, чтобы открыть его эпизоды.';
  return (
    filterBar(built) +
    coverageBanner(built, match) +
    sub +
    tableHtml(id, `Игроки · ${PLAYER_TABS.find(([k]) => k === tab)[1]}`, cols, rows, {
      foot,
      note,
      rowAct: { act: 'rep-player', data: (r) => `data-id="${r.id}" data-skill="${skill ?? ''}"` },
    })
  );
}

actions['rep-ptab'] = ({ value }) => {
  rs().playerTab = value;
  render();
};

actions['rep-player'] = ({ id, skill }) => {
  const R = rs();
  const q = new URLSearchParams({ reset: '1', player: id });
  if (skill) q.set('skill', skill);
  if (R.set) q.set('set', R.set);
  if (R.p) q.set('p', R.p);
  go(`#/feed/${state.current.match.id}?${q}`);
};

// ---------- Setter ----------

function setterTab(built, match, map) {
  const R = rs();
  const S = R.setter;
  const f = { ...commonFilters(), setter: S.setter || null, phase: S.phase || null, system: S.system || null, input: S.input || null, line: S.line || null, target: S.target || null };
  const rep = setterReport(built, match, f);
  const label = (id) => (id ? h(`#${map.get(id)?.number ?? '?'} ${map.get(id)?.name ?? ''}`) : '<i>Адресат неизвестен</i>');
  const sel = (name, options) =>
    `<select data-change="rep-setter" data-name="${name}">${options.map(([v, l]) => `<option value="${h(v)}" ${String(S[name] ?? '') === String(v) ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
  const settersAll = [...new Set(built.rallies.flatMap((r) => r.touches).filter((t) => t.team === 'us' && t.skill === 'E' && t.player).map((t) => t.player))];
  const extra = `<div class="filters">
    ${sel('setter', [['', 'Все связующие'], ...settersAll.map((id) => [id, `#${map.get(id)?.number} ${map.get(id)?.name}`])])}
    ${sel('target', [['', 'Все получатели'], ...match.roster.map((p) => [p.playerId, `→ #${p.number} ${p.name}`])])}
    ${sel('phase', [['', 'Любой вход'], ['R', 'После приёма'], ['D', 'После защиты'], ['F', 'После свободного'], ['C', 'После страховки']])}
    ${sel('input', [['', 'Любое качество входа'], ['good', 'Вход # или +'], ['bad', 'Вход хуже +'], ['unk', 'Вход неизвестен']])}
    ${sel('system', [['', 'In/out любой'], ['in', 'In-system'], ['out', 'Out-of-system'], ['unk', 'Неизвестно']])}
    ${sel('line', [['', 'Любая линия'], ['front', 'Связующий в передней'], ['back', 'Связующий в задней']])}
  </div>`;

  const mainCols = [
    text('Связующий', (r) => label(r.id), true),
    num('Партии', (r) => r.exposure.sets),
    num('Розыгрыши активным', (r) => r.activeRallies),
    num('Все E', (r) => r.total),
    num('Оценено', (r) => r.graded),
    num('Не оценено', (r) => r.unknown),
    num('E#', (r) => r.counts['#']),
    num('E+', (r) => r.counts['+']),
    num('E!', (r) => r.counts['!']),
    num('E−', (r) => r.counts['-']),
    num('E/', (r) => r.counts['/']),
    num('E=', (r) => r.counts['=']),
    per('Точные %', (r) => r.exact, 'E# / оценённые E'),
    per('Set quality %', (r) => r.quality, '(E# + E+) / оценённые E'),
    per('Set Error %', (r) => r.error, 'E= / оценённые E; перелёты E/ отдельно'),
    num('Связанные TA', (r) => r.ta),
    num('K', (r) => r.K),
    num('E атаки', (r) => r.AE),
    num('B атаки', (r) => r.AB),
    per('Kill after set %', (r) => r.killPct, 'K по связанным A / связанные A с известным исходом'),
    per('Eff after set %', (r) => r.effPct, '(K − E атаки − B атаки) / связанные TA'),
    num('Assists', (r) => r.assists),
    num('In-system', (r) => r.inSystem),
    num('Out-of-system', (r) => r.outSystem),
    num('Вход неизв.', (r) => r.systemUnknown),
    num('Передняя линия', (r) => r.front),
    num('Задняя линия', (r) => r.back),
  ];
  TABLE_COLUMNS['setter-main'] = mainCols;

  const matrixCols = [
    text('Связующий', (r) => label(r.setter), true),
    text('Нападающий', (r) => label(r.target), true),
    num('Передачи', (r) => r.total),
    per('Доля', (r) => r.share, 'Передачи адресату / передачи с известным адресатом'),
    per('E quality %', (r) => r.quality),
    num('TA', (r) => r.ta, 'Передачи без атаки входят в распределение, но не в TA'),
    num('K', (r) => r.K),
    num('E', (r) => r.AE),
    num('B', (r) => r.AB),
    per('Kill %', (r) => r.killPct),
    per('Eff %', (r) => r.effPct),
    per('Вход #/+', (r) => r.inputGood, 'Доля передач после входящего мяча # или + среди передач с известным входом'),
    per('Покрытие', (r) => r.coverage, 'Оценённые E / все E'),
  ];
  TABLE_COLUMNS['setter-matrix'] = matrixCols;

  const dirCols = [
    text('Направление', (r) => (r.key ? DIRECTIONS[r.key] : '<i>Неизвестно</i>'), true),
    num('Передачи', (r) => r.total),
    per('Доля %', (r) => r.share, 'Передачи в направлении / передачи с известным направлением'),
    per('E quality %', (r) => r.quality),
    num('TA', (r) => r.ta),
    num('K', (r) => r.K),
    per('Kill %', (r) => r.killPct),
    per('Eff %', (r) => r.effPct),
  ];
  TABLE_COLUMNS['setter-dir'] = dirCols;

  const caution =
    'Высокая доля передач одному нападающему не доказывает плохое распределение: другие могли быть недоступны. Результат атаки зависит от приёма, нападающего и блока — это наблюдения с N, а не оценка связующего.';
  return (
    filterBar(built) +
    extra +
    coverageBanner(built, match) +
    tableHtml('setter-main', 'Связующие', mainCols, rep.main, { note: `Всего передач в фильтре: ${rep.count}.` }) +
    tableHtml('setter-matrix', 'Матрица связующий — нападающий', matrixCols, rep.matrix, { note: caution }) +
    tableHtml('setter-dir', 'Направления', dirCols, rep.directions, { note: 'Первый темп выделен отдельно от зоны 3, строки не дублируются.' })
  );
}

changes['rep-setter'] = (el) => {
  rs().setter[el.dataset.name] = el.value;
  render();
};

// ---------- Rotations ----------

function miniCourt(snap, map) {
  const byPos = new Map(snap.court.map((c) => [c.pos, c]));
  const cell = (pos) => {
    const c = byPos.get(pos);
    const p = map.get(c.player);
    return `<div class="mc ${[2, 3, 4].includes(pos) ? 'front' : ''} ${c.player === snap.setter ? 'setter' : ''} ${c.libero ? 'libero' : ''}">${p?.number ?? '?'}</div>`;
  };
  return `<div class="mini-court">${[4, 3, 2, 5, 6, 1].map(cell).join('')}</div>`;
}

function rotationsTab(built, match, map) {
  const R = rs();
  const f = { ...commonFilters(), pLabel: null };
  const rows = rotationsReport(built, match, f, R.key);
  const keySel = `<div class="filters"><span class="muted">Ключ сравнения:</span>
    <button class="chip ${R.key === 'p' ? 'active' : ''}" data-act="rep-key" data-value="p">P-метка (по связующему)</button>
    <button class="chip ${R.key === 'shift' ? 'active' : ''}" data-act="rep-key" data-value="shift">Схема партии + сдвиг</button></div>`;
  const cards = rows
    .map(
      (r) => `<a class="rot-card" href="#/feed/${match.id}?reset=1${r.key.startsWith('P') ? `&p=${r.key}` : ''}">
      <div class="rot-key">${h(r.key)}</div>${miniCourt(r.snap, map)}
      <div class="rot-nums"><div><span>SO</span><b class="${isSmall(r.so) ? 'few' : ''}">${fmtPct(r.so)}</b><small>${r.so.num}/${r.so.den}</small></div>
      <div><span>BP</span><b class="${isSmall(r.bp) ? 'few' : ''}">${fmtPct(r.bp)}</b><small>${r.bp.num}/${r.bp.den}</small></div></div></a>`
    )
    .join('');
  const label = (id) => (id ? h(`#${map.get(id)?.number ?? '?'}`) : '—');
  const cols = [
    text('Расстановка', (r) => h(r.key), true),
    text('Связующий', (r) => label(r.setter)),
    text('Его линия', (r) => (r.setterLine === 'front' ? 'передняя' : r.setterLine === 'back' ? 'задняя' : '—')),
    text('Передняя тройка', (r) => r.front.map(label).join(' ')),
    text('Либеро', (r) => label(r.libero)),
    num('N', (r) => r.n),
    num('W', (r) => r.W),
    num('L', (r) => r.L),
    num('W−L', (r) => r.W - r.L),
    num('N приём', (r) => r.recvN),
    num('SO W', (r) => r.soW),
    per('SO %', (r) => r.so),
    num('N подача', (r) => r.serveN),
    num('BP W', (r) => r.bpW),
    per('BP %', (r) => r.bp),
    per('Rec Positive %', (r) => r.recPositive),
    num('TA', (r) => r.ta),
    per('Eff %', (r) => r.eff),
  ];
  TABLE_COLUMNS.rotations = cols;

  const rec = receptionByRotation(built, match, f);
  const recCols = [
    text('P', (r) => h(r.key), true),
    text('Принимающие', (r) => r.receivers.map((x) => `#${map.get(x.id)?.number ?? '?'} (${x.n})`).join(', ')),
    num('R N', (r) => r.n),
    num('#', (r) => r.counts['#'] ?? 0),
    num('+', (r) => r.counts['+'] ?? 0),
    num('!', (r) => r.counts['!'] ?? 0),
    num('−', (r) => r.counts['-'] ?? 0),
    num('/', (r) => (r.counts['/o'] ?? 0) + (r.counts['/f'] ?? 0)),
    num('=', (r) => r.counts['='] ?? 0),
    per('Positive %', (r) => r.positive),
    num('Первые TA', (r) => r.firstTA),
    per('First attack kill %', (r) => r.firstKill, 'Выигрышные первые атаки после R / первые атаки после R с известным исходом; это не SO %'),
    per('SO in play %', (r) => r.soInPlay),
    num('Не оценено', (r) => r.unknown),
  ];
  TABLE_COLUMNS['rot-rec'] = recCols;

  const lineups = lineupsReport(built, match, commonFilters());
  const lCols = [
    text('Состав на площадке', (r) => r.players.map(label).join(' '), true),
    text('Связующий', (r) => label(r.setter)),
    num('N', (r) => r.n),
    num('W', (r) => r.W),
    num('L', (r) => r.L),
    num('W−L', (r) => r.W - r.L),
    frac('SO', (r) => r.so),
    frac('BP', (r) => r.bp),
    num('TA', (r) => r.ta),
    per('Eff %', (r) => r.eff),
    per('Покрытие', (r) => r.coverage),
  ];
  TABLE_COLUMNS.lineups = lCols;

  return (
    filterBar(built, { p: false }) +
    keySel +
    coverageBanner(built, match) +
    `<section class="report-block"><div class="rb-head"><h3>Шесть расстановок</h3></div>
      <p class="hint">Номера игроков по позициям (сетка сверху), связующий выделен. SO — победы на приёме, BP — на своей подаче. Нажмите карточку, чтобы открыть её розыгрыши.</p>
      <div class="rot-cards">${cards || '<p class="hint">Нет розыгрышей</p>'}</div></section>` +
    tableHtml('rotations', 'Расстановки', cols, rows) +
    tableHtml('rot-rec', 'Приём в расстановке', recCols, rec) +
    tableHtml('lineups', 'Составы', lCols, lineups, { note: 'Фактические шесть игроков на площадке с учётом либеро и замен.' })
  );
}

actions['rep-key'] = ({ value }) => {
  rs().key = value;
  render();
};

// ---------- Runs ----------

function runsTab(built, match, map) {
  const R = rs();
  const runs = runsReport(built, match, 3).filter((r) => !R.set || String(r.set) === R.set);
  const cols = [
    text('Партия', (r) => r.set, true),
    text('Команда', (r) => (r.team === 'us' ? h(match.teamName) : h(match.opponent))),
    text('Начало', (r) => score(r.from)),
    text('Конец', (r) => score(r.to)),
    text('Подавал', (r) => (r.serving === 'us' ? (r.server ? `#${map.get(r.server)?.number ?? '?'}` : 'мы') : 'соперник')),
    text('Расстановка', (r) => r.pLabel ?? '—'),
    num('Подряд', (r) => r.length),
    text('Причины очков', (r) => Object.entries(r.reasons).map(([k, n]) => `${REASONS[k] ?? k}: ${n}`).join(', ')),
    text('Тайм-аут / замена внутри', (r) => (r.interruptions.length ? r.interruptions.map((k) => ({ timeout: 'тайм-аут', sub: 'замена', libero: 'либеро' })[k]).join(', ') : '—')),
  ];
  TABLE_COLUMNS.runs = cols;
  return (
    `<div class="filters"><select data-change="rep-filter" data-name="set"><option value="">Весь матч</option>${built.sets
      .map((s) => `<option value="${s.number}" ${String(s.number) === R.set ? 'selected' : ''}>Партия ${s.number}</option>`)
      .join('')}</select></div>` +
    tableHtml('runs', 'Серии от трёх розыгрышей подряд', cols, runs, { note: 'Санкции вне розыгрышей в серии не входят.' })
  );
}
