const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoleIds, memberRoleIds, isAllowed, authorizeCommand } = require('../bot/roles');

test('parseRoleIds taie spațiile și ignoră bucățile goale', () => {
  assert.deepEqual(parseRoleIds(' 111 , 222,, 333 '), ['111', '222', '333']);
  assert.deepEqual(parseRoleIds(''), []);
  assert.deepEqual(parseRoleIds(undefined), []);
  assert.deepEqual(parseRoleIds('   ,  , '), []);
});

test('isAllowed cere intersecție și refuză configurația goală', () => {
  assert.equal(isAllowed(['10', '20'], ['20', '30']), true);
  assert.equal(isAllowed(['10'], ['20', '30']), false);
  assert.equal(isAllowed(['10'], []), false);
  assert.equal(isAllowed([], ['10']), false);
});

test('authorizeCommand folosește rolul potrivit și mesajele de refuz', () => {
  const env = {
    PREDARE_ROLE_IDS: '111, 222',
    STAFF_ROLE_IDS: '999',
  };
  const member = { roles: ['111', '5'] };
  assert.equal(authorizeCommand('livrare', member, env).ok, true);
  assert.equal(authorizeCommand('calculeaza', member, env).code, 'missing');
  assert.equal(authorizeCommand('lista', member, env).message, 'Nu ai rolul necesar pentru comanda asta.');
  assert.equal(authorizeCommand('reset', { roles: ['999'] }, env).ok, true);

  const empty = authorizeCommand('livrare', member, {});
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'unconfigured');
  assert.equal(empty.message, 'Lista de roluri nu este configurată pe bot.');
  assert.equal(authorizeCommand('calculeaza', member, { STAFF_ROLE_IDS: '  , ' }).code, 'unconfigured');
});

test('memberRoleIds citește cache-ul discord.js și un array brut', () => {
  const guildId = 'everyone';
  const cache = new Map([
    [guildId, { id: guildId, name: '@everyone' }],
    ['111', { id: '111' }],
  ]);
  assert.deepEqual(memberRoleIds({ roles: { cache } }), [guildId, '111']);
  assert.deepEqual(memberRoleIds({ roles: ['222', ' 333 '] }), ['222', '333']);
  assert.equal(isAllowed(memberRoleIds({ roles: { cache } }), ['111']), true);
  assert.equal(isAllowed(memberRoleIds({ roles: { cache } }), [guildId]), true);
  assert.equal(isAllowed(memberRoleIds({ roles: { cache } }), ['999']), false);
});
