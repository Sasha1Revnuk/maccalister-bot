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

module.exports = { autoDelete, deleteNow };