// Generates a realistic, fully scouted demo match so every report has data to show.
// The match is simulated rally by rally against the real engine, so rotations, servers,
// libero moves and substitutions are always consistent with the rules.

import { buildMatch } from './engine.js';
import { RULE_PROFILES, SCALE_VERSION, isFront } from './constants.js';

/** Small seeded generator (mulberry32), so the demo is the same every time. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function requiredDemoRoles(team) {
  const has = (pos, n) => team.players.filter((p) => p.position === pos).length >= n;
  return has('setter', 1) && has('opposite', 1) && has('outside', 2) && has('middle', 2) && has('libero', 1);
}

/**
 * @param team  a team with at least a setter, an opposite, two outsides, two middles and a libero
 * @param uid   id factory
 */
export function generateDemoMatch(team, { uid, seed = 7, opponent = 'Демо-соперник' } = {}) {
  const rnd = seeded(seed);
  const pick = (weights) => {
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let x = rnd() * total;
    for (const [v, w] of weights) {
      x -= w;
      if (x <= 0) return v;
    }
    return weights[weights.length - 1][0];
  };
  const chance = (p) => rnd() < p;

  const roster = [...team.players]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ playerId: p.id, number: p.number, name: p.name, position: p.position }));
  const role = new Map(roster.map((p) => [p.playerId, p.position]));
  const of = (pos) => roster.filter((p) => p.position === pos).map((p) => p.playerId);
  const [setter] = of('setter');
  const [opp] = of('opposite');
  const [oh1, oh2, oh3] = of('outside');
  const [mb1, mb2, mb3] = of('middle');
  const [libero] = of('libero');
  if (!setter || !opp || !oh2 || !mb2 || !libero) {
    throw new Error('Для демо-матча в команде нужны связующий, диагональный, два доигровщика, два центральных и либеро');
  }

  // Attacking strength per player: share of kills before set and context adjustments.
  const killBase = new Map([
    [opp, 0.46],
    [oh1, 0.43],
    [oh2, 0.36],
    [mb1, 0.52],
    [mb2, 0.47],
    [setter, 0.4],
  ]);
  if (oh3) killBase.set(oh3, 0.33);
  if (mb3) killBase.set(mb3, 0.42);

  const date = new Date();
  date.setHours(18, 0, 0, 0);
  const match = {
    id: uid(),
    teamId: team.id,
    teamName: team.name,
    opponent,
    tournament: 'Демонстрационный матч',
    date: date.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    profileKey: 'fivb2025',
    profile: { ...RULE_PROFILES.fivb2025 },
    system: '5-1',
    mode: 'detailed',
    scale: SCALE_VERSION,
    roster,
    status: 'active',
    demo: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const entries = [];
  let clock = date.getTime();
  const add = (type, payload = {}) => {
    clock += 6000 + Math.floor(rnd() * 16000);
    entries.push({
      id: uid(),
      matchId: match.id,
      order: entries.length + 1,
      type,
      ...payload,
      createdAt: new Date(clock).toISOString(),
      author: 'Демо',
      version: 1,
      deleted: false,
      history: [],
    });
  };
  const touch = (team, player, skill, grade, extra = {}) => add('touch', { team, player, skill, grade, ...extra });

  let built = buildMatch(match, entries);
  const rebuild = () => {
    built = buildMatch(match, entries);
    return built;
  };

  // ---------- Rally simulation ----------

  const court = () => built.current.snap.court;
  const onCourt = () => court().map((c) => c.player);
  const backRow = () => court().filter((c) => !isFront(c.pos)).map((c) => c.player);
  const frontRow = () => court().filter((c) => isFront(c.pos)).map((c) => c.player);
  const any = (list) => list[Math.floor(rnd() * list.length)];

  function receiver() {
    const ids = onCourt();
    const options = [];
    if (ids.includes(libero)) options.push([libero, 0.42]);
    for (const id of ids) if (role.get(id) === 'outside') options.push([id, isFront(court().find((c) => c.player === id).pos) ? 0.22 : 0.33]);
    return options.length ? pick(options) : any(backRow());
  }

  function digger() {
    const back = backRow();
    const options = back.map((id) => [id, id === libero ? 0.45 : role.get(id) === 'setter' ? 0.12 : 0.22]);
    return pick(options);
  }

  function attackTargets(goodInput) {
    const c = court();
    const opts = [];
    for (const x of c) {
      const r = role.get(x.player);
      if (r === 'setter' || r === 'libero') continue;
      const front = isFront(x.pos);
      if (r === 'middle' && front) opts.push([x.player, goodInput ? 0.24 : 0.04, 'quick']);
      if (r === 'outside') opts.push([x.player, front ? (goodInput ? 0.26 : 0.4) : goodInput ? 0.08 : 0.04, front ? 'z4' : 'pipe']);
      if (r === 'opposite') opts.push([x.player, front ? (goodInput ? 0.22 : 0.34) : goodInput ? 0.09 : 0.08, front ? 'z2' : 'z1']);
    }
    const chosen = pick(opts.map((o, i) => [i, o[1]]));
    return { target: opts[chosen][0], direction: opts[chosen][2] };
  }

  /** Our attack after a first touch (reception, dig, cover or free ball). */
  function ourAttack(inputGrade, firstToucher, depth) {
    const good = ['#', '+', 'ctl'].includes(inputGrade);
    const setterOnCourt = onCourt().includes(setter);
    const setterBusy = firstToucher === setter || !setterOnCourt;
    const setBy = setterBusy ? any(onCourt().filter((id) => id !== firstToucher && id !== libero)) : setter;
    const setterFront = setterOnCourt && isFront(court().find((c) => c.player === setter).pos);

    // Setter dump: an attack on the second touch, recorded as A with type "dump" (spec T11).
    if (!setterBusy && setterFront && good && chance(0.05)) {
      const g = pick([['K', 0.55], ['C', 0.3], ['E', 0.1], ['B', 0.05]]);
      touch('us', setter, 'A', g, { attackType: 'dump', direction: 'other' });
      if (g === 'C') return theirAttack(depth + 1);
      return;
    }

    const eGrade = setterBusy
      ? pick([['+', 0.2], ['!', 0.4], ['-', 0.3], ['=', 0.1]])
      : good
      ? pick([['#', 0.45], ['+', 0.36], ['!', 0.13], ['-', 0.04], ['=', 0.02]])
      : pick([['#', 0.14], ['+', 0.34], ['!', 0.32], ['-', 0.15], ['=', 0.05]]);
    const { target, direction } = attackTargets(good && !setterBusy);
    const system = good && !setterBusy ? 'in' : inputGrade === '!' ? pick([['in', 0.4], ['out', 0.6]]) : 'out';
    touch('us', setBy, 'E', eGrade, { system, target, direction });
    if (eGrade === '=') return;

    const bonus = { '#': 0.08, '+': 0, '!': -0.1, '-': -0.2 }[eGrade];
    const k = Math.max(0.12, (killBase.get(target) ?? 0.35) + bonus - depth * 0.02);
    const blocked = 0.07 + (eGrade === '!' || eGrade === '-' ? 0.05 : 0);
    const a = pick([['K', k], ['E', 0.09], ['B', blocked], ['C', Math.max(0.1, 1 - k - 0.09 - blocked)]]);
    const attackType = eGrade === '-' ? pick([['roll', 0.6], ['tip', 0.4]]) : role.get(target) === 'middle' ? 'power' : pick([['power', 0.75], ['roll', 0.15], ['tip', 0.1]]);
    touch('us', target, 'A', a, { direction, attackType });
    if (a !== 'C') return;

    if (chance(0.16)) {
      // Their block touch comes back; we cover and attack again.
      touch('them', null, 'B', 'T');
      const coverer = any(onCourt().filter((id) => id !== target));
      const cg = pick([['ctl', 0.6], ['lim', 0.3], ['=', 0.1]]);
      touch('us', coverer, 'C', cg);
      if (cg === '=') return;
      return ourAttack(cg, coverer, depth + 1);
    }
    return theirAttack(depth + 1);
  }

  /** The opponent attacks; we block, dig or lose the point. */
  function theirAttack(depth) {
    if (depth > 7) {
      add('point', { winner: chance(0.5) ? 'us' : 'them', reason: 'unknown' });
      return;
    }
    if (chance(0.03)) {
      add('point', { winner: 'us', reason: 'error' }); // net touch or other opponent fault
      return;
    }
    if (chance(0.11)) {
      const p = any(backRow());
      const fg = pick([['ctl', 0.7], ['lim', 0.24], ['=', 0.06]]);
      touch('us', p, 'F', fg);
      if (fg === '=') return;
      return ourAttack(fg, p, depth);
    }
    const r = rnd();
    if (r < 0.29) {
      if (chance(0.5)) touch('them', null, 'A', 'K');
      else touch('us', digger(), 'D', '=');
      return;
    }
    if (r < 0.39) {
      touch('them', null, 'A', 'E');
      return;
    }
    const blockers = frontRow().filter((id) => role.get(id) !== 'setter' || chance(0.4));
    if (r < 0.48) {
      const main = pick(blockers.map((id) => [id, role.get(id) === 'middle' ? 0.5 : 0.25]));
      const partners = blockers.filter((id) => id !== main);
      touch('us', main, 'B', 'P', { with: chance(0.4) && partners.length ? [any(partners)] : [] });
      return;
    }
    if (chance(0.6)) touch('them', null, 'A', 'C');
    if (chance(0.25) && blockers.length) touch('us', any(blockers), 'B', pick([['S', 0.55], ['T', 0.35], ['R', 0.1]]));
    const d = digger();
    const dg = pick([['#', 0.18], ['+', 0.3], ['!', 0.26], ['-', 0.2], ['/', 0.06]]);
    touch('us', d, 'D', dg, { difficulty: chance(0.25) ? 'hard' : 'normal' });
    if (dg === '/') return theirAttack(depth + 1);
    if (dg === '-' && chance(0.4)) {
      // Rescue only: we send a free ball and they attack again.
      return theirAttack(depth + 1);
    }
    return ourAttack(dg, d, depth);
  }

  function playRally() {
    const cur = built.current;
    if (cur.serving === 'us') {
      const server = court()[0].player;
      const g = pick([['#', 0.07], ['=', 0.1], ['in', 0.83]]);
      touch('us', server, 'S', g, { serveType: pick([['jumpfloat', 0.5], ['power', 0.3], ['float', 0.2]]) });
      if (g !== 'in') return;
      const rg = pick([['#', 0.22], ['+', 0.3], ['!', 0.2], ['-', 0.16], ['/o', 0.05], ['/f', 0.02], ['=', 0.05]]);
      touch('them', null, 'R', rg);
      if (rg === '=') return;
      if (rg === '/o' && chance(0.6)) {
        const p = any(frontRow().filter((id) => role.get(id) !== 'setter'));
        touch('us', p, 'A', pick([['K', 0.7], ['C', 0.2], ['E', 0.1]]), { attackType: 'overpass', direction: 'other' });
        const last = entries[entries.length - 1];
        if (last.grade !== 'C') return;
      }
      return theirAttack(0);
    }
    const g = pick([['#', 0.05], ['=', 0.09], ['in', 0.86]]);
    if (g === '#') {
      touch('them', null, 'S', '#');
      touch('us', receiver(), 'R', '=', { linked: true });
      return;
    }
    touch('them', null, 'S', g);
    if (g === '=') return;
    const rec = receiver();
    const rq = pick([['#', 0.24], ['+', 0.3], ['!', 0.2], ['-', 0.16], ['/o', 0.04], ['/f', 0.03], ['=', 0.03]]);
    touch('us', rec, 'R', rq);
    if (rq === '=') return;
    if (rq === '/o' || rq === '/f') return theirAttack(0);
    return ourAttack(rq, rec, 0);
  }

  // ---------- Match flow: sets, libero, substitutions, timeouts ----------

  const slots = [mb2, setter, oh1, mb1, opp, oh2]; // positions I–VI, setter in II → P2
  let run = { team: null, n: 0 };
  let sanctionDone = false;
  let replayDone = false;
  const subPlan = new Map([
    [2, { at: 13, out: oh2, in: oh3, back: 21 }],
    [4, { at: 9, out: mb1, in: mb3, back: 18 }],
  ]);

  const startSet = (n) => {
    const firstServe = n % 2 === 1 ? 'them' : 'us';
    // Each set starts one rotation further on, so all six rotations appear in the reports.
    const shift = (n - 1) % 6;
    const lineup = [...slots.slice(shift), ...slots.slice(0, shift)];
    add('setStart', { set: n, slots: lineup, liberos: [libero], firstServe });
    rebuild();
  };

  const liberoIn = () => {
    const set = built.current.set;
    if (set.libero || !set.liberos.length) return;
    const servingUs = built.current.serving === 'us';
    const spot = court().find(
      (c) => !isFront(c.pos) && role.get(c.nominal) === 'middle' && !(c.pos === 1 && servingUs)
    );
    if (spot) {
      add('libero', { action: 'in', libero, replaced: spot.nominal, slot: spot.slot });
      rebuild();
    }
  };

  startSet(1);
  liberoIn();
  let guard = 0;
  while (built.phase !== 'matchOver' && guard++ < 400) {
    if (built.phase === 'setOver') {
      startSet(built.sets.length + 1);
      liberoIn();
      run = { team: null, n: 0 };
      continue;
    }
    const set = built.current.set;

    const plan = subPlan.get(set.number);
    if (plan && plan.in) {
      const s = built.current.score;
      const slot = set.slotPlayers.indexOf(plan.out) + 1;
      if (!plan.done && s.us >= plan.at && slot > 0) {
        add('sub', { changes: [{ slot, out: plan.out, in: plan.in }], kind: 'normal', override: false, comment: '', warnings: [] });
        plan.done = true;
        rebuild();
      } else if (plan.done && !plan.returned && s.us >= plan.back) {
        const back = set.slotPlayers.indexOf(plan.in) + 1;
        if (back > 0) {
          add('sub', { changes: [{ slot: back, out: plan.in, in: plan.out }], kind: 'normal', override: false, comment: '', warnings: [] });
          plan.returned = true;
          rebuild();
        }
      }
    }

    if (run.n >= 3 && set.timeouts[run.team === 'us' ? 'them' : 'us'] < 2 && chance(0.6)) {
      add('timeout', { team: run.team === 'us' ? 'them' : 'us' });
      run.n = 0;
    }

    if (!sanctionDone && set.number === 3 && built.current.score.them >= 10) {
      add('sanction', { team: 'them', card: 'yellow', pointTo: null });
      sanctionDone = true;
    }

    playRally();
    rebuild();

    if (!replayDone && built.current.set?.number === 2 && built.current.score.us + built.current.score.them === 20) {
      // A challenge overturns the call: the last rally is replayed.
      add('replay', {});
      replayDone = true;
      rebuild();
    }

    const last = built.current.lastRally;
    if (last?.winner) run = last.winner === run.team ? { team: run.team, n: run.n + 1 } : { team: last.winner, n: 1 };
    if (built.phase === 'live') liberoIn();
  }

  const b = rebuild();
  match.status = b.phase === 'matchOver' ? 'finished' : 'active';
  match.summary = {
    setsWon: { ...b.setsWon },
    sets: b.sets.map((s) => ({ ...s.score })),
    set: b.current.set?.number ?? 0,
    score: b.current.score ?? { us: 0, them: 0 },
    phase: b.phase,
  };
  return { match, entries, built: b };
}
