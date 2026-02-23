require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');

const { WEEKLY_AMOUNT, WEEKLY_DEBT_LABEL, IGNORED_ROLE, NOTIFICATIONS_CHANNEL_ID } = require('./config');
const { db, upsertUser, getAllUsers, createWeeklyRecords } = require('./db');

const handleMenu = require('./commands/menu');
const handleSyncUsers = require('./commands/syncUsers');
const handleCreateWeeklyRecords = require('./commands/createWeeklyRecords');
const handleBalance = require('./commands/balance');
const handleMyBalance = require('./commands/myBalance');
const {
  handleNewRecordStart, handleNewRecordType,
  handleNewRecordUser, handleNewRecordRecords, handleNewRecordModal,
} = require('./commands/newRecord');
const {
  handleContractsList, handleContractAdd,
  handleContractSelectEdit, handleContractSelectDelete, handleContractModal,
} = require('./commands/contracts');
const {
  handleStartContract, handleStartContractSelect,
  handleViewContract, handleJoinContract,
  handleRemoveMember, handleRemoveMemberSelect, handleCloseContract,
} = require('./commands/activeContract');
const {
  handlePayoutRequest, handlePayoutModal,
  handlePayoutApprove, handlePayoutReject, handlePayoutRejectReason,
} = require('./commands/payoutRequest');
const {
  handleDepositRequest, handleDepositSelectExpense,
  handleDepositModalFree, handleDepositModalExpense,
  handleDepositApprove, handleDepositReject, handleDepositRejectReason,
} = require('./commands/depositRequest');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

async function runWeeklyRecords() {
  const guild = client.guilds.cache.first();

  try {
    await guild.members.fetch();
  } catch (err) {
    console.warn('⚠️ Rate limit, використовуємо кеш');
  }

  // Фільтруємо: без ботів і без ігнорованої ролі
  const validMembers = [...guild.members.cache.values()].filter(m =>
    !m.user.bot && !m.roles.cache.has(IGNORED_ROLE)
  );

  const discordLogins = new Set(validMembers.map(m => m.user.username));

  // Синхронізуємо учасників
  for (const member of validMembers) {
    upsertUser(member.user.username, member.displayName);
  }

  // Видаляємо тих кого вже немає або хто отримав ігноровану роль
  const dbUsers = getAllUsers();
  for (const user of dbUsers) {
    if (!discordLogins.has(user.login)) {
      db.prepare('DELETE FROM users WHERE login = ?').run(user.login);
    }
  }

  const users = getAllUsers();
  const amount = Math.floor(WEEKLY_AMOUNT / 4 / users.length);
  const count = createWeeklyRecords(amount, WEEKLY_DEBT_LABEL);

  try {
    const channel = guild.channels.cache.get(NOTIFICATIONS_CHANNEL_ID);
    if (channel) {
      const tags = validMembers.map(m => `<@${m.id}>`).join(' ');

      await channel.send(
        `📅 **Щотижневий внесок нараховано!**\n\n` +
        `💰 Сума для кожного: **$${amount}**\n` +
        `👥 Учасників: **${count}**\n\n` +
        `${tags}`
      );
    }
  } catch (err) {
    console.error('❌ Помилка відправки сповіщення:', err.message);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущений як ${client.user.tag}`);
  cron.schedule('0 7 * * 1', () => {
    console.log('⏰ Крон: щотижневі внески');
    runWeeklyRecords();
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'menu') await handleMenu(interaction);
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'syncusers')                   await handleSyncUsers(interaction, interaction.guild);
      else if (id === 'createweeklyrecords')    await handleCreateWeeklyRecords(interaction, interaction.guild);
      else if (id === 'balance')                await handleBalance(interaction);
      else if (id === 'mybalance')              await handleMyBalance(interaction);
      else if (id === 'newrecord_start')        await handleNewRecordStart(interaction);
      else if (id === 'contracts_list')         await handleContractsList(interaction);
      else if (id === 'contract_add')           await handleContractAdd(interaction);
      else if (id === 'contract_start')         await handleStartContract(interaction);
      else if (id === 'contract_view')          await handleViewContract(interaction);
      else if (id === 'contract_join')          await handleJoinContract(interaction);
      else if (id === 'contract_remove_member') await handleRemoveMember(interaction);
      else if (id === 'contract_close')         await handleCloseContract(interaction);
      else if (id === 'payout_request')         await handlePayoutRequest(interaction);
      else if (id === 'deposit_request')        await handleDepositRequest(interaction);
      else if (id.startsWith('payout_approve_'))  await handlePayoutApprove(interaction);
      else if (id.startsWith('deposit_approve_')) await handleDepositApprove(interaction);
      else if (id.startsWith('payout_reject_') && !id.startsWith('payout_reject_reason_'))   await handlePayoutReject(interaction);
      else if (id.startsWith('deposit_reject_') && !id.startsWith('deposit_reject_reason_')) await handleDepositReject(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id === 'newrecord_type')                    await handleNewRecordType(interaction);
      else if (id.startsWith('newrecord_user_'))      await handleNewRecordUser(interaction);
      else if (id.startsWith('newrecord_records_'))   await handleNewRecordRecords(interaction);
      else if (id === 'contract_select_edit')         await handleContractSelectEdit(interaction);
      else if (id === 'contract_select_delete')       await handleContractSelectDelete(interaction);
      else if (id === 'contract_start_select')        await handleStartContractSelect(interaction);
      else if (id === 'contract_remove_select')       await handleRemoveMemberSelect(interaction);
      else if (id === 'deposit_select_expense')       await handleDepositSelectExpense(interaction);
    }

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id.startsWith('newrecord_modal_'))            await handleNewRecordModal(interaction);
      else if (id.startsWith('contract_modal_'))        await handleContractModal(interaction);
      else if (id === 'payout_modal')                   await handlePayoutModal(interaction);
      else if (id.startsWith('payout_reject_reason_'))  await handlePayoutRejectReason(interaction);
      else if (id === 'deposit_modal_free')              await handleDepositModalFree(interaction);
      else if (id.startsWith('deposit_modal_expense_')) await handleDepositModalExpense(interaction);
      else if (id.startsWith('deposit_reject_reason_')) await handleDepositRejectReason(interaction);
    }

  } catch (err) {
    console.error('❌ Помилка обробки interaction:', err.message);
  }
});

client.on('error', (error) => {
  console.error('❌ Помилка клієнта:', error.message);
});

client.login(process.env.DISCORD_TOKEN);