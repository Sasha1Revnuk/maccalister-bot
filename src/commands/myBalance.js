const { EmbedBuilder } = require('discord.js');
const { getAllBalance } = require('../db');
const { CURRENCY } = require('../config');
const { autoDelete } = require('../utils');

module.exports = async function handleMyBalance(interaction) {
  const login = interaction.user.username;

  // Використовуємо getAllBalance і фільтруємо по юзеру
  const allBalance = getAllBalance();
  const userData = allBalance.find(u => u.login === login);

  if (!userData || !userData.records.length) {
    await interaction.reply({ content: '✅ У тебе немає активних записів!', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const total = userData.total; // вже розрахований як income - expense

  const embed = new EmbedBuilder()
    .setTitle('💰 Мій баланс')
    .setColor(total >= 0 ? 0x2ECC71 : 0xE74C3C)
    .setTimestamp()
    .addFields(
      ...userData.records.map((r, i) => ({
        name: `${i + 1}. ${r.label}`,
        value: `📅 ${r.created_at.slice(0, 10)} — **${r.type === 'income' ? '+' : '-'}${CURRENCY}${r.amount}**`,
      }))
    )
    .setFooter({
      text: `Баланс: ${total >= 0 ? '+' : ''}${CURRENCY}${total}`,
    });

  await interaction.reply({ embeds: [embed], flags: 64 });
  autoDelete(interaction);
};