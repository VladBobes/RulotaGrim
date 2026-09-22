const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { applyAbsent, applyPosition, applyPresent } = require('./attendance');

function emptyState() {
  return { lastResetAt: null, actions: [] };
}

function cloneStoredAction(action) {
  if (!action) return null;
  const next = {
    ...action,
    attendees: { ...(action.attendees || {}) },
    absences: { ...(action.absences || {}) },
  };
  if (action.tip === 'banca' || action.positions) {
    next.positions = { ...(action.positions || {}) };
    if (Array.isArray(action.positionNames)) next.positionNames = [...action.positionNames];
  }
  return next;
}

function createStore(filePath) {
  function read() {
    if (!fs.existsSync(filePath)) return emptyState();
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!data || !Array.isArray(data.actions)) return emptyState();
      return {
        lastResetAt: data.lastResetAt || null,
        actions: data.actions.map(cloneStoredAction),
      };
    } catch {
      return emptyState();
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  function listActions() {
    return read().actions.map(cloneStoredAction);
  }

  function getAction(id) {
    return cloneStoredAction(read().actions.find(action => action.id === id));
  }

  function replaceAction(action) {
    const data = read();
    const index = data.actions.findIndex(item => item.id === action.id);
    if (index < 0) return { ok: false, code: 'inactive', message: 'Acțiunea nu mai este activă.' };
    data.actions[index] = action;
    write(data);
    return { ok: true, action };
  }

  function createAction(input) {
    const now = input.createdAt || new Date().toISOString();
    const action = {
      id: input.id || crypto.randomUUID(),
      tip: input.tip,
      titlu: input.titlu,
      descriere: input.descriere,
      locatie: input.locatie || null,
      at: input.at,
      dateLabel: input.dateLabel,
      dateTimeLabel: input.dateTimeLabel,
      channelId: input.channelId || null,
      messageId: input.messageId || null,
      createdAt: now,
      attendees: {},
      absences: {},
    };
    if (input.tip === 'banca') {
      action.bankName = input.bankName;
      action.positionNames = [...(input.positionNames || [])];
      action.positions = {};
    }
    const data = read();
    data.actions.push(action);
    write(data);
    return cloneStoredAction(action);
  }

  function setMessageRef(id, channelId, messageId) {
    const action = getAction(id);
    if (!action) return { ok: false, code: 'inactive', message: 'Acțiunea nu mai este activă.' };
    action.channelId = channelId;
    action.messageId = messageId;
    return replaceAction(action);
  }

  function markPresent(id, userId, displayName, at) {
    const result = applyPresent(getAction(id), userId, displayName, at);
    if (!result.ok) return result;
    return replaceAction(result.action);
  }

  function markPosition(id, userId, displayName, position, at) {
    const result = applyPosition(getAction(id), userId, displayName, position, at);
    if (!result.ok) return result;
    return replaceAction(result.action);
  }

  function markAbsent(id, userId, displayName, at) {
    const result = applyAbsent(getAction(id), userId, displayName, at);
    if (!result.ok) return result;
    return replaceAction(result.action);
  }

  function reset(now = new Date()) {
    const lastResetAt = now.toISOString();
    write({ lastResetAt, actions: [] });
    return { lastResetAt };
  }

  function getState() {
    return read();
  }

  return {
    listActions,
    getAction,
    createAction,
    setMessageRef,
    markPresent,
    markPosition,
    markAbsent,
    reset,
    getState,
    filePath,
  };
}

module.exports = { createStore };
