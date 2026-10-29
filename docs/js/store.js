// Persistence in localStorage. Home Screen web apps on iOS keep their own storage that Safari's
// seven-day cleanup does not touch, but a backup file is still the only copy outside the phone.

const KEY = 'volleystats.v1';

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function empty() {
  return { version: 1, teams: [], matches: [] };
}

export function isValidData(data) {
  return Boolean(data) && Array.isArray(data.teams) && Array.isArray(data.matches);
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return isValidData(data) ? data : empty();
  } catch {
    return empty();
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Asks the browser not to evict our data under storage pressure. Best effort. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
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
  ];
  return {
    id: uid(),
    name: 'Демо-команда',
    createdAt: Date.now(),
    players: roster.map(([name, number, position]) => ({ id: uid(), name, number, position })),
  };
}
