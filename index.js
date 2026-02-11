import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const APPLICATION_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.GUILD_ID;
const BACKEND_URL = process.env.BACKEND_URL;

// Roles
const INDIAN_ROLE = "1468475916656181338";
const FOREIGN_ROLE = "1467589863690862834";

// Channel where requests appear
const REQUEST_CHANNEL_ID = process.env.REQUEST_CHANNEL_ID;

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register for UOI ID")
    .addStringOption(option =>
      option.setName("fullname")
        .setDescription("Your full name")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("nationality")
        .setDescription("Indian or NRI")
        .setRequired(true)
        .addChoices(
          { name: "Indian", value: "Indian" },
          { name: "NRI", value: "NRI" }
        ))
    .addStringOption(option =>
      option.setName("password")
        .setDescription("6 word password")
        .setRequired(true))
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
    { body: commands }
  );
}

client.once("ready", async () => {
  console.log("UOI Bot Online");
  await registerCommands();
});

client.on("interactionCreate", async interaction => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "register") {

      const password = interaction.options.getString("password");

      if (!/^\d{6}$/.test(password)) {
        return interaction.reply({
          content: "Password must be exactly 6 words.",
          ephemeral: true
        });
      }

      await fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discord_id: interaction.user.id,
          full_name: interaction.options.getString("fullname"),
          nationality: interaction.options.getString("nationality"),
          password: password
        })
      });

      const requestChannel = await client.channels.fetch(REQUEST_CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setTitle("New ID Request")
        .setDescription(`User: <@${interaction.user.id}>`)
        .setColor("Blue");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${interaction.user.id}`)
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject_${interaction.user.id}`)
          .setLabel("Reject")
          .setStyle(ButtonStyle.Danger)
      );

      await requestChannel.send({ embeds: [embed], components: [row] });

      return interaction.reply({
        content: "Request submitted. Wait 1-2 business days.",
        ephemeral: true
      });
    }
  }

  if (interaction.isButton()) {

    const [action, discordId] = interaction.customId.split("_");

    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply({ content: "Admins only.", ephemeral: true });
    }

    if (action === "approve") {

      await fetch(`${BACKEND_URL}/approve/${discordId}`, {
        method: "POST"
      });

      const member = await interaction.guild.members.fetch(discordId);

      const cardRes = await fetch(`${BACKEND_URL}/card/${discordId}`);
      const card = await cardRes.json();

      if (card.nationality === "Indian") {
        await member.roles.add(INDIAN_ROLE);
      } else {
        await member.roles.add(FOREIGN_ROLE);
      }

      const dmEmbed = new EmbedBuilder()
        .setTitle("UOI Identification Card")
        .addFields(
          { name: "ID", value: card.user_id },
          { name: "Name", value: card.full_name },
          { name: "Nationality", value: card.nationality },
          { name: "Role", value: card.role }
        )
        .setColor("Blue");

      await member.send({ embeds: [dmEmbed] });

      await interaction.update({ content: "Approved", components: [] });
    }

    if (action === "reject") {
      await interaction.update({ content: "Rejected", components: [] });
    }
  }

});

client.login(process.env.DISCORD_TOKEN);
