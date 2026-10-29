// Reports (spec §9, §12–14). Every percentage keeps its numerator and denominator; a zero
// denominator yields value null, which the UI shows as "—" rather than 0%.

import { playedRallies, isGraded, setTarget } from './engine.js';
import { other, isFront } from './constants.js';

export const pct = (num, den) => ({ num, den, value: den > 0 ? num / den : null });

const inc = (obj, key, by = 1) => {
  obj[key] = (obj[key] ?? 0) + by;
};

// ---------- Scope and filters ----------

export function isEndgame(rally, profile) {
  const deciding = rally.set === profile.bestOf;
  const from = deciding ? 10 : 20;
  const { us, them } = rally.scoreBefore;
  return Math.max(us, them) >= from && Math.abs(us - them) <= 2;
}

/** Played rallies narrowed by the common filters: set, P-label, endgame. */
export function scopeRallies(built, profile, f = {}) {
  return playedRallies(built).filter(
    (r) =>
      (f.set == null || r.set === f.set) &&
      (f.pLabel == null || r.snap.pLabel === f.pLabel) &&
      (!f.endgame || isEndgame(r, profile))
  );
}

/** Touches of one team, including records linked to an already decided rally (e.g. D= after their kill). */
const touchesOf = (rallies, team = 'us') =>
  rallies.flatMap((r) => [...r.touches, ...r.linked].filter((t) => t.team === team));

// ---------- Skill tallies ----------

function tallySkill(touches, skill) {
  const list = touches.filter((t) => t.skill === skill);
  const counts = {};
  for (const t of list) inc(counts, t.grade);
  const graded = list.filter(isGraded).length;
  return { list, counts, total: list.length, graded, unknown: list.length - graded, c: (g) => counts[g] ?? 0 };
}

function blockParticipants(t) {
  return [t.player, ...(t.with ?? [])].filter(Boolean);
}

/** All per-skill numbers for a set of touches by one player, the team, or "unassigned". */
export function skillLine(touches, { allTouchesForAssists = touches, playerId = null } = {}) {
  const S = tallySkill(touches, 'S');
  const R = tallySkill(touches, 'R');
  const E = tallySkill(touches, 'E');
  const A = tallySkill(touches, 'A');
  const B = tallySkill(touches, 'B');
  const D = tallySkill(touches, 'D');
  const C = tallySkill(touches, 'C');
  const F = tallySkill(touches, 'F');

  const TA = A.c('K') + A.c('E') + A.c('B') + A.c('C');
  const phaseAttack = (phases) => {
    const list = A.list.filter((t) => phases.includes(t.phase) && isGraded(t));
    return { ta: list.length, k: list.filter((t) => t.grade === 'K').length };
  };
  const afterR = phaseAttack(['R']);
  const afterD = phaseAttack(['D']);
  const afterFC = phaseAttack(['F', 'C']);

  const blockPoints = B.list.filter((t) => t.grade === 'P');
  let soloBlocks = 0;
  let groupBlocks = 0;
  if (playerId) {
    // Block participation can come from a touch recorded under another player (`with`).
    for (const t of allTouchesForAssists) {
      if (t.skill !== 'B' || t.grade !== 'P') continue;
      const people = blockParticipants(t);
      if (!people.includes(playerId)) continue;
      if (people.length > 1) groupBlocks += 1;
      else soloBlocks += 1;
    }
  } else {
    for (const t of blockPoints) {
      if (blockParticipants(t).length > 1) groupBlocks += 1;
      else soloBlocks += 1;
    }
  }

  const assists = playerId
    ? allTouchesForAssists.filter((t) => t.skill === 'A' && t.grade === 'K' && t.assistBy === playerId).length
    : allTouchesForAssists.filter((t) => t.skill === 'A' && t.grade === 'K' && t.assistBy).length;

  const pressured = S.list.filter((t) => t.grade === 'in' && t.reception && isGraded(t.reception));
  const pressureNum = pressured.filter((t) => ['-', '/o', '/f'].includes(t.reception.grade)).length;

  const dSuccess = D.list.filter((t) => t.grade !== '=');
  const dSuccessGraded = dSuccess.filter(isGraded);

  const linkedA = E.list.map((t) => t.nextAttack).filter((a) => a && isGraded(a));
  const linkedK = linkedA.filter((a) => a.grade === 'K').length;

  const allGraded = touches.filter(isGraded).length;

  return {
    touches: touches.length,
    coverage: pct(allGraded, touches.length),
    S, R, E, A, B, D, C, F,
    attack: {
      TA,
      K: A.c('K'),
      E: A.c('E'),
      B: A.c('B'),
      C: A.c('C'),
      unknown: A.unknown,
      killPct: pct(A.c('K'), TA),
      effPct: { ...pct(A.c('K') - A.c('E') - A.c('B'), TA) },
      afterR: { ...afterR, pct: pct(afterR.k, afterR.ta) },
      afterD: { ...afterD, pct: pct(afterD.k, afterD.ta) },
      afterFC: { ...afterFC, pct: pct(afterFC.k, afterFC.ta) },
    },
    serve: {
      total: S.total,
      aces: S.c('#'),
      errors: S.c('='),
      acePct: pct(S.c('#'), S.total),
      errorPct: pct(S.c('='), S.total),
      pressure: pct(pressureNum, pressured.length),
    },
    reception: {
      total: R.total,
      graded: R.graded,
      perfect: pct(R.c('#'), R.graded),
      positive: pct(R.c('#') + R.c('+'), R.graded),
      error: pct(R.c('='), R.graded),
      overpass: R.c('/o'),
      slash: R.c('/o') + R.c('/f'),
      unknown: R.unknown,
    },
    defense: {
      success: dSuccess.length,
      errors: D.c('='),
      controlled: pct(dSuccessGraded.filter((t) => ['#', '+', '!'].includes(t.grade)).length, dSuccessGraded.length),
      cover: C.total,
      free: F.total,
      unknown: D.unknown,
    },
    block: {
      points: blockPoints.length,
      solo: soloBlocks,
      group: groupBlocks,
      soft: B.c('S'),
      other: B.c('T') + B.c('R'),
      errors: B.c('='),
      unknown: B.unknown,
    },
    setting: {
      total: E.total,
      graded: E.graded,
      exact: pct(E.c('#'), E.graded),
      quality: pct(E.c('#') + E.c('+'), E.graded),
      error: pct(E.c('='), E.graded),
      overpass: E.c('/'),
      unknown: E.unknown,
      linkedTA: linkedA.length,
      killAfterSet: pct(linkedK, linkedA.length),
    },
    assists,
  };
}

