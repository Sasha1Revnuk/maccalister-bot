const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { ADMIN_ROLE, CURRENCY } = require('../config');
const { getAllContracts, getContractById, addContract, updateContract, deleteContract } = require('../db');
const { autoDelete } = require('../utils');

async function handleContractsList(interaction) {
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE);
  if (!isAdmin) {
    await interaction.reply({ content: '❌ Немає прав.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  const contracts = getAllContracts();

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Управління контрактами')
    .setColor(0x9B59B6)
    .setDescription(contracts.length
      ? contracts.map((c, i) => `**${i + 1}.** ${c.name} — ${CURRENCY}${c.reward}`).join('\n')
      : '*Контрактів немає*'
    );

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('contract_add')
      .setLabel('➕ Додати контракт')
      .setStyle(ButtonStyle.Secondary),
  ));

  if (contracts.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('contract_select_edit')
        .setPlaceholder('Обрати контракт для редагування...')
        .addOptions(contracts.map(c => ({
          label: c.name,
          description: `${CURRENCY}${c.reward}`,
          value: String(c.id),
        })))
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('contract_select_delete')
        .setPlaceholder('Обрати контракт для видалення...')
        .addOptions(contracts.map(c => ({
          label: c.name,
          description: `${CURRENCY}${c.reward}`,
          value: String(c.id),
        })))
    ));
  }

  await interaction.reply({ embeds: [embed], components: rows, flags: 64 });
  autoDelete(interaction);
}

async function handleContractAdd(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('contract_modal_add')
    .setTitle('➕ Новий контракт');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Назва контракту')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reward')
        .setLabel(`Винагорода (${CURRENCY})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Наприклад: 10000')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

async function handleContractSelectEdit(interaction) {
  const id = parseInt(interaction.values[0]);
  const contract = getContractById(id);

  const modal = new ModalBuilder()
    .setCustomId(`contract_modal_edit_${id}`)
    .setTitle('✏️ Редагувати контракт');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Назва контракту')
        .setStyle(TextInputStyle.Short)
        .setValue(contract.name)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reward')
        .setLabel(`Винагорода (${CURRENCY})`)
        .setStyle(TextInputStyle.Short)
        .setValue(String(contract.reward))
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

async function handleContractSelectDelete(interaction) {
  const id = parseInt(interaction.values[0]);
  const contract = getContractById(id);
  deleteContract(id);

  await interaction.update({
    content: `✅ Контракт **${contract.name}** видалено.`,
    embeds: [],
    components: [],
  });
  autoDelete(interaction);
}

async function handleContractModal(interaction) {
  const customId = interaction.customId;
  const name = interaction.fields.getTextInputValue('name');
  const rewardRaw = interaction.fields.getTextInputValue('reward');
  const reward = parseInt(rewardRaw);

  if (isNaN(reward) || reward <= 0) {
    await interaction.reply({ content: '❌ Винагорода має бути цілим позитивним числом.', flags: 64 });
    autoDelete(interaction);
    return;
  }

  if (customId === 'contract_modal_add') {
    addContract(name, reward);
    await interaction.reply({ content: `✅ Контракт **${name}** додано! Винагорода: ${CURRENCY}${reward}`, flags: 64 });
  } else {
    const id = parseInt(customId.replace('contract_modal_edit_', ''));
    updateContract(id, name, reward);
    await interaction.reply({ content: `✅ Контракт **${name}** оновлено! Винагорода: ${CURRENCY}${reward}`, flags: 64 });
  }

  autoDelete(interaction);
}

module.exports = {
  handleContractsList,
  handleContractAdd,
  handleContractSelectEdit,
  handleContractSelectDelete,
  handleContractModal,
};