// Acceptance scenarios T01–T18 from the specification (§16), run against the pure model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatch, positionOfSlot } from '../docs/js/model/engine.js';
import { playersReport, teamReport, setterReport, distributionReport, rotationsReport } from '../docs/js/model/stats.js';
import { exportMatch, parseMatchExport } from '../docs/js/model/exchange.js';
import { RULE_PROFILES } from '../docs/js/model/constants.js';

// Lineup from the spec example (§11): positions 1–6 = M2, S, OH1, M1, O, OH2 → P2.
const P = {
  M2: { playerId: 'M2', number: 2, name: 'M2', position: 'middle' },
  S: { playerId: 'S', number: 1, name: 'S', position: 'setter' },
  OH1: { playerId: 'OH1', number: 4, name: 'OH1', position: 'outside' },
  M1: { playerId: 'M1', number: 11, name: 'M1', position: 'middle' },
  O: { playerId: 'O', number: 9, name: 'O', position: 'opposite' },
  OH2: { playerId: 'OH2', number: 7, name: 'OH2', position: 'outside' },
  L: { playerId: 'L', number: 17, name: 'L', position: 'libero' },
  X: { playerId: 'X', number: 13, name: 'X', position: 'outside' },
};
const LINEUP = ['M2', 'S', 'OH1', 'M1', 'O', 'OH2'];

function scenario({ firstServe = 'them', liberos = ['L'], profile = RULE_PROFILES.fivb2025 } = {}) {
  const match = { id: 'm', system: '5-1', profile, roster: Object.values(P), scale: 'Club v1' };
  const entries = [];
  let order = 0;
  const add = (type, data = {}) => {
    const e = { id: `e${++order}`, order, type, ...data };
    entries.push(e);
    return e;
  };
  add('setStart', { slots: LINEUP, liberos, firstServe });
  const api = {
    match,
    entries,
    add,
    touch: (team, player, skill, grade, extra = {}) => add('touch', { team, player, skill, grade, ...extra }),
    us: (player, skill, grade, extra) => api.touch('us', player, skill, grade, extra),
    them: (skill, grade, extra) => api.touch('them', null, skill, grade, extra),
    point: (winner, reason = 'unknown') => add('point', { winner, reason }),
    build: () => buildMatch(match, entries),
  };
  return api;
}

const val = (p) => (p.value == null ? null : Math.round(p.value * 1000) / 10);

test('T01 attack: K5 E2 B1 C2 → Kill 50%, Eff 20%, TA 10', () => {
  const s = scenario();
  const grades = ['K', 'K', 'K', 'K', 'K', 'E', 'E', 'B', 'C', 'C'];
  for (const g of grades) {
    s.us('OH1', 'A', g);
    if (g === 'C') s.point('them');
  }
  const team = playersReport(s.build(), s.match).team.line.attack;
  assert.equal(team.TA, 10);
  assert.equal(val(team.killPct), 50);
  assert.equal(val(team.effPct), 20);
});

test('T02 reception: #8 +4 !3 −2 /1 =2 → Perfect 40%, Positive 60%, Error 10%', () => {
  const s = scenario();
  const grades = [...Array(8).fill('#'), ...Array(4).fill('+'), ...Array(3).fill('!'), '-', '-', '/o', '=', '='];
  for (const g of grades) {
    s.us('OH1', 'R', g);
    if (g !== '=') s.point('them');
  }
  const r = playersReport(s.build(), s.match).team.line.reception;
  assert.equal(r.graded, 20);
  assert.equal(val(r.perfect), 40);
  assert.equal(val(r.positive), 60);
  assert.equal(val(r.error), 10);
});

test('T03 sets: #4 +3 !1 −1 =1 → quality 70%, error 10%; 8 linked A with K4 → kill after set 50%', () => {
  const s = scenario();
  const sets = ['#', '#', '#', '#', '+', '+', '+', '!', '-', '='];
  const attacks = ['K', 'K', 'K', 'K', 'E', 'C', 'C', 'B', null, null];
  sets.forEach((g, i) => {
    s.us('OH1', 'R', '+');
    s.us('S', 'E', g);
    if (g === '=') return;
    if (attacks[i]) {
      s.us('O', 'A', attacks[i]);
      if (attacks[i] === 'C') s.point('them');
    } else {
      s.point('them');
    }
  });
  const built = s.build();
  const setter = playersReport(built, s.match).rows.find((r) => r.id === 'S').line.setting;
  assert.equal(setter.total, 10);
  assert.equal(val(setter.quality), 70);
  assert.equal(val(setter.error), 10);
  assert.equal(setter.linkedTA, 8);
  assert.equal(val(setter.killAfterSet), 50);
});

