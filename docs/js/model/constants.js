// Vocabulary of the Club v1 scale (spec §4, §6–8). Pure data, shared by the engine, reports and UI.

export const SCALE_VERSION = 'Club v1';
export const DATA_VERSION = 2;

export const SKILLS = {
  S: { title: 'Подача', short: 'Под' },
  R: { title: 'Приём', short: 'Пр' },
  E: { title: 'Передача', short: 'Пас' },
  A: { title: 'Атака', short: 'Атк' },
  B: { title: 'Блок', short: 'Бл' },
  D: { title: 'Защита', short: 'Защ' },
  C: { title: 'Страховка', short: 'Стр' },
  F: { title: 'Свободный мяч', short: 'Своб' },
};
export const SKILL_ORDER = ['S', 'R', 'E', 'A', 'B', 'D', 'C', 'F'];

const quality = (extra = {}) => ({
  '#': { label: 'Отлично', ...extra['#'] },
  '+': { label: 'Хорошо', ...extra['+'] },
  '!': { label: 'Средне', ...extra['!'] },
  '-': { label: 'Плохо', ...extra['-'] },
  '/': { label: 'Перелёт', ...extra['/'] },
  '=': { label: 'Ошибка', ...extra['='] },
});

/**
 * Grades per skill. `tone` drives colour only; the symbol and text are always shown next to it.
 * `ends`: 'own' — the team that made the touch wins the rally, 'opp' — the other team wins.
 */
export const GRADES = {
  S: {
    '#': { label: 'Эйс', tone: 'good', ends: 'own' },
    in: { label: 'В игре', symbol: '·', tone: 'neutral' },
    '=': { label: 'Ошибка', tone: 'bad', ends: 'opp' },
  },
  // Reception "/" always carries a subtype (spec §6), so there is no plain "/" grade here.
  R: {
    '#': { label: 'Отлично', tone: 'good' },
    '+': { label: 'Хорошо', tone: 'good' },
    '!': { label: 'Средне', tone: 'neutral' },
    '-': { label: 'Плохо', tone: 'warn' },
    '/o': { label: 'Перелёт', symbol: '/', tone: 'warn' },
    '/f': { label: 'Вынужд. свободный', symbol: '/', tone: 'warn' },
    '=': { label: 'Ошибка', tone: 'bad', ends: 'opp' },
  },
  E: quality({
    '#': { label: 'Точная', tone: 'good' },
    '+': { label: 'Хорошая', tone: 'good' },
    '!': { label: 'Огранич.', tone: 'neutral' },
    '-': { label: 'Аварийная', tone: 'warn' },
    '/': { tone: 'warn' },
    '=': { tone: 'bad', ends: 'opp' },
  }),
  A: {
    K: { label: 'Очко', symbol: '#', tone: 'good', ends: 'own' },
    C: { label: 'В игре', symbol: '!', tone: 'neutral' },
    B: { label: 'Блок', symbol: '/', tone: 'bad', ends: 'opp' },
    E: { label: 'Ошибка', symbol: '=', tone: 'bad', ends: 'opp' },
  },
  B: {
    P: { label: 'Очко', symbol: '#', tone: 'good', ends: 'own' },
    S: { label: 'Смягчил', symbol: '+', tone: 'good' },
    T: { label: 'Касание', symbol: '!', tone: 'neutral' },
    R: { label: 'Отскок', symbol: '-', tone: 'warn' },
    '=': { label: 'Ошибка', tone: 'bad', ends: 'opp' },
  },
  D: quality({
    '#': { tone: 'good' },
    '+': { tone: 'good' },
    '!': { tone: 'neutral' },
    '-': { label: 'Спасение', tone: 'warn' },
    '/': { tone: 'warn' },
    '=': { label: 'Не сохранил', tone: 'bad', ends: 'opp' },
  }),
  C: {
    ctl: { label: 'Контроль', symbol: '+', tone: 'good' },
    lim: { label: 'Огранич.', symbol: '!', tone: 'neutral' },
    ovp: { label: 'Перелёт', symbol: '/', tone: 'warn' },
    '=': { label: 'Ошибка', tone: 'bad', ends: 'opp' },
  },
  F: {
    ctl: { label: 'Контроль', symbol: '+', tone: 'good' },
    lim: { label: 'Огранич.', symbol: '!', tone: 'neutral' },
    ovp: { label: 'Перелёт', symbol: '/', tone: 'warn' },
    '=': { label: 'Ошибка', tone: 'bad', ends: 'opp' },
  },
};

export const UNKNOWN_GRADE = '?';

export function gradeInfo(skill, grade) {
  if (grade === UNKNOWN_GRADE) return { label: 'Не оценено', symbol: '?', tone: 'neutral' };
  const g = GRADES[skill]?.[grade];
  if (!g) return { label: grade, symbol: grade, tone: 'neutral' };
  return { symbol: grade.length === 1 ? grade : grade[0], ...g };
}

/** Which side wins the rally because of this touch, or null when play continues. */
export function touchWinner(touch) {
  const ends = GRADES[touch.skill]?.[touch.grade]?.ends;
  if (!ends) return null;
  return ends === 'own' ? touch.team : other(touch.team);
}

export const other = (team) => (team === 'us' ? 'them' : 'us');

export const ATTACK_TYPES = {
  power: 'Силовой',
  roll: 'Накат',
  tip: 'Скидка',
  dump: 'Скидка связующего',
  overpass: 'Атака переходящего',
};

/** Attack directions for the setter distribution table (spec §13). First tempo wins over zone 3. */
export const DIRECTIONS = {
  z4: 'Зона 4',
  quick: 'Первый темп',
  z2: 'Зона 2',
  pipe: 'Пайп',
  z1: 'Задняя зона 1',
  other: 'Другое',
};

export const SERVE_TYPES = { float: 'Планер', jumpfloat: 'Планер в прыжке', power: 'Силовая', other: 'Другая' };

export const SYSTEM = { in: 'In-system', out: 'Out-of-system', unk: 'Неизвестно' };

export const DIFFICULTY = { normal: 'Обычная', hard: 'Сложная', unk: 'Неизвестно' };

export const POSITIONS = {
  setter: 'Связующий',
  outside: 'Доигровщик',
  opposite: 'Диагональный',
  middle: 'Центральный',
  libero: 'Либеро',
  universal: 'Универсал',
};

export const POSITION_SHORT = {
  setter: 'Св',
  outside: 'Д',
  opposite: 'Дг',
  middle: 'Ц',
  libero: 'Л',
  universal: 'У',
};

/** Why a rally was won. Sum over these equals the team's points (spec §14). */
export const REASONS = {
  kill: 'Атака',
  ace: 'Эйс',
  block: 'Блок',
  error: 'Ошибка соперника',
  serveError: 'Ошибка подачи соперника',
  unknown: 'Причина не установлена',
};

export const SYSTEMS = { '5-1': '5–1', '6-2': '6–2', '4-2': '4–2' };

export const RULE_PROFILES = {
  fivb2025: {
    name: 'FIVB 2025–2028',
    bestOf: 5,
    pointsPerSet: 25,
    decidingSetPoints: 15,
    winBy: 2,
    subsPerSet: 6,
    liberoCanServe: false,
  },
  custom: {
    name: 'Пользовательский',
    bestOf: 5,
    pointsPerSet: 25,
    decidingSetPoints: 15,
    winBy: 2,
    subsPerSet: 6,
    liberoCanServe: false,
  },
};

export const FRONT_ROW = [2, 3, 4];
export const isFront = (pos) => FRONT_ROW.includes(pos);
