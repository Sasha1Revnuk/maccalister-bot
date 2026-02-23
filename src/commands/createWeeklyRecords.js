const { ADMIN_ROLE, IGNORED_ROLE, WEEKLY_AMOUNT, WEEKLY_DEBT_LABEL, NOTIFICATIONS_CHANNEL_ID } = require('../config');
const { db, upsertUser, getAllUsers, createWeeklyRecords } = require('../db');
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

  // Фільтруємо: без ботів і без ігнорованої ролі
  const validMembers = [...guild.members.cache.values()].filter(m =>
    !m.user.bot && !m.roles.cache.has(IGNORED_ROLE)
  );

  const discordLogins = new Set(validMembers.map(m => m.user.username));

  // Синхронізуємо учасників
  for (const member of validMembers) {
    upsertUser(member.user.username, member.displayName);
  }

  // Видаляємо тих кого вже немає або хто отримав ігноровану роль
  const dbUsers = getAllUsers();
  for (const user of dbUsers) {
    if (!discordLogins.has(user.login)) {
      db.prepare('DELETE FROM users WHERE login = ?').run(user.login);
    }
  }

  const users = getAllUsers();
  const amount = Math.floor(WEEKLY_AMOUNT / 4 / users.length);
  const count = createWeeklyRecords(amount, WEEKLY_DEBT_LABEL);

  // Тегаємо кожного учасника в каналі сповіщень
  try {
    const channel = guild.channels.cache.get(NOTIFICATIONS_CHANNEL_ID);
    if (channel) {
      const tags = validMembers
        .map(m => `<@${m.id}>`)
        .join(' ');

      await channel.send(
        `📅 **Щотижневий внесок нараховано!**\n\n` +
        `💰 Сума для кожного: **$${amount}**\n` +
        `👥 Учасників: **${count}**\n\n` +
        `${tags}`
      );
    }
  } catch (err) {
    console.error('❌ Помилка відправки сповіщення:', err.message);
  }

  await interaction.editReply(
    `✅ Щотижневі внески створено для **${count}** учасників по **$${amount}**`
  );
  deleteNow(interaction);
};