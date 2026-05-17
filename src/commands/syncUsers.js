const { ADMIN_ROLE, IGNORED_ROLE } = require('../config');
const { upsertUser, getAllUsers, deleteUser } = require('../db');
const { autoDelete, chunkText } = require('../utils');

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
      deleteUser(user.login);
      removed++;
    }
  }

  const allUsers = getAllUsers();
  const header =
    `✅ Синхронізація завершена!\n` +
    `➕ Додано: **${added}**\n` +
    `✏️ Оновлено імен: **${updated}**\n` +
    `➖ Видалено: **${removed}**\n\n` +
    `👥 **Учасники в базі (${allUsers.length}):**\n`;

  const lines = allUsers.map(u => `• ${u.name} (@${u.login})`);
  const chunks = lines.length ? chunkText(lines) : ['_немає_'];
  chunks[0] = header + chunks[0];

  await interaction.editReply({ content: chunks[0] });
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp({ content: chunks[i], flags: 64 });
  }

  autoDelete(interaction);
};