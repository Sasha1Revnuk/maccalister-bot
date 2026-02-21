const { ADMIN_ROLE } = require('../config');
const { upsertUser } = require('../db');
const { deleteNow } = require('../utils');

module.exports = async function handleSyncUsers(interaction, guild) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  await guild.members.fetch();

  let added = 0;
  guild.members.cache
    .filter(m => !m.user.bot)
    .forEach(m => {
      const result = upsertUser(m.user.username, m.displayName);
      if (result === 'added') added++;
    });

  await interaction.editReply(`✅ Готово! Нових учасників додано: **${added}**`);
  deleteNow(interaction);
};