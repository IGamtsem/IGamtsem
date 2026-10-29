// Rebuilds the whole match from its entry log (spec §4: the log is the single source of truth).
// Every report and every screen reads the result of buildMatch(); nothing derived is stored.

import { touchWinner, other, isFront, GRADES, UNKNOWN_GRADE } from './constants.js';

/** Court position (1–6) of a serve-order slot after `shift` rotations. */
export function positionOfSlot(slot, shift) {
  return ((((slot - 1 - shift) % 6) + 6) % 6) + 1;
}

/** Serve-order slot standing in court position `pos` after `shift` rotations. */
export function slotAtPosition(pos, shift) {
  return ((pos - 1 + shift) % 6) + 1;
}

export const byOrder = (a, b) => a.order - b.order;

export function setTarget(profile, setNumber) {
  return setNumber === profile.bestOf ? profile.decidingSetPoints : profile.pointsPerSet;
}

export function setsToWin(profile) {
  return Math.floor(profile.bestOf / 2) + 1;
}

export function setWinnerByRules(profile, setNumber, score) {
  const target = setTarget(profile, setNumber);
  const winBy = profile.winBy ?? 2;
  if (score.us >= target && score.us - score.them >= winBy) return 'us';
  if (score.them >= target && score.them - score.us >= winBy) return 'them';
  return null;
}

/** Point reason for the rally winner, derived from the touch that ended it. */
export function reasonFromTouch(touch, winner) {
  const { skill, grade } = touch;
  if (touch.team === winner) {
    if (skill === 'S' && grade === '#') return 'ace';
    if (skill === 'A' && grade === 'K') return 'kill';
    if (skill === 'B' && grade === 'P') return 'block';
    return 'unknown';
  }
  if (skill === 'S' && grade === '=') return 'serveError';
  if (skill === 'A' && grade === 'B') return 'block';
  if (skill === 'R' && grade === '=') return 'ace';
  if (skill === 'D' && grade === '=') return 'kill';
  return 'error';
}

function setterSlotsOf(slots, roster) {
  const out = [];
  slots.forEach((id, i) => {
    if (roster.get(id)?.position === 'setter') out.push(i + 1);
  });
  return out;
}

function newSet(entry, number, roster) {
  const slots = entry.slots.slice(0, 6);
  return {
    number,
    entryId: entry.id,
    startSlots: slots.slice(),
    setterSlots: entry.setterSlots?.length ? entry.setterSlots.slice() : setterSlotsOf(slots, roster),
    liberos: (entry.liberos ?? []).filter(Boolean),
    firstServe: entry.firstServe,
    score: { us: 0, them: 0 },
    serving: entry.firstServe,
    shift: 0,
    slotPlayers: slots.slice(),
    libero: null,
    subs: 0,
    timeouts: { us: 0, them: 0 },
    ended: false,
    winner: null,
    rallies: [],
    flow: [{ us: 0, them: 0, by: null }],
    discrepancy: null,
  };
}

/** Who is physically in each court position (index 0 = position 1), libero applied. */
export function courtOf(set) {
  return [1, 2, 3, 4, 5, 6].map((pos) => {
    const slot = slotAtPosition(pos, set.shift);
    const nominal = set.slotPlayers[slot - 1];
    const libero = set.libero && set.libero.slot === slot ? set.libero.id : null;
    return { pos, slot, nominal, player: libero ?? nominal, libero: Boolean(libero) };
  });
}

function activeSetterOf(set, system) {
  const slots = set.setterSlots;
  if (!slots.length) return { player: null, slot: null };
  let slot = slots[0];
  if (slots.length > 1) {
    const wantFront = system === '4-2';
    slot = slots.find((s) => isFront(positionOfSlot(s, set.shift)) === wantFront) ?? slots[0];
  }
  return { player: set.slotPlayers[slot - 1], slot };
}

function snapshotOf(set, system) {
  const court = courtOf(set);
  const setter = activeSetterOf(set, system);
  const refSlot = set.setterSlots[0];
  const setterPos = setter.slot ? positionOfSlot(setter.slot, set.shift) : null;
  return {
    set: set.number,
    shift: set.shift,
    scheme: `Партия ${set.number}`,
    pLabel: refSlot ? `P${positionOfSlot(refSlot, set.shift)}` : null,
    court,
    onCourt: court.map((c) => c.player),
    front: court.filter((c) => isFront(c.pos)).map((c) => c.player),
    libero: set.libero ? { ...set.libero } : null,
    setter: setter.player,
    setterLine: setterPos == null ? null : isFront(setterPos) ? 'front' : 'back',
  };
}