// ---------- Players ----------

function exposure(rallies, playerId) {
  const sets = new Set();
  let n = 0;
  for (const r of rallies) {
    if (r.snap.onCourt.includes(playerId)) {
      n += 1;
      sets.add(r.set);
    }
  }
  return { sets: sets.size, rallies: n };
}

/** Rallies won on this player's serve and the longest unbroken run of them. */
function serveRuns(rallies, playerId) {
  let n = 0;
  let w = 0;
  let best = 0;
  let run = 0;
  for (const r of rallies) {
    const server = r.serving === 'us' ? r.snap.court[0].player : null;
    if (server !== playerId) {
      run = 0;
      continue;
    }
    n += 1;
    if (r.winner === 'us') {
      w += 1;
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return { bp: pct(w, n), maxRun: best };
}

export function playersReport(built, match, filters = {}) {
  const rallies = scopeRallies(built, match.profile, filters);
  const ours = touchesOf(rallies, 'us');
  const rows = [];
  for (const p of match.roster) {
    const own = ours.filter((t) => t.player === p.playerId);
    const exp = exposure(rallies, p.playerId);
    const blockedWith = ours.some((t) => t.skill === 'B' && (t.with ?? []).includes(p.playerId));
    if (!own.length && !exp.rallies && !blockedWith) continue;
    rows.push({
      id: p.playerId,
      number: p.number,
      name: p.name,
      position: p.position,
      exposure: exp,
      line: skillLine(own, { allTouchesForAssists: ours, playerId: p.playerId }),
      serveRun: serveRuns(rallies, p.playerId),
    });
  }
  rows.sort((a, b) => a.number - b.number);
  const teamLine = skillLine(ours);
  const unassigned = ours.filter((t) => !t.player);
  return {
    rows,
    team: { line: teamLine, serveRun: { bp: bpOf(rallies), maxRun: null } },
    unassigned: unassigned.length ? { line: skillLine(unassigned, { allTouchesForAssists: [] }) } : null,
    rallies,
  };
}

function bpOf(rallies) {
  const serving = rallies.filter((r) => r.serving === 'us');
  return pct(serving.filter((r) => r.winner === 'us').length, serving.length);
}

// ---------- Team ----------

function sideOutLine(rallies) {
  const recv = rallies.filter((r) => r.receiving === 'us');
  const serve = rallies.filter((r) => r.serving === 'us');
  const serveErr = (r) => r.reason === 'serveError' || r.touches.some((t) => t.skill === 'S' && t.team === 'them' && t.grade === '=');
  const recvInPlay = recv.filter((r) => !serveErr(r));
  return {
    so: pct(recv.filter((r) => r.winner === 'us').length, recv.length),
    soInPlay: pct(recvInPlay.filter((r) => r.winner === 'us').length, recvInPlay.length),
    bp: pct(serve.filter((r) => r.winner === 'us').length, serve.length),
  };
}

export function pointSources(rallies, sanctions, team) {
  const won = rallies.filter((r) => r.winner === team);
  const by = (reason) => won.filter((r) => r.reason === reason).length;
  const sanctionPts = sanctions.filter((s) => s.entry.pointTo === team).length;
  const rows = {
    kill: by('kill'),
    ace: by('ace'),
    block: by('block'),
    error: by('error') + by('serveError'),
    sanction: sanctionPts,
    unknown: by('unknown'),
  };
  rows.total = rows.kill + rows.ace + rows.block + rows.error + rows.sanction + rows.unknown;
  return rows;
}

export function teamReport(built, match, filters = {}) {
  const sets = built.sets.filter((s) => filters.set == null || s.number === filters.set);
  const perSet = sets.map((s) => teamRow(built, match, { ...filters, set: s.number }, s));
  const total = teamRow(built, match, filters, null);
  return { perSet, total };
}

function teamRow(built, match, filters, set) {
  const rallies = scopeRallies(built, match.profile, filters);
  const sanctions = built.sanctions.filter((s) => filters.set == null || s.set === filters.set);
  const line = skillLine(touchesOf(rallies, 'us'));
  const pts = pointSources(rallies, sanctions, 'us');
  const opp = pointSources(rallies, sanctions, 'them');
  const complete = rallies.filter((r) => r.complete).length;
  return {
    set: set?.number ?? null,
    score: set ? { ...set.score } : { us: pts.total, them: opp.total },
    winner: set?.winner ?? null,
    rallies: rallies.length,
    points: pts,
    oppPoints: opp,
    sanctions: sanctions.length,
    line,
    ...sideOutLine(rallies),
    coverage: pct(complete, rallies.length),
  };
}

// ---------- Setter (spec §13) ----------

const INPUT_GOOD = ['#', '+'];

export function setterSets(built, match, f = {}) {
  const rallies = scopeRallies(built, match.profile, f);
  const out = [];
  for (const r of rallies) {
    for (const t of r.touches) {
      if (t.team !== 'us' || t.skill !== 'E') continue;
      const input = t.inputTouch;
      const inputQ = !input || !isGraded(input) ? 'unk' : INPUT_GOOD.includes(input.grade) ? 'good' : 'bad';
      const pos = r.snap.court.find((c) => c.player === t.player)?.pos ?? null;
      const item = {
        touch: t,
        rally: r,
        setter: t.player,
        target: t.target ?? t.nextAttack?.player ?? null,
        attack: t.nextAttack && isGraded(t.nextAttack) ? t.nextAttack : null,
        direction: t.nextAttack?.direction ?? t.direction ?? null,
        phase: input ? input.skill : 'unknown',
        inputQ,
        system: t.system ?? 'unk',
        line: pos == null ? null : isFront(pos) ? 'front' : 'back',
      };
      if (f.setter && item.setter !== f.setter) continue;
      if (f.target && item.target !== f.target) continue;
      if (f.phase && !(f.phase === 'FC' ? ['F', 'C'].includes(item.phase) : item.phase === f.phase)) continue;
      if (f.system && item.system !== f.system) continue;
      if (f.input && item.inputQ !== f.input) continue;
      if (f.line && item.line !== f.line) continue;
      out.push(item);
    }
  }
  return { items: out, rallies };
}

function setGroupLine(items) {
  const touches = items.map((i) => i.touch);
  const graded = touches.filter(isGraded);
  const c = (g) => graded.filter((t) => t.grade === g).length;
  const attacks = items.map((i) => i.attack).filter(Boolean);
  const K = attacks.filter((a) => a.grade === 'K').length;
  const AE = attacks.filter((a) => a.grade === 'E').length;
  const AB = attacks.filter((a) => a.grade === 'B').length;
  return {
    total: touches.length,
    graded: graded.length,
    unknown: touches.length - graded.length,
    counts: { '#': c('#'), '+': c('+'), '!': c('!'), '-': c('-'), '/': c('/'), '=': c('=') },
    exact: pct(c('#'), graded.length),
    quality: pct(c('#') + c('+'), graded.length),
    error: pct(c('='), graded.length),
    ta: attacks.length,
    K,
    AE,
    AB,
    killPct: pct(K, attacks.length),
    effPct: pct(K - AE - AB, attacks.length),
    coverage: pct(graded.length, touches.length),
  };
}

export function setterReport(built, match, f = {}) {
  const { items, rallies } = setterSets(built, match, f);
  const allOurs = touchesOf(rallies, 'us');
  const setters = [...new Set(items.map((i) => i.setter))];

  const main = setters.map((id) => {
    const mine = items.filter((i) => i.setter === id);
    const exp = exposure(rallies, id);
    return {
      id,
      exposure: exp,
      activeRallies: rallies.filter((r) => r.snap.setter === id).length,
      ...setGroupLine(mine),
      assists: allOurs.filter((t) => t.skill === 'A' && t.grade === 'K' && t.assistBy === id).length,
      inSystem: mine.filter((i) => i.system === 'in').length,
      outSystem: mine.filter((i) => i.system === 'out').length,
      systemUnknown: mine.filter((i) => i.system === 'unk').length,
      front: mine.filter((i) => i.line === 'front').length,
      back: mine.filter((i) => i.line === 'back').length,
    };
  });

  const matrix = [];
  for (const id of setters) {
    const mine = items.filter((i) => i.setter === id);
    const known = mine.filter((i) => i.target);
    const targets = [...new Set(known.map((i) => i.target))];
    for (const target of targets) {
      const sub = known.filter((i) => i.target === target);
      matrix.push({
        setter: id,
        target,
        share: pct(sub.length, known.length),
        inputGood: pct(sub.filter((i) => i.inputQ === 'good').length, sub.filter((i) => i.inputQ !== 'unk').length),
        ...setGroupLine(sub),
      });
    }
    const unknown = mine.filter((i) => !i.target);
    if (unknown.length) {
      matrix.push({ setter: id, target: null, share: pct(0, 0), inputGood: pct(0, 0), ...setGroupLine(unknown) });
    }
  }

  const dirKeys = ['z4', 'quick', 'z2', 'pipe', 'z1', 'other', null];
  const withDir = items.filter((i) => i.direction);
  const directions = dirKeys
    .map((key) => {
      const sub = items.filter((i) => (i.direction ?? null) === key);
      return { key, share: key ? pct(sub.length, withDir.length) : pct(0, 0), ...setGroupLine(sub) };
    })
    .filter((d) => d.total > 0);

  return { main, matrix, directions, total: setGroupLine(items), count: items.length, rallies };
}

// ---------- Rotations, lineups, reception by rotation, runs ----------

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

function rallyGroupLine(rallies) {
  const ours = touchesOf(rallies, 'us');
  const line = skillLine(ours);
  const W = rallies.filter((r) => r.winner === 'us').length;
  const recv = rallies.filter((r) => r.receiving === 'us');
  const serve = rallies.filter((r) => r.serving === 'us');
  return {
    n: rallies.length,
    W,
    L: rallies.length - W,
    recvN: recv.length,
    soW: recv.filter((r) => r.winner === 'us').length,
    serveN: serve.length,
    bpW: serve.filter((r) => r.winner === 'us').length,
    ...sideOutLine(rallies),
    recPositive: line.reception.positive,
    ta: line.attack.TA,
    eff: line.attack.effPct,
    coverage: pct(rallies.filter((r) => r.complete).length, rallies.length),
    line,
  };
}

export function rotationKey(r, keyType) {
  if (keyType === 'shift') return `${r.snap.scheme} · сдвиг ${r.snap.shift}`;
  return r.snap.pLabel ?? `Сдвиг ${r.snap.shift}`;
}

export function rotationsReport(built, match, f = {}, keyType = 'p') {
  const rallies = scopeRallies(built, match.profile, { ...f, pLabel: null });
  const groups = new Map();
  for (const r of rallies) {
    const key = rotationKey(r, keyType);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const order = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];
  const rows = [...groups.entries()].map(([key, list]) => ({
    key,
    snap: list[0].snap,
    setter: mostCommon(list.map((r) => r.snap.setter)),
    setterLine: mostCommon(list.map((r) => r.snap.setterLine)),
    front: mostCommon(list.map((r) => r.snap.front.join(','))).split(',').filter(Boolean),
    libero: mostCommon(list.map((r) => r.snap.libero?.id ?? null)),
    rallies: list,
    ...rallyGroupLine(list),
  }));
  rows.sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.key.localeCompare(b.key, 'ru');
  });
  return rows;
}

