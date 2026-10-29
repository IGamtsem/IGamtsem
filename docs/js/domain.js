// Volleyball domain: skills, scoring and statistics. No DOM access, so it runs under Node tests too.

export const SKILLS = {
  serve: { title: 'Подача', outcomes: ['perfect', 'positive', 'neutral', 'error'] },
  reception: { title: 'Приём', outcomes: ['perfect', 'positive', 'poor', 'error'] },
  attack: { title: 'Атака', outcomes: ['perfect', 'neutral', 'blocked', 'error'] },
  block: { title: 'Блок', outcomes: ['perfect', 'positive', 'error'] },
  dig: { title: 'Защита', outcomes: ['positive', 'error'] },
  set: { title: 'Пас', outcomes: ['positive', 'poor', 'error'] },
  opponentError: { title: 'Ошибка соперника', outcomes: ['neutral'], team: true },
  opponentPoint: { title: 'Очко соперника', outcomes: ['neutral'], team: true },
  teamError: { title: 'Наша ошибка', outcomes: ['neutral'], team: true },
};

export const PLAYER_SKILLS = ['serve', 'reception', 'attack', 'block', 'dig', 'set'];
export const TEAM_SKILLS = ['opponentError', 'opponentPoint', 'teamError'];

const OUTCOME_TITLES = {
  serve: { perfect: 'Эйс', positive: 'Сложная', neutral: 'В игре' },
  reception: { perfect: 'Идеально', positive: 'Хорошо', poor: 'Плохо' },
  attack: { perfect: 'Очко', neutral: 'В игре', blocked: 'Блок' },
  block: { perfect: 'Очко', positive: 'Касание' },
  dig: { positive: 'Поднял' },
  set: { positive: 'Точный', poor: 'Неточный' },
};

export function outcomeTitle(skill, outcome) {
  if (SKILLS[skill]?.team) return SKILLS[skill].title;
  if (outcome === 'error') return 'Ошибка';
  return OUTCOME_TITLES[skill]?.[outcome] ?? outcome;
}

export const POSITIONS = {
  setter: 'Связующий',
  outside: 'Доигровщик',
  opposite: 'Диагональный',
  middle: 'Центральный',
  libero: 'Либеро',
  universal: 'Универсал',
};

/** 'us', 'them' or null when the rally goes on. */
export function pointWinner(skill, outcome) {
  if (skill === 'opponentError') return 'us';
  if (skill === 'opponentPoint' || skill === 'teamError') return 'them';
  if (outcome === 'perfect' && (skill === 'serve' || skill === 'attack' || skill === 'block')) return 'us';
  if (outcome === 'error' || (skill === 'attack' && outcome === 'blocked')) return 'them';
  return null;
}

// ---------- Match rules and score ----------

export function setTarget(match, number) {
  return number === match.bestOf ? match.decidingSetPoints : match.pointsPerSet;
}

export function setsToWin(match) {
  return Math.floor(match.bestOf / 2) + 1;
}

/** Winner of a set by the rules (target reached with a two-point lead), or null. */
export function ruleWinner(match, us, them, number) {
  const target = setTarget(match, number);
  if (us >= target && us - them >= 2) return 'us';
  if (them >= target && them - us >= 2) return 'them';
  return null;
}

/** Score derived from the events. Nothing about the score is stored separately. */
export function scoreboard(match) {
  const current = Math.max(match.currentSet, 1);
  const sets = [];
  for (let n = 1; n <= current; n++) {
    sets.push({ number: n, us: 0, them: 0, completed: n < current || match.isFinished, winner: null });
  }
  for (const e of match.events) {
    if (e.set < 1 || e.set > current) continue;
    const w = pointWinner(e.skill, e.outcome);
    if (w) sets[e.set - 1][w] += 1;
  }
  for (const s of sets) {
    if (s.completed && s.us !== s.them) s.winner = s.us > s.them ? 'us' : 'them';
  }
  const cur = sets[sets.length - 1];
  return {
    sets,
    current: cur,
    setsUs: sets.filter((s) => s.winner === 'us').length,
    setsThem: sets.filter((s) => s.winner === 'them').length,
    currentRuleWinner: ruleWinner(match, cur.us, cur.them, current),
  };
}

/** Whether closing the current set for `side` also decides the match. */
export function closingEndsMatch(match, board, side) {
  const won = side === 'us' ? board.setsUs : board.setsThem;
  return won + 1 >= setsToWin(match) || match.currentSet >= match.bestOf;
}

