import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../docs/js/domain.js';

const newMatch = (over = {}) => ({
  id: 'm1', teamId: 't1', teamName: 'Мы', opponent: 'Они', tournament: '', date: '2026-10-29T18:00:00.000Z',
  bestOf: 5, pointsPerSet: 25, decidingSetPoints: 15, currentSet: 1, isFinished: false, events: [], ...over,
});
const p1 = { id: 'p1', name: 'Иванов', number: 7 };
const p2 = { id: 'p2', name: 'Петров', number: 3 };

function winSet(m, side, points) {
  for (let i = 0; i < points; i++) D.recordEvent(m, side === 'us' ? 'opponentError' : 'opponentPoint', 'neutral', null);
}

test('point attribution', () => {
  assert.equal(D.pointWinner('serve', 'perfect'), 'us');
  assert.equal(D.pointWinner('attack', 'perfect'), 'us');
  assert.equal(D.pointWinner('block', 'perfect'), 'us');
  assert.equal(D.pointWinner('attack', 'blocked'), 'them');
  assert.equal(D.pointWinner('reception', 'error'), 'them');
  assert.equal(D.pointWinner('dig', 'error'), 'them');
  assert.equal(D.pointWinner('reception', 'perfect'), null);
  assert.equal(D.pointWinner('attack', 'neutral'), null);
  assert.equal(D.pointWinner('block', 'positive'), null);
  assert.equal(D.pointWinner('opponentError', 'neutral'), 'us');
  assert.equal(D.pointWinner('teamError', 'neutral'), 'them');
});

test('every pad button has a label', () => {
  for (const [skill, def] of Object.entries(D.SKILLS)) {
    for (const o of def.outcomes) assert.notEqual(D.outcomeTitle(skill, o), o, `${skill}/${o}`);
  }
});

test('set end needs target and two-point lead', () => {
  const m = newMatch();
  winSet(m, 'us', 24);
  winSet(m, 'them', 24);
  assert.equal(D.scoreboard(m).currentRuleWinner, null);
  winSet(m, 'us', 1);
  assert.equal(D.scoreboard(m).currentRuleWinner, null);
  winSet(m, 'us', 1);
  assert.equal(D.scoreboard(m).currentRuleWinner, 'us');
});

test('deciding set plays to 15 and match finishes', () => {
  const m = newMatch({ bestOf: 3 });
  winSet(m, 'us', 25); D.closeCurrentSet(m);
  winSet(m, 'them', 25); D.closeCurrentSet(m);
  assert.equal(m.currentSet, 3);
  winSet(m, 'us', 15);
  const board = D.scoreboard(m);
  assert.equal(board.currentRuleWinner, 'us');
  assert.equal(D.closingEndsMatch(m, board, 'us'), true);
  D.closeCurrentSet(m);
  assert.equal(m.isFinished, true);
  const final = D.scoreboard(m);
  assert.deepEqual([final.setsUs, final.setsThem], [2, 1]);
});

test('3:0 in best of five finishes after the third set', () => {
  const m = newMatch();
  for (let i = 0; i < 3; i++) { winSet(m, 'us', 25); D.closeCurrentSet(m); }
  assert.equal(m.isFinished, true);
  assert.equal(m.currentSet, 3);
});

test('undo reopens a closed set and a finished match', () => {
  const m = newMatch({ bestOf: 3 });
  winSet(m, 'us', 25); D.closeCurrentSet(m);
  assert.equal(m.currentSet, 2);
  D.undoLast(m);
  assert.equal(m.currentSet, 1);
  assert.equal(D.scoreboard(m).current.us, 24);

  winSet(m, 'us', 1); D.closeCurrentSet(m);
  winSet(m, 'us', 25); D.closeCurrentSet(m);
  assert.equal(m.isFinished, true);
  D.undoLast(m);
  assert.equal(m.isFinished, false);
  assert.equal(m.currentSet, 2);
  assert.equal(D.scoreboard(m).current.us, 24);
});

test('undo on empty match is harmless', () => {
  const m = newMatch();
  assert.equal(D.undoLast(m), null);
  assert.equal(m.currentSet, 1);
});

test('player stats and team totals', () => {
  const m = newMatch();
  D.recordEvent(m, 'attack', 'perfect', p1);
  D.recordEvent(m, 'attack', 'perfect', p1);
  D.recordEvent(m, 'attack', 'error', p1);
  D.recordEvent(m, 'attack', 'blocked', p1);
  D.recordEvent(m, 'attack', 'neutral', p1);
  D.recordEvent(m, 'serve', 'perfect', p2);
  D.recordEvent(m, 'serve', 'error', p2);
  D.recordEvent(m, 'reception', 'perfect', p2);
  D.recordEvent(m, 'reception', 'positive', p2);
  D.recordEvent(m, 'reception', 'poor', p2);
  D.recordEvent(m, 'reception', 'error', p2);
  D.recordEvent(m, 'opponentError', 'neutral', null);

  const table = D.statsTable(m, [p1, p2]);
  assert.deepEqual(table.players.map((r) => r.number), [3, 7]);
  const ivanov = table.players[1].line;
  assert.equal(ivanov.kills, 2);
  assert.equal(ivanov.total('attack'), 5);
  assert.equal(ivanov.attackEfficiency, 0);
  assert.equal(ivanov.killRate, 0.4);
  assert.equal(ivanov.errors, 2);
  assert.equal(ivanov.plusMinus, 0);

  const petrov = table.players[0].line;
  assert.equal(petrov.points, 1);
  assert.equal(petrov.receptionPositiveRate, 0.5);
  assert.equal(petrov.receptionPerfectRate, 0.25);
  assert.equal(D.pct(petrov.aceRate), '50%');

  assert.equal(table.team.line.points, 3);
  assert.equal(table.team.line.errors, 4);
  const board = D.scoreboard(m);
  assert.deepEqual([board.current.us, board.current.them], [4, 4]);
});

test('stats filter by set and keep deleted players by snapshot', () => {
  const m = newMatch();
  D.recordEvent(m, 'attack', 'perfect', p1);
  m.currentSet = 2;
  D.recordEvent(m, 'block', 'perfect', p2);
  assert.equal(D.statsTable(m, [p1, p2], 1).players.length, 1);
  assert.equal(D.statsTable(m, [p1, p2], 2).players[0].name, 'Петров');
  const gone = D.statsTable(m, []);
  assert.deepEqual(gone.players.map((r) => r.name), ['Петров', 'Иванов']);
});

test('csv escapes and has one row per player plus team', () => {
  const m = newMatch({ opponent: 'Динамо; "Москва"' });
  D.recordEvent(m, 'attack', 'perfect', p1);
  const csv = D.matchCsv(m, [p1]);
  const lines = csv.split('\n');
  assert.ok(lines[0].includes('"Мы — Динамо; ""Москва"""'));
  const header = lines.findIndex((l) => l.startsWith('№;Игрок'));
  assert.equal(lines.length - header - 1, 2);
  const columns = lines[header].split(';').length;
  assert.equal(lines[header + 1].split(';').length, columns);
  assert.equal(D.csvFileName(m), 'volley_2026-10-29_Динамо_Москва.csv');
});