test('T04 side-out: 10 receiving rallies, 6 won, 2 on serve errors → SO 60%, SO in play 50%', () => {
  const s = scenario();
  const results = ['win', 'win', 'win', 'win', 'serr', 'serr', 'lose', 'lose', 'lose', 'lose'];
  for (const r of results) {
    if (r === 'serr') s.them('S', '=');
    else {
      s.them('S', 'in');
      s.us('OH1', 'R', '+');
      s.point(r === 'win' ? 'us' : 'them');
    }
    if (r !== 'lose') s.point('them'); // lose our serve to receive again
  }
  const built = s.build();
  const total = teamReport(built, s.match).total;
  assert.equal(total.so.den, 10);
  assert.equal(val(total.so), 60);
  assert.equal(total.soInPlay.num, 4);
  assert.equal(total.soInPlay.den, 8);
  const receptions = built.rallies.flatMap((r) => r.touches).filter((t) => t.skill === 'R');
  assert.equal(receptions.length, 8, 'serve errors must not create receptions');
});

test('T05 P2 wins on reception → stats in P2, next rally P1 and S serves', () => {
  const s = scenario();
  s.them('S', 'in');
  s.us('OH1', 'R', '#');
  s.us('S', 'E', '#');
  s.us('OH1', 'A', 'K');
  const built = s.build();
  assert.equal(built.rallies[0].snap.pLabel, 'P2');
  const rot = rotationsReport(built, s.match);
  assert.equal(rot.find((r) => r.key === 'P2').W, 1);
  assert.equal(built.current.snap.pLabel, 'P1');
  assert.equal(built.current.serving, 'us');
  assert.equal(built.current.snap.court[0].player, 'S');
});

test('T06 P1 wins its own serve → still P1, same server', () => {
  const s = scenario({ firstServe: 'them' });
  s.point('us'); // side-out → P1
  s.us('S', 'S', '#');
  const built = s.build();
  assert.equal(built.rallies[1].snap.pLabel, 'P1');
  assert.equal(built.current.snap.pLabel, 'P1');
  assert.equal(built.current.snap.court[0].player, 'S');
});

test('T07 six side-outs return the original map', () => {
  const s = scenario();
  const labels = [];
  for (let i = 0; i < 6; i++) {
    s.point('us');
    labels.push(s.build().current.snap.pLabel);
    s.point('them');
  }
  assert.deepEqual(labels, ['P1', 'P6', 'P5', 'P4', 'P3', 'P2']);
  const built = s.build();
  assert.deepEqual(built.current.snap.court.map((c) => c.player), LINEUP);
});

test('T08 libero for M2, then a normal sub elsewhere → six on court, libero owns touches, serve order intact', () => {
  const s = scenario();
  s.add('libero', { action: 'in', libero: 'L', replaced: 'M2', slot: 1 });
  s.add('sub', { changes: [{ slot: 5, out: 'O', in: 'X' }] });
  s.them('S', 'in');
  s.us('L', 'R', '#');
  s.point('them');
  const built = s.build();
  const court = built.rallies[0].snap.onCourt;
  assert.equal(new Set(court).size, 6);
  assert.ok(court.includes('L') && court.includes('X'));
  assert.ok(!court.includes('M2') && !court.includes('O'));
  const libero = playersReport(built, s.match).rows.find((r) => r.id === 'L');
  assert.equal(libero.line.reception.total, 1);
  assert.deepEqual(built.current.set.slotPlayers, ['M2', 'S', 'OH1', 'M1', 'X', 'OH2']);
});

