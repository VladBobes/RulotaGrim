const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { loadEnv } = require('./env');
const { createStore } = require('./store');
const { authorizeCommand } = require('./roles');
const { validatePlanifica, actionChoiceLabel } = require('./validation');
const {
  formatAttendanceSections,
  formatListaActiuni,
  chunkText,
} = require('./attendance');
const { formatBucharest } = require('./datetime');

loadEnv(path.join(__dirname, '.env'));

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Lipsește DISCORD_TOKEN în bot-actiuni/.env');
  process.exit(1);
}

const PRESENT_PREFIX = 'actiuni:prezent:';
const store = createStore(path.join(__dirname, 'data', 'actiuni.json'));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function playerName(interaction) {
  const member = interaction.member;
  if (member) {
    if (typeof member.displayName === 'string' && member.displayName.trim()) return member.displayName.trim();
    if (typeof member.nick === 'string' && member.nick.trim()) return member.nick.trim();
  }
  return (interaction.user.globalName || interaction.user.username || '').trim();
}

function targetDisplayName(interaction) {
  const member = interaction.options.getMember('utilizator');
  if (member) {
    if (typeof member.displayName === 'string' && member.displayName.trim()) return member.displayName.trim();
    if (typeof member.nick === 'string' && member.nick.trim()) return member.nick.trim();
  }
  const user = interaction.options.getUser('utilizator', true);
  return (user.globalName || user.username || '').trim();
}

function buildActionEmbed(action) {
  const embed = new EmbedBuilder().setTitle(action.titlu).setColor(0x2ecc71);
  if (action.locatie) {
    embed.addFields({ name: 'Locație', value: action.locatie });
  }
  embed.addFields(
    { name: 'Descriere', value: action.descriere },
    { name: 'Dată', value: action.dateTimeLabel },
  );
  const presentCount = Object.keys(action.attendees || {}).length;
  const absentCount = Object.keys(action.absences || {}).length;
  const [presentSection, absentSection] = formatAttendanceSections(action).split('\n\n');
  embed.addFields({
    name: `Prezenți (${presentCount}):`,
    value: presentSection.replace(/^Prezenți \(\d+\):\n/, ''),
  });
  if (absentCount > 0 && absentSection) {
    embed.addFields({
      name: `Absenți (${absentCount}):`,
      value: absentSection.replace(/^Absenți \(\d+\):\n/, ''),
    });
  }
  return embed;
}

function presentButton(actionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PRESENT_PREFIX}${actionId}`)
      .setLabel('Prezent')
      .setStyle(ButtonStyle.Success)
  );
}

async function sendText(interaction, text) {
  const chunks = chunkText(text, 2000);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({ content: chunks[0] });
  } else {
    await interaction.editReply({ content: chunks[0] });
  }
  for (let i = 1; i < chunks.length; i += 1) {
    await interaction.followUp({ content: chunks[i] });
  }
}

async function editActionMessage(action) {
  if (!action?.channelId || !action?.messageId) return;
  try {
    const channel = await client.channels.fetch(action.channelId);
    const message = await channel.messages.fetch(action.messageId);
    await message.edit({ embeds: [buildActionEmbed(action)] });
  } catch (err) {
    console.error('Nu am putut edita mesajul acțiunii:', err);
  }
}

function recentActions(query = '') {
  const needle = String(query || '').trim().toLowerCase();
  return store
    .listActions()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter(action => {
      if (!needle) return true;
      return actionChoiceLabel(action).toLowerCase().includes(needle);
    })
    .slice(0, 25);
}

async function handlePlanifica(interaction) {
  const validated = validatePlanifica({
    tip: interaction.options.getString('tip', true),
    descriere: interaction.options.getString('descriere', true),
    data: interaction.options.getString('data', true),
    ora: interaction.options.getString('ora', true),
    titlu: interaction.options.getString('titlu'),
    locatie: interaction.options.getString('locatie'),
  });
  if (!validated.ok) {
    await interaction.reply({ content: validated.message, ephemeral: true });
    return;
  }

  const action = store.createAction(validated.action);
  await interaction.reply({
    content: '@everyone',
    embeds: [buildActionEmbed(action)],
    components: [presentButton(action.id)],
    allowedMentions: { parse: ['everyone'] },
  });
  const message = await interaction.fetchReply();
  store.setMessageRef(action.id, interaction.channelId, message.id);
}

async function handleAbsent(interaction) {
  const user = interaction.options.getUser('utilizator', true);
  const actionId = interaction.options.getString('actiune', true);
  const result = store.markAbsent(actionId, user.id, targetDisplayName(interaction));
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await editActionMessage(result.action);
  await interaction.reply({
    content: `${targetDisplayName(interaction)} a fost marcat absent la ${actionChoiceLabel(result.action)}.`,
    ephemeral: true,
  });
}

async function handleReset(interaction) {
  const result = store.reset(new Date());
  await interaction.reply(`Istoricul de prezență a fost șters. Ultimul reset: ${formatBucharest(new Date(result.lastResetAt))}.`);
}

async function handleLista(interaction) {
  await sendText(interaction, formatListaActiuni(store.getState(), new Date()));
}

async function handlePresentButton(interaction) {
  const actionId = interaction.customId.slice(PRESENT_PREFIX.length);
  const result = store.markPresent(actionId, interaction.user.id, playerName(interaction));
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await interaction.update({
    embeds: [buildActionEmbed(result.action)],
    components: [presentButton(result.action.id)],
  });
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Conectat ca ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const gate = authorizeCommand(interaction.commandName, interaction.member);
      if (!gate.ok) {
        await interaction.respond([]);
        return;
      }
      if (interaction.commandName === 'absent') {
        await interaction.respond(
          recentActions(interaction.options.getFocused()).map(action => ({
            name: actionChoiceLabel(action).slice(0, 100),
            value: action.id,
          }))
        );
      }
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.customId.startsWith(PRESENT_PREFIX)) return;
      await handlePresentButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const gate = authorizeCommand(interaction.commandName, interaction.member);
    if (!gate.ok) {
      await interaction.reply({ content: gate.message, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'planifica') await handlePlanifica(interaction);
    else if (interaction.commandName === 'absent') await handleAbsent(interaction);
    else if (interaction.commandName === 'reset_actiuni') await handleReset(interaction);
    else if (interaction.commandName === 'lista_actiuni') await handleLista(interaction);
  } catch (err) {
    console.error(err);
    const payload = { content: 'A apărut o eroare. Încearcă din nou.', ephemeral: true };
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  }
});

client.login(token);
