const { SlashCommandBuilder } = require('discord.js');
const { quantityFields } = require('./fields');

const livrare = new SlashCommandBuilder()
  .setName('livrare')
  .setDescription('Înregistrează cantitățile tale pentru predare');

livrare.addStringOption(option =>
  option
    .setName('cnp')
    .setDescription('CNP / ID intern, 1–5 cifre')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(5)
);

for (const field of quantityFields) {
  livrare.addIntegerOption(option =>
    option
      .setName(field.option)
      .setDescription(field.label)
      .setMinValue(0)
      .setRequired(false)
  );
}

const calculeaza = new SlashCommandBuilder()
  .setName('calculeaza')
  .setDescription('Alege rulota pentru livrarea următoare și calculează exportul')
  .addStringOption(option =>
    option
      .setName('rulota')
      .setDescription('Rulota folosită la livrarea următoare (Grove, Custom, etc.)')
      .setRequired(true)
      .addChoices(
        { name: 'Grove', value: 'grove' },
        { name: 'Vespucci', value: 'vespucci' },
        { name: 'Mirror', value: 'mirror' },
        { name: 'Sandy', value: 'sandy' },
        { name: 'Custom', value: 'custom' },
      )
  );

for (const field of quantityFields) {
  calculeaza.addIntegerOption(option =>
    option
      .setName(`cap_${field.option}`)
      .setDescription(`Capacitate custom: ${field.label}`)
      .setMinValue(0)
      .setRequired(false)
  );
}

const lista = new SlashCommandBuilder()
  .setName('lista')
  .setDescription('Arată predările curente');

const reset = new SlashCommandBuilder()
  .setName('reset')
  .setDescription('Șterge predările pentru livrarea următoare');

const commands = [livrare, calculeaza, lista, reset];

module.exports = { commands };