test('libero leaves automatically before reaching the front row', () => {
  const s = scenario();
  s.add('libero', { action: 'in', libero: 'L', replaced: 'M1', slot: 4 }); // M1 starts in position 4? no: slot 4 = position 4
  let built = s.build();
  assert.ok(built.notices.some((n) => n.text.includes('передн')), 'libero entered front row is flagged');

  const t = scenario();
  t.add('libero', { action: 'in', libero: 'L', replaced: 'O', slot: 5 }); // position 5, back row
  t.point('us'); // rotate: slot 5 → position 4
  built = t.build();
  assert.equal(built.current.set.libero, null);
  assert.ok(built.notices.some((n) => n.kind === 'liberoAutoOut'));
  assert.equal(positionOfSlot(5, built.current.set.shift), 4);
});

test('T09 two-player block point → team +1, each participation +1, score +1 once', () => {
  const s = scenario({ firstServe: 'us' });
  s.us('S', 'S', 'in');
  s.them('A', 'C');
  s.us('M1', 'B', 'P', { with: ['O'] });
  const built = s.build();
  const rep = playersReport(built, s.match);
  assert.equal(rep.team.line.block.points, 1);
  assert.equal(rep.rows.find((r) => r.id === 'M1').line.block.group, 1);
  assert.equal(rep.rows.find((r) => r.id === 'O').line.block.group, 1);
  assert.equal(rep.rows.find((r) => r.id === 'M1').line.block.solo, 0);
  assert.deepEqual(built.current.score, { us: 1, them: 0 });
});

test('T10 E# followed by attack out → E# kept, attack error +1, no assist', () => {
  const s = scenario();
  s.them('S', 'in');
  s.us('OH1', 'R', '#');
  s.us('S', 'E', '#');
  s.us('O', 'A', 'E');
  const rep = playersReport(s.build(), s.match);
  const setter = rep.rows.find((r) => r.id === 'S');
  assert.equal(setter.line.E.c('#'), 1);
  assert.equal(setter.line.assists, 0);
  assert.equal(rep.rows.find((r) => r.id === 'O').line.attack.E, 1);
});

test('T11 setter dump kill → A/K/dump, setter E count unchanged', () => {
  const s = scenario();
  s.them('S', 'in');
  s.us('OH1', 'R', '#');
  s.us('S', 'A', 'K', { attackType: 'dump' });
  const setter = playersReport(s.build(), s.match).rows.find((r) => r.id === 'S').line;
  assert.equal(setter.attack.K, 1);
  assert.equal(setter.E.total, 0);
  assert.equal(setter.assists, 0);
});

test('T12 replay → excluded from reports; score, serve and rotation restored', () => {
  const s = scenario();
  s.them('S', 'in');
  s.us('OH1', 'R', '#');
  s.us('OH1', 'A', 'K'); // wrongly awarded, then replayed after a challenge
  s.add('replay');
  const built = s.build();
  assert.deepEqual(built.current.score, { us: 0, them: 0 });
  assert.equal(built.current.serving, 'them');
  assert.equal(built.current.snap.pLabel, 'P2');
  const rep = playersReport(built, s.match);
  assert.equal(rep.team.line.attack.TA, 0);
  assert.equal(rep.team.line.reception.total, 0);

  // Replaying a rally in progress drops its touches too.
  s.them('S', 'in');
  s.us('OH1', 'R', '+');
  s.add('replay');
  const again = s.build();
  assert.equal(playersReport(again, s.match).team.line.reception.total, 0);
  assert.deepEqual(again.current.score, { us: 0, them: 0 });
});

test('T13 changing an early winner recomputes later maps and flags contradictions', () => {
  const s = scenario();
  const first = s.point('us'); // side-out → we serve, S at position 1
  s.us('S', 'S', 'in');
  s.point('them');
  let built = s.build();
  assert.equal(built.rallies[1].warnings.length, 0);

  first.winner = 'them'; // corrected: the first rally was actually lost
  built = s.build();
  assert.equal(built.rallies[1].snap.pLabel, 'P2');
  assert.ok(built.rallies[1].warnings.length > 0);
  assert.ok(built.rallies[1].needsCheck);
  assert.ok(built.rallies.slice(1).every((r) => r.needsCheck));
});