function stateOf(set) {
  return {
    score: { ...set.score },
    serving: set.serving,
    shift: set.shift,
    libero: set.libero ? { ...set.libero } : null,
    ended: set.ended,
    winner: set.winner,
  };
}

/**
 * Builds the full match state.
 * @param match  match document (profile, roster, system)
 * @param entries raw log entries, including soft-deleted ones (they are skipped)
 */
export function buildMatch(match, entries) {
  const roster = new Map((match.roster ?? []).map((p) => [p.playerId, p]));
  const profile = match.profile;
  const log = entries.filter((e) => !e.deleted).sort(byOrder);

  const out = {
    sets: [],
    rallies: [],
    timeline: [],
    notices: [],
    sanctions: [],
    phase: 'needSetStart',
    setsWon: { us: 0, them: 0 },
  };

  let set = null;
  let open = null;
  let rallyCounter = 0;

  const notice = (kind, text, extra = {}) => {
    const n = { kind, text, set: set?.number ?? null, ...extra };
    out.notices.push(n);
    out.timeline.push({ kind: 'notice', notice: n });
    return n;
  };

  const countSets = () => {
    out.setsWon = {
      us: out.sets.filter((s) => s.ended && s.winner === 'us').length,
      them: out.sets.filter((s) => s.ended && s.winner === 'them').length,
    };
  };

  const endSet = (winner) => {
    set.ended = true;
    set.winner = winner;
    countSets();
    const need = setsToWin(profile);
    out.phase = out.setsWon.us >= need || out.setsWon.them >= need || set.number >= profile.bestOf ? 'matchOver' : 'setOver';
  };

  const rotateUs = () => {
    set.shift = (set.shift + 1) % 6;
    if (set.libero && isFront(positionOfSlot(set.libero.slot, set.shift))) {
      const { id, replaced } = set.libero;
      set.libero = null;
      notice('liberoAutoOut', 'Либеро ушёл с передней линии, вернулся замещённый игрок', { libero: id, replaced });
    }
  };

  /** Score a point for `winner`; rotation and serve follow the rules (spec §10). */
  const awardPoint = (winner, by) => {
    set.score[winner] += 1;
    set.flow.push({ us: set.score.us, them: set.score.them, by });
    if (winner !== set.serving) {
      if (winner === 'us') rotateUs();
      set.serving = winner;
    }
    const w = setWinnerByRules(profile, set.number, set.score);
    if (w) endSet(w);
  };

  const openRally = () => {
    rallyCounter += 1;
    const snap = snapshotOf(set, match.system);
    const rally = {
      id: `r${rallyCounter}`,
      index: rallyCounter,
      set: set.number,
      setIndex: set.rallies.length + 1,
      serving: set.serving,
      receiving: other(set.serving),
      scoreBefore: { ...set.score },
      scoreAfter: null,
      snap,
      stateBefore: stateOf(set),
      touches: [],
      linked: [],
      winner: null,
      reason: null,
      reasonSource: null,
      endEntryId: null,
      replayed: false,
      warnings: [],
      needsCheck: Boolean(set.discrepancy),
      entryIds: [],
    };
    if (set.serving === 'us' && set.libero && positionOfSlot(set.libero.slot, set.shift) === 1 && !profile.liberoCanServe) {
      rally.warnings.push('Либеро на подаче, а профиль правил это запрещает');
    }
    set.rallies.push(rally);
    out.rallies.push(rally);
    out.timeline.push({ kind: 'rally', rally });
    return rally;
  };

  const flagDiscrepancy = (rally, text) => {
    rally.warnings.push(text);
    if (!set.discrepancy) set.discrepancy = { rally: rally.id, text };
    rally.needsCheck = true;
  };

  const closeRally = (rally, winner, reason, source, entryId) => {
    rally.winner = winner;
    rally.reason = reason;
    rally.reasonSource = source;
    rally.endEntryId = entryId;
    awardPoint(winner, rally.id);
    rally.scoreAfter = { ...set.score };
    open = null;
  };

  for (const e of log) {
    switch (e.type) {
      case 'setStart': {
        if (set && !set.ended) {
          const w = set.score.us === set.score.them ? null : set.score.us > set.score.them ? 'us' : 'them';
          notice('warning', `Партия ${set.number} не была завершена по счёту, начата следующая`);
          endSet(w);
        }
        open = null;
        set = newSet(e, out.sets.length + 1, roster);
        out.sets.push(set);
        out.phase = 'live';
        out.timeline.push({ kind: 'setStart', set: set.number, entry: e });
        break;
      }

      case 'touch': {
        if (!set || set.ended) {
          notice('warning', 'Действие записано вне партии и не учтено', { entry: e.id });
          break;
        }
        const touch = { ...e };
        if (e.linked) {
          const last = [...set.rallies].reverse().find((r) => r.winner && !r.replayed);
          if (last) {
            touch.rally = last.id;
            last.linked.push(touch);
            last.entryIds.push(e.id);
            break;
          }
        }
        const rally = open ?? (open = openRally());
        touch.rally = rally.id;
        rally.touches.push(touch);
        rally.entryIds.push(e.id);

        if (touch.team === 'us' && touch.skill === 'S') {
          const server = rally.snap.court[0].player;
          if (rally.serving !== 'us') flagDiscrepancy(rally, 'Подача нашей команды, хотя по журналу подаёт соперник');
          else if (touch.player && server && touch.player !== server) {
            flagDiscrepancy(rally, 'Подающий не совпадает с расстановкой');
          }
        }
        if (touch.team === 'us' && touch.skill === 'R' && rally.serving === 'us') {
          flagDiscrepancy(rally, 'Приём нашей команды на нашей подаче');
        }

        const winner = touchWinner(touch);
        if (winner) closeRally(rally, winner, reasonFromTouch(touch, winner), 'touch', e.id);
        break;
      }

      case 'point': {
        if (!set || set.ended) {
          notice('warning', 'Очко записано вне партии и не учтено', { entry: e.id });
          break;
        }
        const rally = open ?? openRally();
        rally.entryIds.push(e.id);
        closeRally(rally, e.winner, e.reason || 'unknown', 'explicit', e.id);
        break;
      }

      case 'replay': {
        if (!set) break;
        if (open) {
          open.replayed = true;
          open.entryIds.push(e.id);
          open = null;
        } else {
          const last = [...set.rallies].reverse().find((r) => r.winner && !r.replayed);
          if (!last) break;
          const wasEnded = set.ended;
          Object.assign(set, {
            score: { ...last.stateBefore.score },
            serving: last.stateBefore.serving,
            shift: last.stateBefore.shift,
            ended: false,
            winner: null,
          });
          set.flow.push({ us: set.score.us, them: set.score.them, by: 'replay' });
          last.replayed = true;
          last.entryIds.push(e.id);
          if (wasEnded) {
            countSets();
            out.phase = 'live';
          }
        }
        out.timeline.push({ kind: 'replay', entry: e, set: set.number });
        break;
      }

      case 'sub': {
        if (!set || set.ended) break;
        const applied = [];
        for (const ch of e.changes ?? []) {
          const idx = ch.slot - 1;
          if (set.slotPlayers[idx] !== ch.out) {
            notice('warning', 'Замена: уходящий игрок не стоял в этом слоте', { entry: e.id });
          }
          set.slotPlayers[idx] = ch.in;
          if (set.libero && set.libero.replaced === ch.out && set.libero.slot === ch.slot) set.libero.replaced = ch.in;
          applied.push(ch);
        }
        set.subs += applied.length;
        if (set.subs > profile.subsPerSet && !e.override) {
          notice('warning', `Превышен лимит замен (${profile.subsPerSet}) в партии ${set.number}`, { entry: e.id });
        }
        if (open && open.touches.length === 0) open = null;
        out.timeline.push({ kind: 'sub', entry: e, set: set.number, score: { ...set.score } });
        break;
      }

      case 'libero': {
        if (!set || set.ended) break;
        if (e.action === 'in') {
          const pos = positionOfSlot(e.slot, set.shift);
          if (isFront(pos)) notice('warning', 'Либеро введён в переднюю линию', { entry: e.id });
          set.libero = { id: e.libero, slot: e.slot, replaced: e.replaced };
        } else {
          set.libero = null;
        }
        out.timeline.push({ kind: 'libero', entry: e, set: set.number, score: { ...set.score } });
        break;
      }

      case 'timeout': {
        if (!set) break;
        set.timeouts[e.team] += 1;
        out.timeline.push({ kind: 'timeout', entry: e, set: set.number, score: { ...set.score } });
        break;
      }

      case 'sanction': {
        if (!set || set.ended) break;
        const item = { entry: e, set: set.number, scoreBefore: { ...set.score } };
        if (e.pointTo) awardPoint(e.pointTo, 'sanction');
        item.scoreAfter = { ...set.score };
        out.sanctions.push(item);
        out.timeline.push({ kind: 'sanction', ...item });
        break;
      }

      case 'setEnd': {
        if (!set || set.ended) break;
        const w = set.score.us === set.score.them ? null : set.score.us > set.score.them ? 'us' : 'them';
        endSet(w);
        out.timeline.push({ kind: 'setEnd', entry: e, set: set.number });
        break;
      }

      default:
        break;
    }
  }

  if (set && !set.ended && out.phase !== 'live') out.phase = 'live';
  out.current = currentOf(out, set, open, match.system);
  for (const r of out.rallies) analyzeRally(r);
  return out;
}

