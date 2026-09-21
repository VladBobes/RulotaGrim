const { formatBucharest } = require('./datetime');
const { actionChoiceLabel } = require('./validation');

const ATTENDANCE_MESSAGES = {
  inactive: 'Acțiunea nu mai este activă.',
  already: 'Ești deja înscris la acțiunea asta.',
  marked_absent: 'Ai fost marcat absent la acțiunea asta.',
  never_present: 'Utilizatorul nu s-a înscris la acțiunea asta.',
  already_absent: 'Utilizatorul este deja marcat absent la acțiunea asta.',
};

function clonePeople(map = {}) {
  const next = {};
  for (const [userId, info] of Object.entries(map)) {
    next[userId] = { ...info };
  }
  return next;
}

function cloneAction(action) {
  if (!action) return null;
  return {
    ...action,
    attendees: clonePeople(action.attendees),
    absences: clonePeople(action.absences),
  };
}

function applyPresent(action, userId, displayName, at = new Date().toISOString()) {
  if (!action) return { ok: false, code: 'inactive', message: ATTENDANCE_MESSAGES.inactive };
  const id = String(userId || '').trim();
  if (!id) return { ok: false, code: 'user', message: 'Nu am putut identifica utilizatorul Discord.' };
  if (action.absences?.[id]) {
    return { ok: false, code: 'marked_absent', message: ATTENDANCE_MESSAGES.marked_absent, action: cloneAction(action) };
  }
  if (action.attendees?.[id]) {
    return { ok: false, code: 'already', message: ATTENDANCE_MESSAGES.already, action: cloneAction(action) };
  }
  const next = cloneAction(action);
  next.attendees[id] = {
    displayName: String(displayName || '').trim() || id,
    at,
  };
  return { ok: true, action: next };
}

function applyAbsent(action, userId, displayName, at = new Date().toISOString()) {
  if (!action) return { ok: false, code: 'inactive', message: ATTENDANCE_MESSAGES.inactive };
  const id = String(userId || '').trim();
  if (!id) return { ok: false, code: 'user', message: 'Nu am putut identifica utilizatorul Discord.' };
  if (action.absences?.[id]) {
    return { ok: false, code: 'already_absent', message: ATTENDANCE_MESSAGES.already_absent, action: cloneAction(action) };
  }
  if (!action.attendees?.[id]) {
    return { ok: false, code: 'never_present', message: ATTENDANCE_MESSAGES.never_present, action: cloneAction(action) };
  }
  const next = cloneAction(action);
  const keptName = next.attendees[id].displayName || String(displayName || '').trim() || id;
  delete next.attendees[id];
  next.absences[id] = { displayName: keptName, at };
  return { ok: true, action: next };
}

function presentNames(action) {
  return Object.values(action?.attendees || {}).map(entry => entry.displayName);
}

function absentNames(action) {
  return Object.values(action?.absences || {}).map(entry => entry.displayName);
}

function formatAttendanceSections(action) {
  const presents = presentNames(action);
  const absents = absentNames(action);
  const presentText = `Prezenți (${presents.length}):\n${presents.length ? presents.join(', ') : 'nimeni încă'}`;
  const sections = [presentText];
  if (absents.length) {
    sections.push(`Absenți (${absents.length}):\n${absents.join(', ')}`);
  }
  return sections.join('\n\n');
}

function oldestActionTime(actions) {
  let min = null;
  for (const action of actions || []) {
    for (const field of [action.createdAt, action.at]) {
      const time = Date.parse(field);
      if (!Number.isFinite(time)) continue;
      if (min == null || time < min) min = time;
    }
  }
  return min == null ? null : new Date(min);
}

function intervalBounds(state, now = new Date()) {
  if (state?.lastResetAt) {
    return { start: new Date(state.lastResetAt), end: now, note: null };
  }
  const oldest = oldestActionTime(state?.actions);
  return { start: oldest || now, end: now, note: 'fără reset anterior' };
}

function romanianCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatPersonLine(person) {
  let line = `${person.name} - ${romanianCount(person.presents.length, 'acțiune', 'acțiuni')}`;
  if (person.presents.length) {
    line += ` (${person.presents.join(', ')})`;
  }
  if (person.absences.length) {
    line += `, ${romanianCount(person.absences.length, 'absență', 'absențe')} (${person.absences.join(', ')})`;
  }
  return line;
}

function formatListaActiuni(state, now = new Date()) {
  const { start, end, note } = intervalBounds(state, now);
  const header = `În intervalul ${formatBucharest(start)} - ${formatBucharest(end)}${note ? ` (${note})` : ''}:`;
  const people = new Map();

  const actions = [...(state?.actions || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const action of actions) {
    const label = actionChoiceLabel(action);
    for (const [userId, info] of Object.entries(action.attendees || {})) {
      if (!people.has(userId)) people.set(userId, { name: info.displayName, presents: [], absences: [] });
      const person = people.get(userId);
      if (info.displayName) person.name = info.displayName;
      person.presents.push(label);
    }
    for (const [userId, info] of Object.entries(action.absences || {})) {
      if (!people.has(userId)) people.set(userId, { name: info.displayName, presents: [], absences: [] });
      const person = people.get(userId);
      if (info.displayName) person.name = info.displayName;
      person.absences.push(label);
    }
  }

  const rows = [...people.values()]
    .filter(person => person.presents.length > 0 || person.absences.length > 0)
    .sort((a, b) => b.presents.length - a.presents.length || a.name.localeCompare(b.name, 'ro', { sensitivity: 'base' }))
    .map(formatPersonLine);

  if (!rows.length) {
    return `${header}\nNimeni nu are prezență în interval.`;
  }
  return [header, ...rows].join('\n');
}

function chunkText(text, limit = 2000) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const block of text.split('\n')) {
    const next = current ? `${current}\n${block}` : block;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) parts.push(current);
    if (block.length <= limit) {
      current = block;
      continue;
    }
    for (let i = 0; i < block.length; i += limit) parts.push(block.slice(i, i + limit));
    current = '';
  }
  if (current) parts.push(current);
  return parts;
}

module.exports = {
  ATTENDANCE_MESSAGES,
  applyPresent,
  applyAbsent,
  presentNames,
  absentNames,
  formatAttendanceSections,
  oldestActionTime,
  intervalBounds,
  formatListaActiuni,
  chunkText,
};
