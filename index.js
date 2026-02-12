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
  AttachmentBuilder
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

process.on("unhandledRejection", err => {
  console.error("Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register for UOI ID")
    .addStringOption(o =>
      o.setName("fullname").setDescription("Full name").setRequired(true))
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
        .setDescription("6 digit password")
        .setRequired(true))
].map(c => c.toJSON());

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

  try {

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "register") {

        const password = interaction.options.getString("password");

        if (!/^\d{6}$/.test(password)) {
          return interaction.reply({
            content: "Password must be exactly 6 digits.",
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const res = await fetch(`${BACKEND_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discord_id: interaction.user.id,
            full_name: interaction.options.getString("fullname"),
            nationality: interaction.options.getString("nationality"),
            password
          })
        });

        const data = await res.json();

        if (!res.ok) {
          return interaction.editReply(data.error || "Registration failed.");
        }

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

        await interaction.editReply("Request submitted.");
      }
    }

    if (interaction.isButton()) {

      await interaction.deferUpdate();

      const [action, discordId] = interaction.customId.split("_");

      if (!interaction.member.permissions.has("Administrator")) {
        return;
      }

      if (action === "approve") {

        await fetch(`${BACKEND_URL}/approve/${discordId}`, { method: "POST" });

        const member = await interaction.guild.members.fetch(discordId);

        const avatar = member.displayAvatarURL({ extension: "png" });

        const cardRes = await fetch(`${BACKEND_URL}/card/${discordId}?avatar=${encodeURIComponent(avatar)}`);

        if (!cardRes.ok) {
          await interaction.editReply({ content: "Card generation failed.", components: [] });
          return;
        }

        const buffer = await cardRes.arrayBuffer();

        const attachment = new AttachmentBuilder(Buffer.from(buffer), {
          name: "uoi_card.png"
        });

        if (member.roles) {
          await member.roles.add(INDIAN_ROLE);
        }

        try {
          await member.send({ files: [attachment] });
        } catch {
          console.log("User has DMs closed.");
        }

        await interaction.editReply({ content: "Approved ✅", components: [] });
      }

      if (action === "reject") {
        await interaction.editReply({ content: "Rejected ❌", components: [] });
      }
    }

  } catch (err) {
    console.error("Interaction Error:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "An error occurred.", ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
