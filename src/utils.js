const { EmbedBuilder } = require('discord.js');

const EMBED_MAX_CHARS = 5500;
const FIELD_VALUE_MAX = 1024;
const EMBEDS_PER_MESSAGE = 10;

function embedPayloadSize(embed) {
  const d = embed.data;
  let size = (d.title?.length || 0) + (d.description?.length || 0) + (d.footer?.text?.length || 0);
  for (const field of d.fields || []) {
    size += (field.name?.length || 0) + (field.value?.length || 0);
  }
  return size;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function buildBalanceEmbeds(users, CURRENCY) {
  const embeds = [];
  let current = new EmbedBuilder()
    .setTitle('📊 Баланс учасників')
    .setColor(0x3498DB)
    .setTimestamp();
  let currentSize = embedPayloadSize(current);

  const startNewEmbed = (part) => {
    embeds.push(current);
    current = new EmbedBuilder()
      .setTitle(`📊 Баланс учасників (${part})`)
      .setColor(0x3498DB)
      .setTimestamp();
    currentSize = embedPayloadSize(current);
  };

  for (const user of users) {
    const lines = user.records.map(r =>
      `• ${r.label} — **${r.type === 'income' ? '+' : '-'}${CURRENCY}${r.amount}** (${r.created_at.slice(0, 10)})`
    ).join('\n');
    const totalText = `${user.total >= 0 ? '+' : ''}${CURRENCY}${user.total}`;
    const value = truncate(`${lines}\n💰 **Баланс: ${totalText}**`, FIELD_VALUE_MAX);
    const name = truncate(`${user.name} (@${user.login})`, 256);
    const fieldSize = name.length + value.length;

    const fieldsFull = (current.data.fields?.length || 0) >= 25;
    if (fieldsFull || currentSize + fieldSize > EMBED_MAX_CHARS) {
      startNewEmbed(embeds.length + 1);
    }

    current.addFields({ name, value });
    currentSize += fieldSize;
  }

  if (!embeds.length || (current.data.fields?.length || 0) > 0) {
    embeds.push(current);
  }

  return embeds;
}

async function replyWithEmbeds(interaction, embeds) {
  for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
    const batch = embeds.slice(i, i + EMBEDS_PER_MESSAGE);
    if (i === 0) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: batch });
      } else {
        await interaction.reply({ embeds: batch, flags: 64 });
      }
    } else {
      await interaction.followUp({ embeds: batch, flags: 64 });
    }
  }
}

const MESSAGE_MAX = 1900;

function chunkText(lines, maxLen = MESSAGE_MAX) {
  const chunks = [];
  let buffer = '';

  const flush = () => {
    if (buffer) {
      chunks.push(buffer);
      buffer = '';
    }
  };

  for (const line of lines) {
    const next = buffer ? `${buffer}\n${line}` : line;
    if (next.length <= maxLen) {
      buffer = next;
      continue;
    }
    flush();
    if (line.length <= maxLen) {
      buffer = line;
    } else {
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
    }
  }
  flush();
  return chunks;
}

async function replyWithText(interaction, chunks, flags = 64) {
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: chunks[i] });
      } else {
        await interaction.reply({ content: chunks[i], flags });
      }
    } else {
      await interaction.followUp({ content: chunks[i], flags });
    }
  }
}

async function sendWeeklyNotification(channel, { amount, count, roleId }) {
  const header =
    `📅 **Щотижневий внесок нараховано!**\n\n` +
    `💰 Сума для кожного: **$${amount}**\n` +
    `👥 Учасників: **${count}**\n\n` +
    (roleId ? `<@&${roleId}>` : '');

  await channel.send(header);
}

async function autoDelete(interaction, seconds = 180) {
  setTimeout(async () => {
    try {
      await interaction.deleteReply();
    } catch {}
  }, seconds * 1000);
}

async function deleteNow(interaction) {
  try {
    await interaction.deleteReply();
  } catch {}
}

module.exports = {
  autoDelete,
  deleteNow,
  buildBalanceEmbeds,
  replyWithEmbeds,
  chunkText,
  replyWithText,
  sendWeeklyNotification,
};
