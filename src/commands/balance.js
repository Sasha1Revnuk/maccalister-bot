const { getAllUsersBalanceSummary } = require('../db');
const { ADMIN_ROLE, CURRENCY } = require('../config');
const { autoDelete, chunkText, replyWithText } = require('../utils');

module.exports = async function handleBalance(interaction) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const users = getAllUsersBalanceSummary();

  if (!users.length) {
    await interaction.editReply({
      content: '📭 У базі немає учасників. Спочатку натисніть **Синхронізація учасників**.',
    });
    autoDelete(interaction);
    return;
  }

  const lines = users.map(u => {
    const sign = u.total >= 0 ? '+' : '';
    const recordsNote = u.openRecords === 0 ? ' · немає відкритих записів' : ` · ${u.openRecords} запис.`;
    return `• **${u.name}** (@${u.login}) — **${sign}${CURRENCY}${u.total}**${recordsNote}`;
  });

  const chunks = chunkText(lines);
  chunks[0] = `📊 **Баланс учасників** (${users.length})\n\n${chunks[0]}`;

  await replyWithText(interaction, chunks);
  autoDelete(interaction);
};
