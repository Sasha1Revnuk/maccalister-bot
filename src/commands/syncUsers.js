const { ADMIN_ROLE } = require('../config');
const { db, upsertUser, getAllUsers } = require('../db');
const { autoDelete } = require('../utils');

module.exports = async function handleSyncUsers(interaction, guild) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  await guild.members.fetch();

  const discordLogins = new Set(
    [...guild.members.cache.values()]
      .filter(m => !m.user.bot)
      .map(m => m.user.username)
  );

  // Додаємо нових
  let added = 0;
  for (const [, member] of guild.members.cache.filter(m => !m.user.bot)) {
    const result = upsertUser(member.user.username, member.displayName);
    if (result === 'added') added++;
  }

  // Видаляємо тих кого вже немає (records і members видаляться каскадно)
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
    `➖ Видалено: **${removed}**\n\n` +
    `👥 **Учасники в базі (${allUsers.length}):**\n${userList}`
  );

  autoDelete(interaction)
};