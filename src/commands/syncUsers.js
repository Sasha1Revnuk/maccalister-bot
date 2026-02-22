const { ADMIN_ROLE, IGNORED_ROLE } = require('../config');
const { db, upsertUser, updateUserName, getAllUsers } = require('../db');
const { autoDelete } = require('../utils');

module.exports = async function handleSyncUsers(interaction, guild) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  await guild.members.fetch();

  // Фільтруємо: без ботів і без ігнорованої ролі
  const validMembers = [...guild.members.cache.values()].filter(m =>
    !m.user.bot && !m.roles.cache.has(IGNORED_ROLE)
  );

  const discordLogins = new Set(validMembers.map(m => m.user.username));

  // Додаємо нових і оновлюємо імена
  let added = 0;
  let updated = 0;
  for (const member of validMembers) {
    const result = upsertUser(member.user.username, member.displayName);
    if (result === 'added') {
      added++;
    } else if (result === 'updated') {
      updated++;
    }
  }

  // Видаляємо тих кого вже немає або хто отримав ігноровану роль
  const dbUsers = getAllUsers();
  let removed = 0;
  for (const user of dbUsers) {
    if (!discordLogins.has(user.login)) {
      db.prepare('DELETE FROM users WHERE login = ?').run(user.login);
      removed++;
    }
  }

  const allUsers = getAllUsers();
  const userList = allUsers.map(u => `• ${u.name} (@${u.login})`).join('\n');

  await interaction.editReply(
    `✅ Синхронізація завершена!\n` +
    `➕ Додано: **${added}**\n` +
    `✏️ Оновлено імен: **${updated}**\n` +
    `➖ Видалено: **${removed}**\n\n` +
    `👥 **Учасники в базі (${allUsers.length}):**\n${userList}`
  );

  autoDelete(interaction);
};