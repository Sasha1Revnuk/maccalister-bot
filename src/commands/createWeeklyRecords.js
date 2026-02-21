const { ADMIN_ROLE, WEEKLY_AMOUNT, WEEKLY_DEBT_LABEL } = require('../config');
const { upsertUser, getAllUsers, createWeeklyRecords } = require('../db');
const { deleteNow } = require('../utils');

module.exports = async function handleCreateWeeklyRecords(interaction, guild) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    await guild.members.fetch();
  } catch (err) {
    console.warn('⚠️ Rate limit, використовуємо кеш');
  }

  guild.members.cache
    .filter(m => !m.user.bot)
    .forEach(m => upsertUser(m.user.username, m.displayName));

  const users = getAllUsers();
  const amount = Math.floor(WEEKLY_AMOUNT / 4 / users.length);
  const count = createWeeklyRecords(amount, WEEKLY_DEBT_LABEL);

  await interaction.editReply(
    `✅ Список учасників оновлено. Щотижневі внески створено для **${count}** учасників по **$${amount}**`
  );
  deleteNow(interaction);
};