test('T14 two ungraded sets out of ten → quality over 8, coverage 80%', () => {
  const s = scenario();
  const grades = ['#', '#', '#', '+', '+', '!', '-', '=', '?', '?'];
  for (const g of grades) {
    s.us('S', 'E', g);
    if (g !== '=') s.point('them');
  }
  const set = playersReport(s.build(), s.match).rows.find((r) => r.id === 'S').line;
  assert.equal(set.setting.graded, 8);
  assert.equal(val(set.setting.quality), 62.5);
  const coverage = set.E.graded / set.E.total;
  assert.equal(coverage, 0.8);
});

test('T16 JSON export and import give identical reports', () => {
  const s = scenario();
  s.them('S', 'in');
  s.us('OH1', 'R', '+');
  s.us('S', 'E', '#', { system: 'in' });
  s.us('O', 'A', 'K', { direction: 'z2' });
  s.add('sub', { changes: [{ slot: 4, out: 'M1', in: 'X' }] });
  s.us('S', 'S', '=');
  const json = JSON.stringify(exportMatch(s.match, s.entries));
  const back = parseMatchExport(json);
  const a = s.build();
  const b = buildMatch(back.match, back.entries);
  assert.deepEqual(b.current.score, a.current.score);
  assert.deepEqual(b.current.set.slotPlayers, a.current.set.slotPlayers);
  const ra = playersReport(a, s.match);
  const rb = playersReport(b, back.match);
  assert.deepEqual(
    rb.rows.map((r) => [r.id, r.line.touches, r.line.attack.TA, r.line.setting.total]),
    ra.rows.map((r) => [r.id, r.line.touches, r.line.attack.TA, r.line.setting.total])
  );
  assert.equal(back.match.scale, 'Club v1');
});

test('T17 new set has its own start map; display mirroring is not part of the log', () => {
  const s = scenario();
  for (let i = 0; i < 25; i++) s.point('us');
  let built = s.build();
  assert.equal(built.phase, 'setOver');
  s.add('setStart', { slots: ['OH1', 'M1', 'O', 'OH2', 'M2', 'S'], liberos: ['L'], firstServe: 'us' });
  built = s.build();
  assert.equal(built.sets.length, 2);
  assert.equal(built.current.snap.pLabel, 'P6');
  assert.deepEqual(built.current.snap.court.map((c) => c.player), ['OH1', 'M1', 'O', 'OH2', 'M2', 'S']);
});

test('T18 sanction changes the score without creating a rally or SO/BP denominators', () => {
  const s = scenario();
  s.add('sanction', { team: 'them', card: 'red', pointTo: 'us' });
  const built = s.build();
  assert.deepEqual(built.current.score, { us: 1, them: 0 });
  assert.equal(built.rallies.length, 0);
  const total = teamReport(built, s.match).total;
  assert.equal(total.so.den, 0);
  assert.equal(total.bp.den, 0);
  const dist = distributionReport(built, s.match);
  assert.equal(dist.us.sanction, 1);
  assert.ok(dist.consistent);
});

test('point distribution adds up to the score; linked kill + dig error count once', () => {
  const s = scenario({ firstServe: 'us' });
  s.us('S', 'S', '#'); // ace
  s.us('S', 'S', 'in');
  s.them('R', '+');
  s.them('A', 'K'); // their kill
  s.us('OH1', 'D', '=', { linked: true }); // the same point seen from our side
  s.them('S', '='); // our point: their serve error
  s.us('S', 'S', 'in');
  s.us('M1', 'B', 'P'); // block
  const built = s.build();
  assert.deepEqual(built.current.score, { us: 3, them: 1 });
  const dist = distributionReport(built, s.match);
  assert.equal(dist.us.ace, 1);
  assert.equal(dist.us.block, 1);
  assert.equal(dist.us.error, 1);
  assert.equal(dist.them.kill, 1);
  assert.ok(dist.consistent);
  const d = playersReport(built, s.match).rows.find((r) => r.id === 'OH1').line;
  assert.equal(d.defense.errors, 1);
});

