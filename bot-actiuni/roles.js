const COMMAND_ROLE_ENV = {
  planifica: 'STAFF_ROLE_IDS',
  banca: 'STAFF_ROLE_IDS',
  absent: 'STAFF_ROLE_IDS',
  reset_actiuni: 'STAFF_ROLE_IDS',
  lista_actiuni: 'STAFF_ROLE_IDS',
  'rezultate-banci': 'STAFF_ROLE_IDS',
};

const MESSAGES = {
  missing: 'Nu ai rolul necesar pentru comanda asta.',
  unconfigured: 'Lista de roluri nu este configurată pe bot.',
};

function parseRoleIds(raw) {
  if (raw == null) return [];
  return String(raw)
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);
}

function memberRoleIds(member) {
  if (!member || member.roles == null) return [];
  const { roles } = member;
  if (Array.isArray(roles)) {
    return roles.map(id => String(id).trim()).filter(Boolean);
  }
  const cache = roles.cache;
  if (cache == null) return [];
  if (typeof cache.keys === 'function') {
    return [...cache.keys()].map(id => String(id).trim()).filter(Boolean);
  }
  if (Array.isArray(cache)) {
    return cache.map(id => String(id).trim()).filter(Boolean);
  }
  return [];
}

function isAllowed(memberIds, configuredIds) {
  if (!configuredIds || configuredIds.length === 0) return false;
  const allowed = new Set(configuredIds);
  return memberIds.some(id => allowed.has(id));
}

function authorizeEnvRoles(member, envKey, env = process.env) {
  const configured = parseRoleIds(env[envKey]);
  if (configured.length === 0) {
    return { ok: false, code: 'unconfigured', message: MESSAGES.unconfigured };
  }
  if (!isAllowed(memberRoleIds(member), configured)) {
    return { ok: false, code: 'missing', message: MESSAGES.missing };
  }
  return { ok: true };
}

function authorizeStaff(member, env = process.env) {
  return authorizeEnvRoles(member, 'STAFF_ROLE_IDS', env);
}

function authorizeCommand(commandName, member, env = process.env) {
  const envKey = COMMAND_ROLE_ENV[commandName];
  if (!envKey) return { ok: true };
  return authorizeEnvRoles(member, envKey, env);
}

module.exports = {
  COMMAND_ROLE_ENV,
  MESSAGES,
  parseRoleIds,
  memberRoleIds,
  isAllowed,
  authorizeStaff,
  authorizeCommand,
};
