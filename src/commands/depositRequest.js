const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { MACCALISTER_ROLE_ID, ACCOUNTANT_ROLE, DEPOSIT_CHANNEL_ID, CURRENCY } = require('../config');
const { getOpenExpenses, getAllBalance, addRecord } = require('../db');
const { autoDelete, deleteNow } = require('../utils');

// Юзер робить запит на внесення коштів
async function handleDepositRequest(interaction) {
  const hasMaccalisterRole = interaction.member.roles.cache.has(MACCALISTER_ROLE_ID);
  if (!hasMaccalisterRole) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const login = interaction.user.username;
  const expenses = getOpenExpenses(login);

  if (!expenses.length) {
    // Немає відкритих витрат — просто вводимо суму
    const modal = new ModalBuilder()
      .setCustomId('deposit_modal_free')
      .setTitle('💵 Внесення коштів в казну');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Сума внеску')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Наприклад: 5000')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Призначення')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Наприклад: Щотижневий внесок')
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // Є відкриті витрати — показуємо список для вибору
  const options = expenses.map(e => ({
    label: e.label.slice(0, 100),
    description: `${CURRENCY}${e.amount} • ${e.created_at.slice(0, 10)}`,
    value: String(e.id),
  }));

  options.push({
    label: '💵 Довільна сума',
    description: 'Внести кошти без прив\'язки до конкретного боргу',
    value: 'free',
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId('deposit_select_expense')
    .setPlaceholder('Оберіть борг який хочете погасити...')
    .addOptions(options);

  await interaction.reply({
    content:
      `💵 **Внесення коштів в казну**\n\n` +
      `У тебе є відкриті борги. Оберіть який хочете погасити цим внеском:`,
    components: [new ActionRowBuilder().addComponents(select)],
    flags: 64,
  });
  autoDelete(interaction);
}

// Вибір боргу — показуємо модалку з сумою
async function handleDepositSelectExpense(interaction) {
  const value = interaction.values[0];

  if (value === 'free') {
    const modal = new ModalBuilder()
      .setCustomId('deposit_modal_free')
      .setTitle('💵 Внесення коштів в казну');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Сума внеску')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Наприклад: 5000')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Призначення')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Наприклад: Щотижневий внесок')
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // Конкретний борг
  const login = interaction.user.username;
  const expenses = getOpenExpenses(login);
  const expense = expenses.find(e => String(e.id) === value);

  if (!expense) {
    await interaction.update({ content: '❌ Запис не знайдено.', components: [] });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`deposit_modal_expense_${expense.id}`)
    .setTitle('💵 Погашення боргу');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Сума (борг ${CURRENCY}${expense.amount})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Наприклад: ${expense.amount}`)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

// Модалка — довільний внесок
async function handleDepositModalFree(interaction) {
  const login = interaction.user.username;
  const amountRaw = interaction.fields.getTextInputValue('amount');
  const label = interaction.fields.getTextInputValue('label');
  const amount = parseInt(amountRaw);

  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({ content: '❌ Введіть коректну суму.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  await sendDepositRequest(interaction, login, amount, label, null);
}

// Модалка — погашення конкретного боргу
async function handleDepositModalExpense(interaction) {
  const login = interaction.user.username;
  const expenseId = parseInt(interaction.customId.replace('deposit_modal_expense_', ''));
  const amountRaw = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(amountRaw);

  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({ content: '❌ Введіть коректну суму.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const expenses = getOpenExpenses(login);
  const expense = expenses.find(e => e.id === expenseId);

  if (!expense) {
    await interaction.reply({ content: '❌ Борг не знайдено.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  await sendDepositRequest(interaction, login, amount, expense.label, expense);
}

// Відправляємо запит в канал
async function sendDepositRequest(interaction, login, amount, label, expense) {
  const guild = interaction.guild;
  const member = guild.members.cache.find(m => m.user.username === login);
  const memberTag = member ? `<@${member.id}>` : `@${login}`;

  const allBalance = getAllBalance();
  const userData = allBalance.find(u => u.login === login);
  const balance = userData?.total ?? 0;

  try {
    const channel = guild.channels.cache.get(DEPOSIT_CHANNEL_ID);
    if (!channel) {
      await interaction.reply({ content: '❌ Канал запитів не знайдено.', flags: 64 });
      autoDelete(interaction);
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`deposit_approve_${amount}_${login}`)
        .setLabel('✅ Підтвердити')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deposit_reject_${amount}_${login}`)
        .setLabel('❌ Відхилити')
        .setStyle(ButtonStyle.Danger),
    );

    const expenseInfo = expense
      ? `\n🎯 Погашає борг: **${expense.label}** — ${CURRENCY}${expense.amount} (від ${expense.created_at.slice(0, 10)})`
      : '';

    await channel.send({
      content:
        `💵 **Запит на внесення коштів**\n\n` +
        `👤 Учасник: ${memberTag}\n` +
        `💰 Сума внеску: **${CURRENCY}${amount}**\n` +
        `📝 Призначення: **${label}**` +
        expenseInfo +
        `\n📊 Поточний баланс: **${CURRENCY}${balance}**`,
      components: [row],
    });
  } catch (err) {
    console.error('❌ Помилка відправки запиту:', err.message);
    await interaction.reply({ content: '❌ Помилка відправки запиту.', flags: 64 });
    return;
  }

  await interaction.reply({
    content: `✅ Запит на внесення **${CURRENCY}${amount}** відправлено! Очікуй підтвердження від Бухгалтера.`,
    flags: 64,
  });
  deleteNow(interaction);
}

