// Application state and every write operation. Screens read `state` and call these functions;
// nothing in here touches the DOM.

import * as db from './db.js';
import { buildMatch, byOrder } from './model/engine.js';
import { RULE_PROFILES, SCALE_VERSION } from './model/constants.js';

export const state = {
  teams: [],
  matches: [],
  settings: null,
  current: null, // { match, entries, built }
  redo: [],
  ui: {},
};

export const DEFAULT_SETTINGS = {
  key: 'settings',
  author: 'Статистик',
  smallSample: 20,
  keys: {
    S: 'KeyS',
    R: 'KeyR',
    E: 'KeyE',
    A: 'KeyA',
    B: 'KeyB',
    D: 'KeyD',
    C: 'KeyC',
    F: 'KeyF',
    opponent: 'KeyO',
    pointUs: 'Equal',
    pointThem: 'Minus',
  },
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------- Loading ----------

export async function loadAll() {
  const [teams, matches, settings] = await Promise.all([db.getAll('teams'), db.getAll('matches'), db.get('settings', 'settings')]);
  state.teams = teams;
  state.matches = matches;
  state.settings = { ...DEFAULT_SETTINGS, ...settings, keys: { ...DEFAULT_SETTINGS.keys, ...settings?.keys } };
  await migrateLegacy();
}

/** Teams from the first, localStorage-based version are carried over once. */
async function migrateLegacy() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem('volleystats.v1'));
  } catch {
    legacy = null;
  }
  if (!legacy?.teams?.length || localStorage.getItem('volleystats.v1.migrated')) return;
  for (const t of legacy.teams) {
    if (state.teams.some((x) => x.id === t.id)) continue;
    const team = {
      id: t.id,
      name: t.name,
      createdAt: t.createdAt ?? Date.now(),
      players: (t.players ?? []).map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position ?? 'universal' })),
    };
    await db.put('teams', team);
    state.teams.push(team);
  }
  localStorage.setItem('volleystats.v1.migrated', '1');
}

export async function openMatch(id) {
  if (state.current?.match.id === id) return state.current;
  const match = state.matches.find((m) => m.id === id);
  if (!match) return null;
  const entries = await db.entriesOf(id);
  entries.sort(byOrder);
  state.current = { match, entries, built: null };
  state.redo = [];
  rebuild();
  return state.current;
}

export function rebuild() {
  const cur = state.current;
  if (cur) cur.built = buildMatch(cur.match, cur.entries);
  return cur?.built;
}

// ---------- Teams ----------

export async function saveTeam(team) {
  await db.put('teams', team);
  const i = state.teams.findIndex((t) => t.id === team.id);
  if (i === -1) state.teams.push(team);
  else state.teams[i] = team;
}

export async function deleteTeam(id) {
  await db.remove('teams', id);
  state.teams = state.teams.filter((t) => t.id !== id);
}

export function demoTeam() {
  const roster = [
    ['Иванов', 1, 'setter'],
    ['Петров', 4, 'outside'],
    ['Сидоров', 7, 'outside'],
    ['Смирнов', 9, 'opposite'],
    ['Кузнецов', 11, 'middle'],
    ['Попов', 13, 'middle'],
    ['Васильев', 17, 'libero'],
    ['Новиков', 5, 'outside'],
    ['Морозов', 3, 'setter'],
    ['Волков', 15, 'middle'],
  ];
  return {
    id: uid(),
    name: 'Демо-команда',
    createdAt: Date.now(),
    players: roster.map(([name, number, position]) => ({ id: uid(), name, number, position })),
  };
}

// ---------- Matches ----------

