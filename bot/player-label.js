function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanPlayerName(name, cnp) {
  let cleaned = String(name ?? '').trim();
  const id = String(cnp ?? '').trim();
  if (!cleaned || !id) return cleaned;

  const trailing = new RegExp(`\\s*\\|\\s*${escapeRegExp(id)}\\s*$`);
  while (trailing.test(cleaned)) {
    const next = cleaned.replace(trailing, '').trim();
    if (!next || next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

function formatPlayerLabel(name, cnp) {
  const id = String(cnp ?? '').trim();
  const cleaned = cleanPlayerName(name, id);
  if (!cleaned) return id;
  if (!id) return cleaned;
  return `${cleaned} | ${id}`;
}

module.exports = { cleanPlayerName, formatPlayerLabel };
