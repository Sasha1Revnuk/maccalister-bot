const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { ACCOUNTANT_ROLE, NOTIFICATIONS_CHANNEL_ID, CURRENCY } = require('../config');
const { getAllUsers, addRecord } = require('../db');
const { deleteNow, autoDelete } = require('../utils');

async function handleNewRecordStart(interaction) {
  const isManager = interaction.member.roles.cache.has(ACCOUNTANT_ROLE);
  if (!isManager) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('newrecord_type')
    .setPlaceholder('Оберіть тип запису...')
    .addOptions([
      { label: '📈 Дохід', description: 'Погашення внеску або інший дохід', value: 'income' },
      { label: '📉 Витрата', description: 'Штраф або інша витрата', value: 'expense' },
    ]);

  await interaction.reply({
    content: '📋 Оберіть тип запису:',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: 64,
  });
  autoDelete(interaction);
}

async function handleNewRecordType(interaction) {
  const type = interaction.values[0];
  const users = getAllUsers();

  if (!users.length) {
    await interaction.update({ content: '❌ Немає учасників в базі.', components: [] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`newrecord_user_${type}`)
    .setPlaceholder('Оберіть учасника...')
    .addOptions(
      users.map(u => ({
        label: u.name,
        description: `@${u.login}`,
        value: u.login,
      }))
    );

  await interaction.update({
    content: '👤 Оберіть учасника:',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function handleNewRecordUser(interaction) {
  const [, , type] = interaction.customId.split('_');
  const login = interaction.values[0];
  await showModal(interaction, login, type === 'expense' ? 'expense' : 'income');
}

async function handleNewRecordRecords(interaction) {
  const login = interaction.customId.replace('newrecord_records_', '');
  await showModal(interaction, login, 'income');
}

async function showModal(interaction, login, mode) {
  const modal = new ModalBuilder()
    .setCustomId(`newrecord_modal_${mode}_${login}`)
    .setTitle(mode === 'income' ? '📈 Дохід' : '📉 Витрата');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Причина')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(mode === 'income' ? 'Наприклад: Погашення внеску' : 'Наприклад: Штраф за запізнення')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Сума (${CURRENCY})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Наприклад: 500')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

function parseModalCustomId(customId) {
  const withoutPrefix = customId.replace('newrecord_modal_', '');
  if (withoutPrefix.startsWith('expense_')) {
    return { mode: 'expense', login: withoutPrefix.slice('expense_'.length) };
  }
  if (withoutPrefix.startsWith('income_')) {
    return { mode: 'income', login: withoutPrefix.slice('income_'.length) };
  }
  return { mode: 'expense', login: withoutPrefix };
}

function formatNettedLines(netted, mode) {
  return netted.map(n => {
    const date = n.created_at ? ` (${n.created_at.slice(0, 10)})` : '';
    const prefix = mode === 'income' ? '✅ Погашено витрату' : '✅ Погашено дохід';
    if (n.fullyPaid) {
      return `${prefix}: **${n.label}**${date} — початкова сума ${CURRENCY}${n.originalAmount}`;
    } else {
      return `⚠️ Частково: **${n.label}**${date} — початкова сума ${CURRENCY}${n.originalAmount}, сплачено ${CURRENCY}${n.paid}, залишок ${CURRENCY}${n.leftover}`;
    }
  }).join('\n');
}

async function handleNewRecordModal(interaction) {
  const { mode, login } = parseModalCustomId(interaction.customId);

  const reason = interaction.fields.getTextInputValue('reason');
  const amountRaw = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(amountRaw);

  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({ content: '❌ Сума має бути цілим позитивним числом.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const guild = interaction.guild;
  const issuedBy = interaction.user;

  let member = guild.members.cache.find(m => m.user.username === login);
  if (!member) {
    try {
      const fetched = await guild.members.fetch({ query: login, limit: 1 });
      member = fetched.first();
    } catch (err) {
      console.warn('⚠️ Не вдалось знайти юзера:', err.message);
    }
  }

  const memberTag = member ? `<@${member.id}>` : `@${login}`;

  const { netted, remaining } = addRecord(login, amount, reason, mode);

  const nettedLines = formatNettedLines(netted, mode);
  const leftoverText = remaining > 0 && netted.length > 0
    ? `\n💵 Залишок **${CURRENCY}${remaining}** записано`
    : '';

  const sign = mode === 'expense' ? '-' : '+';
  const emoji = mode === 'expense' ? '🔴' : '🟢';

  const notificationMsg =
    `${emoji} **Новий запис**\n\n` +
    `👤 Учасник: ${memberTag}\n` +
    `📝 Причина: **${reason}**\n` +
    `💰 Сума: **${sign}${CURRENCY}${amount}**` +
    (nettedLines ? `\n\n${nettedLines}` : '') +
    leftoverText +
    `\n🛡️ Видав: <@${issuedBy.id}>`;

  try {
    const channel = guild.channels.cache.get(NOTIFICATIONS_CHANNEL_ID);
    if (channel) await channel.send(notificationMsg);
    else console.warn('⚠️ Канал сповіщень не знайдено.');
  } catch (err) {
    console.error('❌ Помилка відправки в канал:', err.message);
  }

  await interaction.reply({ content: `✅ Запис створено!`, flags: 64 });
  deleteNow(interaction);
}

module.exports = {
  handleNewRecordStart,
  handleNewRecordType,
  handleNewRecordUser,
  handleNewRecordRecords,
  handleNewRecordModal,
};