// Підтвердити внесок
async function handleDepositApprove(interaction) {
  const isAccountant = interaction.member.roles.cache.has(ACCOUNTANT_ROLE);
  if (!isAccountant) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  // customId: deposit_approve_AMOUNT_LOGIN
  const withoutPrefix = interaction.customId.replace('deposit_approve_', '');
  const firstUnderscore = withoutPrefix.indexOf('_');
  const amount = parseInt(withoutPrefix.slice(0, firstUnderscore));
  const login = withoutPrefix.slice(firstUnderscore + 1);

  const guild = interaction.guild;
  const member = guild.members.cache.find(m => m.user.username === login);
  const memberTag = member ? `<@${member.id}>` : `@${login}`;
  const approvedBy = interaction.user;

  // Додаємо дохід — взаємозалік спрацює автоматично
  const { netted, remaining } = addRecord(login, amount, 'Внесок в казну', 'income');

  const nettedLines = netted.map(n => {
    const date = n.created_at ? ` (${n.created_at.slice(0, 10)})` : '';
    if (n.fullyPaid) {
      return `✅ Погашено: **${n.label}**${date} — ${CURRENCY}${n.originalAmount}`;
    } else {
      return `⚠️ Частково: **${n.label}**${date} — сплачено ${CURRENCY}${n.paid}, залишок боргу ${CURRENCY}${n.leftover}`;
    }
  }).join('\n');

  const remainderText = remaining > 0 && netted.length > 0
    ? `\n💰 Залишок **${CURRENCY}${remaining}** записано як дохід`
    : '';

  await interaction.update({
    content:
      `✅ **Внесок підтверджено**\n\n` +
      `👤 Учасник: ${memberTag}\n` +
      `💵 Сума: **${CURRENCY}${amount}**\n` +
      (nettedLines ? `\n${nettedLines}` : '') +
      remainderText +
      `\n🛡️ Підтвердив: <@${approvedBy.id}>`,
    components: [],
  });
}

// Відхилити — модалка з причиною
async function handleDepositReject(interaction) {
  const isAccountant = interaction.member.roles.cache.has(ACCOUNTANT_ROLE);
  if (!isAccountant) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const withoutPrefix = interaction.customId.replace('deposit_reject_', '');

  const modal = new ModalBuilder()
    .setCustomId(`deposit_reject_reason_${withoutPrefix}`)
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

// Модалка причини відхилення
async function handleDepositRejectReason(interaction) {
  const withoutPrefix = interaction.customId.replace('deposit_reject_reason_', '');
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
  handleDepositRequest,
  handleDepositSelectExpense,
  handleDepositModalFree,
  handleDepositModalExpense,
  handleDepositApprove,
  handleDepositReject,
  handleDepositRejectReason,
};