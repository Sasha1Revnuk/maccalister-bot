const { EmbedBuilder } = require('discord.js');
const { getAllBalance } = require('../db');
const { ADMIN_ROLE, CURRENCY } = require('../config');
const { autoDelete } = require('../utils');

module.exports = async function handleBalance(interaction) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const users = getAllBalance();

  if (!users.length) {
    await interaction.reply({ content: '📭 Записів немає.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📊 Баланс учасників')
    .setColor(0x3498DB)
    .setTimestamp();

  for (const user of users) {
    const lines = user.records.map(r =>
      `• ${r.label} — **${r.type === 'income' ? '+' : '-'}${CURRENCY}${r.amount}** (${r.created_at.slice(0, 10)})`
    ).join('\n');

    const total = user.total;
    const totalText = `${total >= 0 ? '+' : ''}${CURRENCY}${total}`;

    embed.addFields({
      name: `${user.name} (@${user.login})`,
      value: `${lines}\n💰 **Баланс: ${totalText}**`,
    });
  }

  await interaction.reply({ embeds: [embed], flags: 64 });
  autoDelete(interaction);
};