// ---------- Mutations on a plain match object ----------

export function recordEvent(match, skill, outcome, player) {
  const seq = match.events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  const event = {
    seq,
    ts: Date.now(),
    set: match.currentSet,
    skill,
    outcome,
    playerId: player?.id ?? null,
    playerNumber: player?.number ?? null,
    playerName: player?.name ?? null,
  };
  match.events.push(event);
  return event;
}

/** Removes the latest event. If the current set is still empty, the previous set is reopened first. */
export function undoLast(match) {
  if (match.events.length === 0) return null;
  const last = match.events.reduce((a, b) => (b.seq > a.seq ? b : a));
  if (last.set < match.currentSet && !match.events.some((e) => e.set === match.currentSet)) {
    match.currentSet = last.set;
  }
  match.isFinished = false;
  match.events = match.events.filter((e) => e !== last);
  return last;
}

export function closeCurrentSet(match) {
  const board = scoreboard(match);
  const { us, them } = board.current;
  if (us === them) return;
  if (closingEndsMatch(match, board, us > them ? 'us' : 'them')) {
    match.isFinished = true;
  } else {
    match.currentSet += 1;
  }
}

export function eventSummary(e) {
  if (SKILLS[e.skill]?.team) return SKILLS[e.skill].title;
  const who = e.playerNumber != null ? `#${e.playerNumber} ` : '';
  return `${who}${e.playerName ?? ''} · ${SKILLS[e.skill]?.title ?? e.skill}: ${outcomeTitle(e.skill, e.outcome)}`;
}

// ---------- Statistics ----------

export function statLine(events) {
  const t = {};
  for (const e of events) {
    t[e.skill] ??= {};
    t[e.skill][e.outcome] = (t[e.skill][e.outcome] ?? 0) + 1;
  }
  const c = (skill, outcome) => t[skill]?.[outcome] ?? 0;
  const total = (skill) => Object.values(t[skill] ?? {}).reduce((a, b) => a + b, 0);
  const ratio = (part, whole) => (whole > 0 ? part / whole : null);

  const aces = c('serve', 'perfect');
  const kills = c('attack', 'perfect');
  const blockPoints = c('block', 'perfect');
  const points = aces + kills + blockPoints;
  const errors = PLAYER_SKILLS.reduce((sum, s) => sum + c(s, 'error'), 0) + c('attack', 'blocked');

  return {
    c,
    total,
    aces,
    kills,
    blockPoints,
    points,
    errors,
    plusMinus: points - errors,
    killRate: ratio(kills, total('attack')),
    attackEfficiency: ratio(kills - c('attack', 'error') - c('attack', 'blocked'), total('attack')),
    aceRate: ratio(aces, total('serve')),
    serveErrorRate: ratio(c('serve', 'error'), total('serve')),
    receptionPositiveRate: ratio(c('reception', 'perfect') + c('reception', 'positive'), total('reception')),
    receptionPerfectRate: ratio(c('reception', 'perfect'), total('reception')),
  };
}

export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const signed = (v) => (v > 0 ? `+${v}` : `${v}`);

const col = (title, value) => ({ title, value });

