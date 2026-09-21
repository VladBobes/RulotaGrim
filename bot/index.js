const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { loadEnv } = require('./env');
const { createStore } = require('./store');
const { quantityFields } = require('./fields');
const { authorizeCommand } = require('./roles');
const { cleanPlayerName, formatPlayerLabel } = require('./player-label');
const {
  items,
  GROVE_CAPS,
  TRAILER_PRESETS,
  calculateDelivery,
  formatDeliveryText,
} = require('../allocation');

loadEnv(path.join(__dirname, '.env'));

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Lipsește DISCORD_TOKEN în bot/.env');
  process.exit(1);
}

const store = createStore(path.join(__dirname, 'data', 'submissions.json'));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const messages = {
  cnp: 'CNP/ID trebuie să aibă 1–5 cifre.',
  empty: 'Adaugă cel puțin o cantitate.',
  cnp_taken: 'Există deja un jucător cu acest CNP/ID.',
  qty: 'Cantitatea trebuie să fie un număr întreg pozitiv.',
  name: 'Lipsește numele jucătorului.',
  user: 'Nu am putut identifica utilizatorul Discord.',
};

function playerName(interaction) {
  const member = interaction.member;
  if (member) {
    if (typeof member.displayName === 'string' && member.displayName.trim()) return member.displayName.trim();
    if (typeof member.nick === 'string' && member.nick.trim()) return member.nick.trim();
  }
  return (interaction.user.globalName || interaction.user.username || '').trim();
}

function readQuantities(interaction) {
  const quantities = {};
  for (const field of quantityFields) {
    const value = interaction.options.getInteger(field.option);
    quantities[field.key] = value == null ? 0 : value;
  }
  return quantities;
}

function readCustomCapacities(interaction) {
  const caps = {};
  for (const field of quantityFields) {
    const value = interaction.options.getInteger(`cap_${field.option}`);
    caps[field.key] = value == null ? GROVE_CAPS[field.key] : value;
  }
  return caps;
}

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

async function sendText(interaction, text) {
  const chunks = chunkText(text);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({ content: chunks[0] });
  } else {
    await interaction.editReply({ content: chunks[0] });
  }
  for (let i = 1; i < chunks.length; i += 1) {
    await interaction.followUp({ content: chunks[i] });
  }
}

function formatList(submissions) {
  if (!submissions.length) return 'Nu există predări.';
  const blocks = submissions.map(entry => {
    const lines = [formatPlayerLabel(entry.name, entry.cnp)];
    items.forEach(item => {
      const quantity = entry.quantities[item.key] || 0;
      if (quantity > 0) lines.push(`${item.name}: ${quantity}`);
    });
    return lines.join('\n');
  });
  return `Predări curente (${submissions.length}):\n\n${blocks.join('\n\n')}`;
}

async function handlePredare(interaction) {
  const result = store.upsert({
    userId: interaction.user.id,
    name: playerName(interaction),
    cnp: interaction.options.getString('cnp', true),
    quantities: readQuantities(interaction),
  });
  if (!result.ok) {
    await interaction.reply({ content: messages[result.code] || 'Predarea nu a putut fi salvată.', ephemeral: true });
    return;
  }
  const verb = result.replaced ? 'Predarea a fost actualizată' : 'Predare salvată';
  await interaction.reply(`${verb} pentru ${formatPlayerLabel(result.submission.name, result.submission.cnp)}.`);
}

async function handleCalculeaza(interaction) {
  const submissions = store.list();
  if (!submissions.length) {
    await interaction.reply('Nu există predări pentru calcul.');
    return;
  }

  const trailerId = interaction.options.getString('rulota', true);
  const trailer = TRAILER_PRESETS.find(item => item.id === trailerId);
  if (!trailer) {
    await interaction.reply({ content: 'Rulotă necunoscută.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const capacities = trailer.id === 'custom' ? readCustomCapacities(interaction) : { ...trailer.capacities };
  const players = submissions.map(entry => ({
    name: cleanPlayerName(entry.name, entry.cnp) || entry.name,
    cnp: entry.cnp,
    quantities: entry.quantities,
  }));
  const { allocations } = calculateDelivery(players, capacities);
  await sendText(interaction, formatDeliveryText(allocations, trailer));
}

async function handleLista(interaction) {
  await sendText(interaction, formatList(store.list()));
}

async function handleReset(interaction) {
  store.clear();
  await interaction.reply('Predările au fost șterse. Poți începe o livrare nouă.');
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Conectat ca ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    const gate = authorizeCommand(interaction.commandName, interaction.member);
    if (!gate.ok) {
      await interaction.reply({ content: gate.message, ephemeral: true });
      return;
    }
    if (interaction.commandName === 'predare') await handlePredare(interaction);
    else if (interaction.commandName === 'calculeaza') await handleCalculeaza(interaction);
    else if (interaction.commandName === 'lista') await handleLista(interaction);
    else if (interaction.commandName === 'reset') await handleReset(interaction);
  } catch (err) {
    console.error(err);
    const payload = { content: 'A apărut o eroare. Încearcă din nou.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

client.login(token);
