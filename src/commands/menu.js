const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { ADMIN_ROLE, ACCOUNTANT_ROLE, MACCALISTER_ROLE_ID } = require('../config');
const { autoDelete } = require('../utils');

module.exports = async function handleMenu(interaction) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  const isAccountant = interaction.member.roles.cache.has(ACCOUNTANT_ROLE);
  const isMaccalister = interaction.member.roles.cache.has(MACCALISTER_ROLE_ID);

  const embed = new EmbedBuilder()
    .setTitle('🏦 Казна сімї')
    .setDescription('Оберіть дію:')
    .setColor(0xF1C40F);

  const components = [];

  // Тільки адмін
  if (isAdmin) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('syncusers')
          .setLabel('🔄 Синхронізація учасників')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('createweeklyrecords')
          .setLabel('📅 Щотижневі внески')
          .setStyle(ButtonStyle.Secondary),
      )
    );
  }

  // Бухгалтер і адмін
  if (isAdmin || isAccountant) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('balance')
          .setLabel('📊 Баланс всіх')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('mybalance')
          .setLabel('💰 Мій баланс')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('contracts_list')
          .setLabel('⚙️ Контракти')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('contract_view')
          .setLabel('📜 Активний контракт')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('contract_start')
          .setLabel('🚀 Запустити контракт')
          .setStyle(ButtonStyle.Secondary),
      )
    );
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('newrecord_start')
          .setLabel('📋 Новий запис')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('payout_request')
          .setLabel('💸 Запит на виплату')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('deposit_request')
          .setLabel('💵 Внести кошти')
          .setStyle(ButtonStyle.Success),
      )
    );
  }

  // Звичайний гравець
  if (!isAdmin && !isAccountant && isMaccalister) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('mybalance')
          .setLabel('💰 Мій баланс')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('contract_view')
          .setLabel('📜 Активний контракт')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('contract_start')
          .setLabel('🚀 Запустити контракт')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('payout_request')
          .setLabel('💸 Запит на виплату')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('deposit_request')
          .setLabel('💵 Внести кошти')
          .setStyle(ButtonStyle.Success),
      )
    );
  }

  if (!components.length) {
    await interaction.reply({ content: '❌ У тебе немає доступу до жодної функції.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  await interaction.reply({ embeds: [embed], components, flags: 64 });
  autoDelete(interaction);
};