function currentOf(out, set, open, system) {
  if (!set) return { phase: out.phase, set: null };
  const snap = snapshotOf(set, system);
  return {
    phase: out.phase,
    set,
    score: { ...set.score },
    serving: set.serving,
    snap,
    openRally: open,
    lastRally: [...set.rallies].reverse().find((r) => r.winner || r.replayed) ?? null,
  };
}

// ---------- Possessions, links and completeness (spec §4 "Связи событий", §15) ----------

const FIRST_TOUCH = new Set(['R', 'D', 'C', 'F']);

export function analyzeRally(rally) {
  const possessions = [];
  const lastAttack = { us: null, them: null };
  const lastServe = { us: null, them: null };
  let cur = null;

  for (const t of rally.touches) {
    t.possession = null;
    t.inputTouch = null;
    t.nextAttack = null;
    t.setTouch = null;
    t.assistBy = undefined;
    t.attackLink = null;
    t.phase = null;

    if (t.skill === 'B') {
      t.attackLink = lastAttack[other(t.team)];
      continue;
    }
    const prev = cur?.touches[cur.touches.length - 1];
    // The ball crosses the net after a serve or an attack, even when the other side's touches are not recorded.
    if (!cur || cur.team !== t.team || prev?.skill === 'A' || prev?.skill === 'S') {
      cur = { team: t.team, touches: [], first: t.skill };
      possessions.push(cur);
    }
    t.possession = possessions.length;
    cur.touches.push(t);

    if (t.skill === 'S') lastServe[t.team] = t;
    if (t.skill === 'R') t.attackLink = lastServe[other(t.team)];
    if (t.skill === 'D') t.attackLink = lastAttack[other(t.team)];
    if (t.skill === 'A') lastAttack[t.team] = t;
  }

  for (const p of possessions) {
    p.input = FIRST_TOUCH.has(p.first) ? p.first : p.first === 'S' ? 'S' : 'unknown';
    p.touches.forEach((t, i) => {
      const before = p.touches[i - 1] ?? null;
      const after = p.touches[i + 1] ?? null;
      if (t.skill === 'E') {
        t.inputTouch = before && FIRST_TOUCH.has(before.skill) ? before : null;
        t.nextAttack = after && after.skill === 'A' ? after : null;
      }
      if (t.skill === 'A') {
        t.setTouch = before && before.skill === 'E' ? before : null;
        t.phase = FIRST_TOUCH.has(p.input) ? p.input : 'unknown';
        if (t.grade === 'K') {
          // Assist: the partner's last preparing touch before a kill; at most one per kill (spec §8).
          t.assistBy = before && before.player && before.player !== t.player ? before.player : null;
        }
      }
    });
  }

  rally.possessions = possessions;

  const gaps = [];
  if (!rally.replayed && rally.winner) {
    if (rally.touches.length === 0) gaps.push('Записан только результат');
    else {
      // The opponent's serve is rarely scouted live; only our own serve is required for completeness.
      const serve = rally.touches.find((t) => t.skill === 'S' && t.team === rally.serving);
      if (!serve && rally.serving === 'us') gaps.push('Нет подачи');
      const endedOnServe = serve && serve === rally.touches.find((t) => GRADES.S[t.grade]?.ends && t.skill === 'S');
      if (rally.serving === 'them' && !endedOnServe && !rally.touches.some((t) => t.team === 'us' && t.skill === 'R')) {
        gaps.push('Нет приёма');
      }
      for (const p of possessions) {
        if (p.team === 'us' && !FIRST_TOUCH.has(p.first) && p.first !== 'S') {
          gaps.push('Пропущено первое касание владения');
          break;
        }
      }
    }
  }
  rally.gaps = gaps;
  rally.complete = gaps.length === 0;

  // The receiving team's first reception after a serve in play, for serve pressure (spec §9).
  const serve = rally.touches.find((t) => t.skill === 'S');
  if (serve) {
    serve.reception = rally.touches.find((t) => t.skill === 'R' && t.team !== serve.team) ?? null;
  }
  return rally;
}

/** Valid, finished rallies — the base of all main reports (replays excluded, spec T12). */
export const playedRallies = (built) => built.rallies.filter((r) => r.winner && !r.replayed);

export const isGraded = (t) => t.grade && t.grade !== UNKNOWN_GRADE;

export const gradeExists = (skill, grade) => Boolean(GRADES[skill]?.[grade]);
