// Full JSON export/import of a match: entries (with their history), roster, rule profile and
// scale version (spec §14 "Экспорт", T16).

import { SCALE_VERSION, DATA_VERSION } from './constants.js';

export const FORMAT = 'volleystats-match';

export function exportMatch(match, entries) {
  return {
    format: FORMAT,
    dataVersion: DATA_VERSION,
    scale: match.scale ?? SCALE_VERSION,
    exportedAt: new Date().toISOString(),
    match,
    entries: [...entries].sort((a, b) => a.order - b.order),
  };
}

export function parseMatchExport(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.format !== FORMAT || !data.match || !Array.isArray(data.entries)) {
    throw new Error('Это не файл матча Волейбол Стат');
  }
  if (data.dataVersion > DATA_VERSION) {
    throw new Error('Файл создан более новой версией приложения');
  }
  for (const e of data.entries) {
    if (!e.id || typeof e.order !== 'number' || !e.type) throw new Error('Повреждённая запись в журнале');
    e.matchId = data.match.id;
  }
  return { match: data.match, entries: data.entries };
}
