const { SlashCommandBuilder } = require('discord.js');
const { ACTION_TYPES, BANKS } = require('./validation');

const planifica = new SlashCommandBuilder()
  .setName('planifica')
  .setDescription('Anunță o acțiune și deschide prezența')
  .setDMPermission(false)
  .addStringOption(option =>
    option
      .setName('tip')
      .setDescription('Tipul acțiunii')
      .setRequired(true)
      .addChoices(...ACTION_TYPES.map(type => ({ name: type.name, value: type.name })))
  )
  .addStringOption(option =>
    option
      .setName('descriere')
      .setDescription('Descrierea acțiunii')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('data')
      .setDescription('Data (DD.MM.YYYY)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('ora')
      .setDescription('Ora (HH:MM, 24 de ore)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('titlu')
      .setDescription('Titlu manual (obligatoriu la Custom)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('locatie')
      .setDescription('Locația (obligatorie la Patrula, Plimbare, Farm, Sedinta, Custom)')
      .setRequired(false)
  );

const banca = new SlashCommandBuilder()
  .setName('banca')
  .setDescription('Anunță o acțiune la bancă și deschide pozițiile')
  .setDMPermission(false)
  .addStringOption(option =>
    option
      .setName('banca')
      .setDescription('Banca')
      .setRequired(true)
      .addChoices(...BANKS.map(bank => ({ name: bank.name, value: bank.name })))
  )
  .addStringOption(option =>
    option
      .setName('data')
      .setDescription('Data (DD.MM.YYYY)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('ora')
      .setDescription('Ora (HH:MM, 24 de ore)')
      .setRequired(true)
  );

const absent = new SlashCommandBuilder()
  .setName('absent')
  .setDescription('Marchează un membru absent la o acțiune')
  .setDMPermission(false)
  .addUserOption(option =>
    option
      .setName('utilizator')
      .setDescription('Membrul care lipsește')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('actiune')
      .setDescription('Acțiunea recentă')
      .setRequired(true)
      .setAutocomplete(true)
  );

const resetActiuni = new SlashCommandBuilder()
  .setName('reset_actiuni')
  .setDescription('Șterge istoricul de prezență și închide acțiunile vechi')
  .setDMPermission(false);

const listaActiuni = new SlashCommandBuilder()
  .setName('lista_actiuni')
  .setDescription('Arată prezența de la ultimul reset')
  .setDMPermission(false);

const commands = [planifica, banca, absent, resetActiuni, listaActiuni];

module.exports = { commands };
