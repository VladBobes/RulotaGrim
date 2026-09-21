const fs = require('fs');
const path = require('path');
const { isValidCnp, items } = require('../allocation');
const { cleanPlayerName } = require('./player-label');

function createStore(filePath) {
  function read() {
    if (!fs.existsSync(filePath)) return { submissions: [] };
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data || !Array.isArray(data.submissions)) return { submissions: [] };
    return data;
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  function list() {
    return read().submissions.map(entry => ({
      ...entry,
      quantities: { ...entry.quantities },
    }));
  }

  function upsert(entry) {
    const cnp = String(entry.cnp || '').trim();
    if (!isValidCnp(cnp)) return { ok: false, code: 'cnp' };

    const quantities = {};
    let total = 0;
    for (const item of items) {
      const value = Number(entry.quantities?.[item.key] ?? 0);
      if (!Number.isInteger(value) || value < 0) return { ok: false, code: 'qty' };
      quantities[item.key] = value;
      total += value;
    }
    if (total === 0) return { ok: false, code: 'empty' };

    const rawName = String(entry.name || '').trim();
    if (!rawName) return { ok: false, code: 'name' };
    const name = cleanPlayerName(rawName, cnp) || rawName;
    if (!entry.userId) return { ok: false, code: 'user' };

    const data = read();
    const taken = data.submissions.find(s => s.cnp === cnp && s.userId !== entry.userId);
    if (taken) return { ok: false, code: 'cnp_taken' };

    const next = {
      userId: entry.userId,
      name,
      cnp,
      quantities,
      updatedAt: new Date().toISOString(),
    };
    const index = data.submissions.findIndex(s => s.userId === entry.userId);
    const replaced = index >= 0;
    if (replaced) data.submissions[index] = next;
    else data.submissions.push(next);
    write(data);
    return { ok: true, replaced, submission: next };
  }

  function clear() {
    write({ submissions: [] });
  }

  return { list, upsert, clear, filePath };
}

module.exports = { createStore };
