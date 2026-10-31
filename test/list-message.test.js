const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EVERYONE_PREFIX,
  EVERYONE_MENTIONS,
  publicListMessages,
} = require('../bot/list-message');

test('lista publică începe cu @everyone și permite ping-ul', () => {
  const [first] = publicListMessages('Rulotă: Grove\n\nVlad | 123');
  assert.equal(first.content.startsWith(EVERYONE_PREFIX), true);
  assert.equal(first.content.includes('Rulotă: Grove'), true);
  assert.deepEqual(first.allowedMentions, EVERYONE_MENTIONS);
});

test('@everyone este doar pe primul chunk când lista e lungă', () => {
  const block = 'Jucător | 1\nItem | 10 | 100$';
  const text = Array.from({ length: 40 }, () => block).join('\n\n');
  const payloads = publicListMessages(text, 200);
  assert.ok(payloads.length > 1);
  assert.equal(payloads[0].content.startsWith('@everyone\n'), true);
  assert.deepEqual(payloads[0].allowedMentions, { parse: ['everyone'] });
  for (const payload of payloads.slice(1)) {
    assert.equal(payload.content.includes('@everyone'), false);
    assert.equal(payload.allowedMentions, undefined);
  }
});
