const { SlashCommandBuilder } = require('discord.js');
const { quantityFields } = require('./fields');

const predare = new SlashCommandBuilder()
  .setName('predare')
  .setDescription('Înregistrează cantitățile tale pentru predare');

predare.addStringOption(option =>
  option
    .setName('cnp')
    .setDescription('CNP / ID intern, 1–5 cifre')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(5)
);

for (const field of quantityFields) {
  predare.addIntegerOption(option =>
    option
      .setName(field.option)
      .setDescription(field.label)
      .setMinValue(0)
      .setRequired(false)
  );
}

const calculeaza = new SlashCommandBuilder()
  .setName('calculeaza')
  .setDescription('Calculează livrarea pe rulota aleasă')
  .addStringOption(option =>
    option
      .setName('rulota')
      .setDescription('Rulota folosită la predare')
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

const commands = [predare, calculeaza, lista, reset];

module.exports = { commands };
