const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { MACCALISTER_ROLE_ID, ACCOUNTANT_ROLE, REQUESTS_CHANNEL_ID, CURRENCY } = require('../config');
const { getAllBalance, addRecord } = require('../db');
const { autoDelete, deleteNow } = require('../utils');

// Юзер робить запит на виплату
async function handlePayoutRequest(interaction) {
  const hasMaccalisterRole = interaction.member.roles.cache.has(MACCALISTER_ROLE_ID);
  if (!hasMaccalisterRole) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const login = interaction.user.username;
  const allBalance = getAllBalance();
  const userData = allBalance.find(u => u.login === login);
  const balance = userData?.total ?? 0;

  if (balance <= 0) {
    await interaction.reply({
      content: `❌ У тебе немає коштів для виплати. Поточний баланс: **${CURRENCY}${balance}**`,
      flags: 64,
    });
    autoDelete(interaction);
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('payout_modal')
    .setTitle('💰 Запит на виплату');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Сума (доступно ${CURRENCY}${balance})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Наприклад: ${balance}`)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

// Модалка сабмічена — відправляємо в канал
async function handlePayoutModal(interaction) {
  const login = interaction.user.username;
  const amountRaw = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(amountRaw);

  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({ content: '❌ Введіть коректну суму.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const allBalance = getAllBalance();
  const userData = allBalance.find(u => u.login === login);
  const balance = userData?.total ?? 0;

  if (amount > balance) {
    await interaction.reply({
      content: `❌ Недостатньо коштів. Доступно: **${CURRENCY}${balance}**, запит: **${CURRENCY}${amount}**`,
      flags: 64,
    });
    autoDelete(interaction);
    return;
  }

  const guild = interaction.guild;
  const member = guild.members.cache.find(m => m.user.username === login);
  const memberTag = member ? `<@${member.id}>` : `@${login}`;

  try {
    const channel = guild.channels.cache.get(REQUESTS_CHANNEL_ID);
    if (!channel) {
      await interaction.reply({ content: '❌ Канал запитів не знайдено.', flags: 64 });
      autoDelete(interaction);
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`payout_approve_${amount}_${login}`)
        .setLabel('✅ Підтвердити')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`payout_reject_${amount}_${login}`)
        .setLabel('❌ Відхилити')
        .setStyle(ButtonStyle.Danger),
    );

    await channel.send({
      content:
        `💰 **Запит на виплату**\n\n` +
        `👤 Учасник: ${memberTag}\n` +
        `💵 Сума запиту: **${CURRENCY}${amount}**\n` +
        `📊 Поточний баланс: **${CURRENCY}${balance}**`,
      components: [row],
    });
  } catch (err) {
    console.error('❌ Помилка відправки запиту:', err.message);
    await interaction.reply({ content: '❌ Помилка відправки запиту.', flags: 64 });
    return;
  }

  await interaction.reply({ content: `✅ Запит на виплату **${CURRENCY}${amount}** відправлено!`, flags: 64 });
  deleteNow(interaction);
}

// Підтвердити виплату
async function handlePayoutApprove(interaction) {
  const isAccountant = interaction.member.roles.cache.has(ACCOUNTANT_ROLE);
  if (!isAccountant) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  // customId: payout_approve_AMOUNT_LOGIN
  const withoutPrefix = interaction.customId.replace('payout_approve_', '');
  const firstUnderscore = withoutPrefix.indexOf('_');
  const amount = parseInt(withoutPrefix.slice(0, firstUnderscore));
  const login = withoutPrefix.slice(firstUnderscore + 1);

  const allBalance = getAllBalance();
  const userData = allBalance.find(u => u.login === login);
  const balance = userData?.total ?? 0;

  const guild = interaction.guild;
  const member = guild.members.cache.find(m => m.user.username === login);
  const memberTag = member ? `<@${member.id}>` : `@${login}`;
  const approvedBy = interaction.user;

  if (amount > balance) {
    await interaction.update({
      content:
        `❌ **Запит відхилено автоматично**\n\n` +
        `👤 Учасник: ${memberTag}\n` +
        `💵 Запит: **${CURRENCY}${amount}**\n` +
        `📊 Поточний баланс: **${CURRENCY}${balance}**\n` +
        `📝 Причина: Недостатньо коштів на рахунку`,
      components: [],
    });
    return;
  }

  // Виплата — додаємо витрату (взаємозалік спрацює автоматично)
  addRecord(login, amount, 'Виплата зарплати', 'expense');

  await interaction.update({
    content:
      `✅ **Виплату підтверджено**\n\n` +
      `👤 Учасник: ${memberTag}\n` +
      `💵 Сума: **${CURRENCY}${amount}**\n` +
      `🛡️ Підтвердив: <@${approvedBy.id}>`,
    components: [],
  });
}

// Відхилити — показуємо модалку з причиною
async function handlePayoutReject(interaction) {
  const isAccountant = interaction.member.roles.cache.has(ACCOUNTANT_ROLE);
  if (!isAccountant) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  // customId: payout_reject_AMOUNT_LOGIN
  const withoutPrefix = interaction.customId.replace('payout_reject_', '');

  const modal = new ModalBuilder()
    .setCustomId(`payout_reject_reason_${withoutPrefix}`)
    .setTitle('❌ Причина відхилення');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Причина')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

// Модалка з причиною відхилення
async function handlePayoutRejectReason(interaction) {
  // customId: payout_reject_reason_AMOUNT_LOGIN
  const withoutPrefix = interaction.customId.replace('payout_reject_reason_', '');
  const firstUnderscore = withoutPrefix.indexOf('_');
  const amount = parseInt(withoutPrefix.slice(0, firstUnderscore));
  const login = withoutPrefix.slice(firstUnderscore + 1);
  const reason = interaction.fields.getTextInputValue('reason');

  const guild = interaction.guild;
  const member = guild.members.cache.find(m => m.user.username === login);
  const memberTag = member ? `<@${member.id}>` : `@${login}`;
  const rejectedBy = interaction.user;

  await interaction.update({
    content:
      `❌ **Запит відхилено**\n\n` +
      `👤 Учасник: ${memberTag}\n` +
      `💵 Сума: **${CURRENCY}${amount}**\n` +
      `📝 Причина: **${reason}**\n` +
      `🛡️ Відхилив: <@${rejectedBy.id}>`,
    components: [],
  });
}

module.exports = {
  handlePayoutRequest,
  handlePayoutModal,
  handlePayoutApprove,
  handlePayoutReject,
  handlePayoutRejectReason,
};