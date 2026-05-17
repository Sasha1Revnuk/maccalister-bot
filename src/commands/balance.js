const { getAllBalance } = require('../db');
const { ADMIN_ROLE, CURRENCY } = require('../config');
const { autoDelete, buildBalanceEmbeds, replyWithEmbeds } = require('../utils');

module.exports = async function handleBalance(interaction) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const users = getAllBalance();

  if (!users.length) {
    await interaction.editReply({ content: '📭 Записів немає.' });
    autoDelete(interaction);
    return;
  }

  const embeds = buildBalanceEmbeds(users, CURRENCY);
  await replyWithEmbeds(interaction, embeds);
  autoDelete(interaction);
};
