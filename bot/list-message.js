const EVERYONE_PREFIX = '@everyone\n';
const EVERYONE_MENTIONS = { parse: ['everyone'] };

function chunkText(text, limit = 1900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const block of text.split('\n\n')) {
    const next = current ? `${current}\n\n${block}` : block;
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

function publicListMessages(text, limit = 1900) {
  const chunks = chunkText(`${EVERYONE_PREFIX}${text}`, limit);
  return chunks.map((content, index) => (
    index === 0
      ? { content, allowedMentions: EVERYONE_MENTIONS }
      : { content }
  ));
}

module.exports = {
  EVERYONE_PREFIX,
  EVERYONE_MENTIONS,
  chunkText,
  publicListMessages,
};