export const CATEGORIES = [
  {
    id: 'summary',
    has: () => true,
    title: 'Итого',
    legend: 'Очки — эйсы, атаки и блоки, принёсшие очко. Ош — все ошибки, включая заблокированные атаки.',
    columns: [
      col('Очки', (l) => l.points),
      col('Эйс', (l) => l.aces),
      col('Атк', (l) => l.kills),
      col('Блк', (l) => l.blockPoints),
      col('Ош', (l) => l.errors),
      col('+/−', (l) => signed(l.plusMinus)),
    ],
  },
  {
    id: 'attack',
    has: (l) => l.total('attack') > 0,
    title: 'Атака',
    legend: 'Рез% — доля атак, принёсших очко. Эфф% = (очки − ошибки − блоки соперника) / всего атак.',
    columns: [
      col('Всего', (l) => l.total('attack')),
      col('Очко', (l) => l.kills),
      col('Ош', (l) => l.c('attack', 'error')),
      col('Блок', (l) => l.c('attack', 'blocked')),
      col('Рез%', (l) => pct(l.killRate)),
      col('Эфф%', (l) => pct(l.attackEfficiency)),
    ],
  },
  {
    id: 'serve',
    has: (l) => l.total('serve') > 0,
    title: 'Подача',
    legend: 'Слож — подача, после которой соперник не смог нормально принять.',
    columns: [
      col('Всего', (l) => l.total('serve')),
      col('Эйс', (l) => l.aces),
      col('Слож', (l) => l.c('serve', 'positive')),
      col('Ош', (l) => l.c('serve', 'error')),
      col('Эйс%', (l) => pct(l.aceRate)),
      col('Ош%', (l) => pct(l.serveErrorRate)),
    ],
  },
  {
    id: 'reception',
    has: (l) => l.total('reception') > 0,
    title: 'Приём',
    legend: '# идеально, + хорошо, − плохо. Пол% — доля идеальных и хороших, Отл% — только идеальных.',
    columns: [
      col('Всего', (l) => l.total('reception')),
      col('#', (l) => l.c('reception', 'perfect')),
      col('+', (l) => l.c('reception', 'positive')),
      col('−', (l) => l.c('reception', 'poor')),
      col('Ош', (l) => l.c('reception', 'error')),
      col('Пол%', (l) => pct(l.receptionPositiveRate)),
      col('Отл%', (l) => pct(l.receptionPerfectRate)),
    ],
  },
  {
    id: 'block',
    has: (l) => l.total('block') > 0,
    title: 'Блок',
    legend: 'Кас — касание блока, после которого мяч остался в игре.',
    columns: [
      col('Очко', (l) => l.blockPoints),
      col('Кас', (l) => l.c('block', 'positive')),
      col('Ош', (l) => l.c('block', 'error')),
    ],
  },
  {
    id: 'defense',
    has: (l) => l.total('dig') + l.total('set') > 0,
    title: 'Защита',
    legend: 'Защ — все записанные защиты. Пас — передачи, учтённые вручную.',
    columns: [
      col('Защ', (l) => l.total('dig')),
      col('Ош', (l) => l.c('dig', 'error')),
      col('Пас', (l) => l.total('set')),
      col('Неточ', (l) => l.c('set', 'poor')),
      col('Ош.пас', (l) => l.c('set', 'error')),
    ],
  },
];

/**
 * Per-player rows (only players with at least one action) plus a team total.
 * Names come from the current roster when the player still exists, otherwise from the event snapshot.
 */
export function statsTable(match, roster = [], setNumber = null) {
  const scoped = match.events.filter((e) => setNumber == null || e.set === setNumber);
  const byPlayer = new Map();
  for (const e of scoped) {
    if (!e.playerId) continue;
    if (!byPlayer.has(e.playerId)) byPlayer.set(e.playerId, []);
    byPlayer.get(e.playerId).push(e);
  }
  const players = [...byPlayer.entries()].map(([id, events]) => {
    const current = roster.find((p) => p.id === id);
    const last = events[events.length - 1];
    return {
      id,
      number: current?.number ?? last.playerNumber,
      name: current?.name ?? last.playerName ?? 'Игрок',
      line: statLine(events),
    };
  });
  players.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name));
  return { players, team: { id: 'team', number: null, name: 'Команда', line: statLine(scoped) } };
}

// ---------- CSV ----------

function csvCell(value) {
  const s = String(value);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvRow = (cells) => cells.map(csvCell).join(';');

/** Semicolon-separated, which Excel with a Russian locale opens as columns. */
export function matchCsv(match, roster = []) {
  const board = scoreboard(match);
  const table = statsTable(match, roster);
  const lines = [
    csvRow(['Матч', `${match.teamName} — ${match.opponent}`]),
    csvRow(['Дата', new Date(match.date).toLocaleString('ru-RU')]),
  ];
  if (match.tournament) lines.push(csvRow(['Турнир', match.tournament]));
  lines.push(csvRow(['Счёт по сетам', `${board.setsUs}:${board.setsThem}`]));
  lines.push(csvRow(['Сеты', ...board.sets.map((s) => `${s.us}:${s.them}`)]));
  lines.push('');

  const header = ['№', 'Игрок'];
  for (const cat of CATEGORIES) header.push(...cat.columns.map((c) => `${cat.title} ${c.title}`));
  lines.push(csvRow(header));
  for (const row of [...table.players, table.team]) {
    const cells = [row.number ?? '', row.name];
    for (const cat of CATEGORIES) cells.push(...cat.columns.map((c) => c.value(row.line)));
    lines.push(csvRow(cells));
  }
  return lines.join('\n');
}

export function csvFileName(match) {
  const d = new Date(match.date);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const opponent = match.opponent.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join('_') || 'match';
  return `volley_${day}_${opponent}.csv`;
}