export function newMatch({ team, opponent, tournament, date, profileKey, profile, system, mode, roster }) {
  return {
    id: uid(),
    teamId: team.id,
    teamName: team.name,
    opponent,
    tournament,
    date,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    profileKey,
    profile: { ...RULE_PROFILES[profileKey], ...profile },
    system,
    mode,
    scale: SCALE_VERSION,
    roster,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function saveMatch(match) {
  match.updatedAt = Date.now();
  await db.put('matches', match);
  const i = state.matches.findIndex((m) => m.id === match.id);
  if (i === -1) state.matches.push(match);
  else state.matches[i] = match;
  if (state.current?.match.id === match.id) {
    state.current.match = match;
    rebuild();
  }
}

export async function deleteMatch(id) {
  await db.deleteMatch(id);
  state.matches = state.matches.filter((m) => m.id !== id);
  if (state.current?.match.id === id) state.current = null;
}

export async function importMatch(match, entries) {
  await db.replaceMatch(match, entries);
  const i = state.matches.findIndex((m) => m.id === match.id);
  if (i === -1) state.matches.push(match);
  else state.matches[i] = match;
  if (state.current?.match.id === match.id) state.current = null;
}

// ---------- Log ----------

function nextOrder() {
  const entries = state.current.entries;
  return entries.length ? entries[entries.length - 1].order + 1 : 1;
}

function stamp() {
  return { createdAt: new Date().toISOString(), author: state.settings.author };
}

async function persistEntry(e) {
  await db.put('entries', e);
}

/** Keeps a small summary on the match document so the match list needs no log replay. */
async function touchMatchStatus() {
  const cur = state.current;
  const b = cur.built;
  cur.match.status = b.phase === 'matchOver' ? 'finished' : 'active';
  cur.match.summary = {
    setsWon: { ...b.setsWon },
    sets: b.sets.map((s) => ({ ...s.score })),
    set: b.current.set?.number ?? 0,
    score: b.current.score ?? { us: 0, them: 0 },
    phase: b.phase,
  };
  cur.match.updatedAt = Date.now();
  await db.put('matches', cur.match);
}

/** Appends one entry to the open match. The local write completes before the screen updates. */
export async function addEntry(type, payload = {}) {
  const cur = state.current;
  const e = { id: uid(), matchId: cur.match.id, order: nextOrder(), type, ...payload, ...stamp(), version: 1, deleted: false, history: [] };
  await persistEntry(e);
  cur.entries.push(e);
  state.redo = [];
  rebuild();
  await touchMatchStatus();
  return e;
}

/** Inserts an entry right after `afterId` (or at the start when null), between existing orders. */
export async function insertEntry(afterId, type, payload = {}) {
  const cur = state.current;
  const list = cur.entries;
  const i = afterId ? list.findIndex((x) => x.id === afterId) : -1;
  const prev = i >= 0 ? list[i].order : 0;
  const next = list[i + 1]?.order ?? prev + 2;
  const e = {
    id: uid(),
    matchId: cur.match.id,
    order: (prev + next) / 2,
    type,
    ...payload,
    ...stamp(),
    version: 1,
    deleted: false,
    history: [{ at: new Date().toISOString(), author: state.settings.author, action: 'inserted' }],
  };
  await persistEntry(e);
  list.splice(i + 1, 0, e);
  rebuild();
  await touchMatchStatus();
  return e;
}

/** Fills in details of an entry being recorded right now (direction, set target…). No history. */
export async function setFields(id, fields) {
  const e = state.current.entries.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, fields);
  await persistEntry(e);
  rebuild();
}

/** A correction after the fact: the previous version is kept with author, time and reason. */
export async function amendEntry(id, fields, reason = '') {
  const e = state.current.entries.find((x) => x.id === id);
  if (!e) return;
  const before = {};
  for (const k of Object.keys(fields)) before[k] = e[k];
  e.history = [...(e.history ?? []), { at: new Date().toISOString(), author: state.settings.author, reason, before }];
  Object.assign(e, fields);
  e.version = (e.version ?? 1) + 1;
  await persistEntry(e);
  rebuild();
  await touchMatchStatus();
}

export async function deleteEntry(id, reason = '') {
  await amendEntry(id, { deleted: true }, reason || 'Удалено');
}

export function lastActiveEntry() {
  const list = state.current?.entries ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].deleted) return list[i];
  return null;
}

export async function undo() {
  const e = lastActiveEntry();
  if (!e) return null;
  await amendEntry(e.id, { deleted: true }, 'Отмена');
  state.redo.push(e.id);
  return e;
}

export async function redo() {
  const id = state.redo.pop();
  if (!id) return null;
  await amendEntry(id, { deleted: false }, 'Повтор');
  return id;
}

// ---------- Settings ----------

export async function saveSettings(settings) {
  state.settings = settings;
  await db.put('settings', settings);
}

// ---------- Lookups ----------

export function rosterMap(match = state.current?.match) {
  return new Map((match?.roster ?? []).map((p) => [p.playerId, p]));
}

export function playerLabel(id, map = rosterMap()) {
  if (!id) return 'Игрок не указан';
  const p = map.get(id);
  return p ? `#${p.number} ${p.name}` : 'Игрок';
}