export function receptionByRotation(built, match, f = {}) {
  return rotationsReport(built, match, f, 'p').map((row) => {
    const recvRallies = row.rallies.filter((r) => r.receiving === 'us');
    const R = touchesOf(recvRallies, 'us').filter((t) => t.skill === 'R');
    const receivers = mostByCount(R.map((t) => t.player).filter(Boolean));
    const firstA = touchesOf(recvRallies, 'us').filter((t) => t.skill === 'A' && t.phase === 'R' && isGraded(t));
    const counts = {};
    for (const t of R) inc(counts, t.grade);
    const graded = R.filter(isGraded).length;
    return {
      key: row.key,
      receivers,
      n: R.length,
      counts,
      graded,
      unknown: R.length - graded,
      positive: pct((counts['#'] ?? 0) + (counts['+'] ?? 0), graded),
      firstTA: firstA.length,
      firstKill: pct(firstA.filter((a) => a.grade === 'K').length, firstA.length),
      soInPlay: sideOutLine(recvRallies).soInPlay,
    };
  });
}

function mostByCount(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n }));
}

export function lineupsReport(built, match, f = {}) {
  const rallies = scopeRallies(built, match.profile, f);
  const groups = new Map();
  for (const r of rallies) {
    const key = [...r.snap.onCourt].sort().join('|') + '#' + (r.snap.setter ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.values()]
    .map((list) => ({ players: list[0].snap.onCourt.slice(), setter: list[0].snap.setter, ...rallyGroupLine(list) }))
    .sort((a, b) => b.n - a.n);
}

/** Runs of at least `min` consecutive rallies won by one team within a set (spec §14 "Серии"). */
export function runsReport(built, match, min = 3) {
  const out = [];
  for (const set of built.sets) {
    const rallies = set.rallies.filter((r) => r.winner && !r.replayed);
    let i = 0;
    while (i < rallies.length) {
      let j = i;
      while (j + 1 < rallies.length && rallies[j + 1].winner === rallies[i].winner) j += 1;
      const len = j - i + 1;
      if (len >= min) {
        const first = rallies[i];
        const last = rallies[j];
        const between = built.timeline.filter(
          (item) =>
            ['timeout', 'sub', 'libero'].includes(item.kind) &&
            item.set === set.number &&
            item.score &&
            sumScore(item.score) > sumScore(first.scoreBefore) &&
            sumScore(item.score) < sumScore(last.scoreAfter)
        );
        const reasons = {};
        for (const r of rallies.slice(i, j + 1)) inc(reasons, r.reason);
        out.push({
          set: set.number,
          team: first.winner,
          from: first.scoreBefore,
          to: last.scoreAfter,
          server: first.serving === 'us' ? first.snap.court[0].player : null,
          serving: first.serving,
          pLabel: first.snap.pLabel,
          length: len,
          reasons,
          interruptions: between.map((b) => b.kind),
        });
      }
      i = j + 1;
    }
  }
  return out;
}

const sumScore = (s) => s.us + s.them;

/** Points per reason for both teams; each column must add up to the score (spec §14). */
export function distributionReport(built, match, f = {}) {
  const rallies = scopeRallies(built, match.profile, f);
  const sanctions = built.sanctions.filter((s) => f.set == null || s.set === f.set);
  const us = pointSources(rallies, sanctions, 'us');
  const them = pointSources(rallies, sanctions, 'them');
  const sets = built.sets.filter((s) => f.set == null || s.number === f.set);
  const score = { us: 0, them: 0 };
  for (const s of sets) {
    score.us += s.score.us;
    score.them += s.score.them;
  }
  const filtered = f.pLabel != null || f.endgame;
  return { us, them, score, consistent: filtered || (us.total === score.us && them.total === score.them) };
}

export function coverageNotice(rallies) {
  const incomplete = rallies.filter((r) => !r.complete).length;
  return { incomplete, total: rallies.length };
}

export function scoreFlow(built) {
  return built.sets.map((s) => ({ set: s.number, flow: s.flow.filter((p) => p.by !== 'replay'), target: null }));
}

export { setTarget, other };
