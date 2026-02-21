const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { CURRENCY, CONTRACTS_CHANNEL_ID, MACCALISTER_ROLE_ID } = require('../config');
const {
  getAllContracts, getContractById,
  getActiveContract, startContract, closeActiveContract,
  getActiveContractMembers, joinContract, removeMemberFromContract,
  addRecord, getAllUsers,
} = require('../db');
const { autoDelete, deleteNow } = require('../utils');

async function handleStartContract(interaction) {
  const active = getActiveContract();
  if (active) {
    await interaction.reply({
      content: `❌ Вже є активний контракт: **${active.name}**. Спочатку закрийте його.`,
      flags: 64,
    });
    autoDelete(interaction);
    return;
  }

  const contracts = getAllContracts();
  if (!contracts.length) {
    await interaction.reply({ content: '❌ Немає доступних контрактів.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('contract_start_select')
    .setPlaceholder('Оберіть контракт...')
    .addOptions(contracts.map(c => ({
      label: c.name,
      description: `Винагорода: ${CURRENCY}${c.reward}`,
      value: String(c.id),
    })));

  await interaction.reply({
    content: '📜 Оберіть контракт для запуску:',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: 64,
  });
  autoDelete(interaction);
}

async function handleStartContractSelect(interaction) {
  const contractId = parseInt(interaction.values[0]);
  const contract = getContractById(contractId);
  const login = interaction.user.username;

  const result = startContract(contractId, login);
  const activeId = result.lastInsertRowid;

  joinContract(activeId, login);

  try {
    const channel = interaction.guild.channels.cache.get(CONTRACTS_CHANNEL_ID);
    if (channel) {
      const member = interaction.guild.members.cache.find(m => m.user.username === login);
      await channel.send(
        `🚀 **Контракт розпочато!**\n\n` +
        `📜 Назва: **${contract.name}**\n` +
        `💰 Винагорода: **${CURRENCY}${contract.reward}**\n` +
        `👤 Запустив: ${member ? `<@${member.id}>` : `@${login}`}\n\n` +
        `<@&${MACCALISTER_ROLE_ID}> Приєднуйтесь через \`/menu\` → 📜 Активний контракт`
      );
    }
  } catch (err) {
    console.error('❌ Помилка відправки в канал:', err.message);
  }

  await interaction.update({
    content: `✅ Контракт **${contract.name}** запущено! Ви автоматично додані як виконавець.`,
    components: [],
  });
  deleteNow(interaction);
}

async function handleViewContract(interaction) {
  const active = getActiveContract();

  if (!active) {
    await interaction.reply({ content: '📭 Наразі немає активного контракту.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const members = getActiveContractMembers(active.id);
  const rewardPerMember = members.length > 0 ? Math.floor(active.reward / members.length) : active.reward;

  const embed = new EmbedBuilder()
    .setTitle(`📜 Активний контракт: ${active.name}`)
    .setColor(0x2ECC71)
    .addFields(
      { name: '💰 Загальна винагорода', value: `${CURRENCY}${active.reward}`, inline: true },
      { name: '👥 Учасників', value: String(members.length), inline: true },
      { name: '💵 Винагорода на кожного', value: `${CURRENCY}${rewardPerMember}`, inline: true },
      {
        name: '👤 Виконавці',
        value: members.length
          ? members.map(m => `• ${m.name} (@${m.user_login})`).join('\n')
          : '*Немає учасників*'
      },
    )
    .setFooter({ text: `Запустив: @${active.started_by} • ${active.started_at.slice(0, 10)}` });

  const isStarter = interaction.user.username === active.started_by;
  const alreadyJoined = members.some(m => m.user_login === interaction.user.username);
  const rows = [];
  const actionRow = new ActionRowBuilder();

  if (!alreadyJoined) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('contract_join')
        .setLabel('➕ Доєднатись')
        .setStyle(ButtonStyle.Success),
    );
  }

  if (isStarter) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId('contract_remove_member')
        .setLabel('🚫 Видалити учасника')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('contract_close')
        .setLabel('🏁 Закрити контракт')
        .setStyle(ButtonStyle.Danger),
    );
  }

  if (actionRow.components.length) rows.push(actionRow);

  await interaction.reply({ embeds: [embed], components: rows, flags: 64 });
  autoDelete(interaction);
}

async function handleJoinContract(interaction) {
  const active = getActiveContract();
  if (!active) {
    await interaction.reply({ content: '❌ Немає активного контракту.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const login = interaction.user.username;
  const users = getAllUsers();
  const userExists = users.find(u => u.login === login);

  if (!userExists) {
    await interaction.reply({ content: '❌ Тебе немає в базі. Спочатку виконайте Sync Users.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const result = joinContract(active.id, login);
  if (result === 'already') {
    await interaction.reply({ content: '⚠️ Ти вже є учасником цього контракту.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  await interaction.reply({ content: `✅ Ти приєднався до контракту **${active.name}**!`, flags: 64 });
  deleteNow(interaction);
}

async function handleRemoveMember(interaction) {
  const active = getActiveContract();
  if (!active || active.started_by !== interaction.user.username) {
    await interaction.reply({ content: '❌ Немає прав або немає активного контракту.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const members = getActiveContractMembers(active.id)
    .filter(m => m.user_login !== interaction.user.username);

  if (!members.length) {
    await interaction.reply({ content: '❌ Немає учасників для видалення.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('contract_remove_select')
    .setPlaceholder('Оберіть учасника для видалення...')
    .addOptions(members.map(m => ({
      label: m.name,
      description: `@${m.user_login}`,
      value: m.user_login,
    })));

  await interaction.reply({
    content: '🚫 Оберіть учасника для видалення:',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: 64,
  });
  autoDelete(interaction);
}

async function handleRemoveMemberSelect(interaction) {
  const active = getActiveContract();
  const loginToRemove = interaction.values[0];

  removeMemberFromContract(active.id, loginToRemove);

  await interaction.update({
    content: `✅ Учасника **@${loginToRemove}** видалено з контракту.`,
    components: [],
  });
  deleteNow(interaction);
}

async function handleCloseContract(interaction) {
  const active = getActiveContract();

  if (!active || active.started_by !== interaction.user.username) {
    await interaction.reply({ content: '❌ Тільки той хто запустив контракт може його закрити.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const members = getActiveContractMembers(active.id);
  if (!members.length) {
    await interaction.reply({ content: '❌ Немає учасників контракту.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const rewardPerMember = Math.floor(active.reward / members.length);
  const guild = interaction.guild;
  const summaryLines = [];

  for (const member of members) {
    const login = member.user_login;

    const { netted, remaining } = addRecord(login, rewardPerMember, `Винагорода: ${active.name}`, 'income');

    const discordMember = guild.members.cache.find(m => m.user.username === login);
    const tag = discordMember ? `<@${discordMember.id}>` : `@${login}`;

    const memberLines = [];

    for (const n of netted) {
      const date = n.created_at ? ` (${n.created_at.slice(0, 10)})` : '';
      if (n.fullyPaid) {
        memberLines.push(`  ✅ Погашено: **${n.label}**${date} — початкова ${CURRENCY}${n.originalAmount}`);
      } else {
        memberLines.push(`  ⚠️ Частково: **${n.label}**${date} — початкова ${CURRENCY}${n.originalAmount}, сплачено ${CURRENCY}${n.paid}, залишок ${CURRENCY}${n.leftover}`);
      }
    }

    if (remaining > 0 && netted.length > 0) {
      memberLines.push(`  💵 Залишок **${CURRENCY}${remaining}** записано як дохід`);
    } else if (netted.length === 0) {
      memberLines.push(`  📋 Мінусових записів не було, дохід **${CURRENCY}${rewardPerMember}** додано`);
    }

    summaryLines.push(
      `👤 ${tag} — отримує **${CURRENCY}${rewardPerMember}**\n${memberLines.join('\n')}`
    );
  }

  closeActiveContract(active.id);

  const summaryText =
    `🏁 **Контракт завершено: ${active.name}**\n\n` +
    `💰 Загальна винагорода: **${CURRENCY}${active.reward}**\n` +
    `👥 Учасників: **${members.length}**\n` +
    `💵 На кожного: **${CURRENCY}${rewardPerMember}**\n\n` +
    `**Деталі розподілу:**\n\n${summaryLines.join('\n\n')}`;

  try {
    const channel = guild.channels.cache.get(CONTRACTS_CHANNEL_ID);
    if (channel) {
      if (summaryText.length <= 2000) {
        await channel.send(summaryText);
      } else {
        const header =
          `🏁 **Контракт завершено: ${active.name}**\n` +
          `💰 ${CURRENCY}${active.reward} | 👥 ${members.length} учасників | 💵 ${CURRENCY}${rewardPerMember}/особу\n\n`;
        await channel.send(header);
        for (const line of summaryLines) await channel.send(line);
      }
    }
  } catch (err) {
    console.error('❌ Помилка відправки в канал:', err.message);
  }

  await interaction.update({
    embeds: [],
    components: [],
    content: `✅ Контракт **${active.name}** закрито!`,
  });
  deleteNow(interaction);
}

module.exports = {
  handleStartContract,
  handleStartContractSelect,
  handleViewContract,
  handleJoinContract,
  handleRemoveMember,
  handleRemoveMemberSelect,
  handleCloseContract,
};