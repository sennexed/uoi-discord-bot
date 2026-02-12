import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
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
const REQUEST_CHANNEL_ID = process.env.REQUEST_CHANNEL_ID;

const INDIAN_ROLE = "1468475916656181338";
const FOREIGN_ROLE = "1467589863690862834";


// ===================== SLASH COMMANDS =====================

const commands = [

  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register for UOI ID")
    .addStringOption(o =>
      o.setName("fullname").setDescription("Your full name").setRequired(true))
    .addStringOption(o =>
      o.setName("nationality")
        .setDescription("Indian or NRI")
        .setRequired(true)
        .addChoices(
          { name: "Indian", value: "Indian" },
          { name: "NRI", value: "NRI" }
        ))
    .addStringOption(o =>
      o.setName("password")
        .setDescription("6 digit numeric password")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("View your UOI ID card"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check your ID status"),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Send registration panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revoke a user's ID card")
    .addUserOption(o =>
      o.setName("user").setDescription("User to revoke").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(c => c.toJSON());


// ===================== REGISTER COMMANDS =====================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Slash commands synced.");
}

client.once("clientReady", async () => {
  console.log("UOI Bot Online");
  await registerCommands();
});


// ===================== INTERACTIONS =====================

client.on("interactionCreate", async interaction => {

  try {

    // ---------------- REGISTER ----------------

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "register") {

        const password = interaction.options.getString("password");

        if (!/^\d{6}$/.test(password)) {
          return interaction.reply({
            content: "Password must be exactly 6 digits.",
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
            password
          })
        });

        const requestChannel = await client.channels.fetch(REQUEST_CHANNEL_ID);

        const embed = new EmbedBuilder()
          .setTitle("New UOI ID Request")
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
          content: "Request submitted. Wait for admin approval.",
          ephemeral: true
        });
      }


      // ---------------- CARD ----------------

      if (interaction.commandName === "card") {

        const avatar = interaction.user.displayAvatarURL({ extension: "png" });

        const response = await fetch(
          `${BACKEND_URL}/card/${interaction.user.id}?avatar=${encodeURIComponent(avatar)}`
        );

        if (!response.ok) {
          return interaction.reply({
            content: "Card not available. Maybe still under review.",
            ephemeral: true
          });
        }

        const buffer = await response.arrayBuffer();

        return interaction.reply({
          files: [{
            attachment: Buffer.from(buffer),
            name: "uoi-card.png"
          }]
        });
      }


      // ---------------- STATUS ----------------

      if (interaction.commandName === "status") {

        const res = await fetch(`${BACKEND_URL}/status/${interaction.user.id}`);
        const data = await res.json();

        return interaction.reply({
          content: `Your status: **${data.status}**`,
          ephemeral: true
        });
      }


      // ---------------- SETUP ----------------

      if (interaction.commandName === "setup") {

        const embed = new EmbedBuilder()
          .setTitle("UOI Registration")
          .setDescription("Use `/register` to apply for your UOI ID.")
          .setColor("Blue");

        return interaction.reply({ embeds: [embed] });
      }


      // ---------------- REVOKE ----------------

      if (interaction.commandName === "revoke") {

        const user = interaction.options.getUser("user");

        await fetch(`${BACKEND_URL}/revoke/${user.id}`, {
          method: "POST"
        });

        return interaction.reply({
          content: `Revoked ID for ${user.username}`,
          ephemeral: true
        });
      }
    }


    // ===================== BUTTONS =====================

    if (interaction.isButton()) {

      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      }

      const [action, discordId] = interaction.customId.split("_");

      if (action === "approve") {

        await fetch(`${BACKEND_URL}/approve/${discordId}`, {
          method: "POST"
        });

        const member = await interaction.guild.members.fetch(discordId);

        const cardRes = await fetch(`${BACKEND_URL}/card/${discordId}`);
        const buffer = await cardRes.arrayBuffer();

        await member.send({
          files: [{
            attachment: Buffer.from(buffer),
            name: "uoi-card.png"
          }]
        });

        await interaction.update({ content: "Approved", components: [] });
      }

      if (action === "reject") {
        await interaction.update({ content: "Rejected", components: [] });
      }
    }

  } catch (err) {
    console.error(err);

    if (!interaction.replied) {
      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