test('set and match end by the rules', () => {
  const s = scenario({ profile: { ...RULE_PROFILES.fivb2025, bestOf: 3 } });
  for (let i = 0; i < 24; i++) s.point('us');
  for (let i = 0; i < 24; i++) s.point('them');
  s.point('us');
  assert.equal(s.build().phase, 'live');
  s.point('us');
  assert.equal(s.build().phase, 'setOver');
  s.add('setStart', { slots: LINEUP, liberos: [], firstServe: 'them' });
  for (let i = 0; i < 25; i++) s.point('us');
  const built = s.build();
  assert.equal(built.phase, 'matchOver');
  assert.deepEqual(built.setsWon, { us: 2, them: 0 });
});

test('setter report: matrix shares, directions and filters', () => {
  const s = scenario();
  const play = (attacker, dir, grade, system = 'in') => {
    s.them('S', 'in');
    s.us('OH1', 'R', '#');
    s.us('S', 'E', '#', { system });
    s.us(attacker, 'A', grade, { direction: dir });
    if (grade === 'C') s.point('them');
    if (grade === 'K') s.point('them');
  };
  play('O', 'z2', 'K');
  play('O', 'z2', 'C');
  play('OH1', 'z4', 'K', 'out');
  play('M1', 'quick', 'E');
  const rep = setterReport(s.build(), s.match);
  assert.equal(rep.main.length, 1);
  assert.equal(rep.main[0].total, 4);
  assert.equal(rep.main[0].assists, 2);
  const toO = rep.matrix.find((m) => m.target === 'O');
  assert.equal(toO.share.num, 2);
  assert.equal(toO.share.den, 4);
  assert.equal(val(toO.killPct), 50);
  assert.equal(rep.directions.find((d) => d.key === 'quick').ta, 1);
  const inSys = setterReport(s.build(), s.match, { system: 'in' });
  assert.equal(inSys.count, 3);
});

test('performance: 5000 events rebuild and full reports within budget', () => {
  const s = scenario();
  const profile = { ...RULE_PROFILES.custom, bestOf: 99, pointsPerSet: 200 };
  s.match.profile = profile;
  for (let i = 0; i < 1000; i++) {
    s.them('S', 'in');
    s.us('OH1', 'R', '+');
    s.us('S', 'E', '#');
    s.us('O', 'A', 'C');
    s.point(i % 2 ? 'them' : 'us');
    if (i % 300 === 299) s.add('setStart', { slots: LINEUP, liberos: ['L'], firstServe: 'them' });
  }
  assert.ok(s.entries.length >= 5000);
  const t0 = performance.now();
  const built = s.build();
  playersReport(built, s.match);
  teamReport(built, s.match);
  setterReport(built, s.match);
  rotationsReport(built, s.match);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
});

test('quick-mode completeness: result-only rallies are marked incomplete, serve/reception chains are not', () => {
  const s = scenario({ firstServe: 'them' });
  s.us('M1', 'B', 'P'); // their serve, no reception recorded → incomplete
  s.us('S', 'S', 'in');
  s.them('A', 'K'); // our serve, their kill → complete for our side
  s.them('S', '='); // their serve error → complete
  s.us('S', 'S', 'in');
  s.us('OH1', 'A', 'E'); // our serve, then our attack with no first touch → incomplete
  s.them('S', 'in');
  s.us('OH1', 'R', '+');
  s.us('O', 'A', 'K'); // reception + kill → complete, first attack after reception
  const built = s.build();
  assert.deepEqual(built.rallies.map((r) => r.complete), [false, true, true, false, true]);
  assert.ok(built.rallies[0].gaps.includes('Нет приёма'));
  const o = playersReport(built, s.match).rows.find((r) => r.id === 'O').line.attack;
  assert.equal(o.afterR.ta, 1);
  const oh = playersReport(built, s.match).rows.find((r) => r.id === 'OH1').line.attack;
  assert.equal(oh.afterR.ta, 0, 'an attack right after our own serve is not a first attack after reception');
});

test('every grade button has a colour, a label, and reception "/" always has a subtype', async () => {
  const { GRADES } = await import('../docs/js/model/constants.js');
  for (const [skill, grades] of Object.entries(GRADES)) {
    for (const [code, g] of Object.entries(grades)) {
      assert.ok(g.tone, `${skill} ${code} has no tone`);
      assert.ok(g.label, `${skill} ${code} has no label`);
    }
  }
  assert.ok(!('/' in GRADES.R));
});
