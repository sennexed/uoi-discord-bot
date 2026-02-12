import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST
} from 'discord.js'

import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

// ======================
// CLIENT SETUP
// ======================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

// ======================
// COMMANDS
// ======================

const commands = [
  new SlashCommandBuilder()
    .setName('card')
    .setDescription('Get your UOI ID card'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check your registration status')
].map(command => command.toJSON())

// ======================
// REGISTER COMMANDS (GUILD - INSTANT)
// ======================

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.APPLICATION_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    )

    console.log('Slash commands registered.')
  } catch (err) {
    console.error('Command registration failed:', err)
  }
}

// ======================
// READY EVENT
// ======================

client.once('clientReady', async () => {
  console.log('UOI Bot Online')
  await registerCommands()
})

// ======================
// INTERACTIONS
// ======================

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return

  // ---------- /card ----------
  if (interaction.commandName === 'card') {
    await interaction.deferReply()

    try {
      const response = await fetch(
        `${process.env.BACKEND_URL}/card/${interaction.user.id}?avatar=${interaction.user.displayAvatarURL({ extension: 'png', size: 256 })}`
      )

      if (!response.ok) {
        return interaction.editReply("Card not available.")
      }

      const buffer = await response.arrayBuffer()

      await interaction.editReply({
        files: [
          {
            attachment: Buffer.from(buffer),
            name: 'uoi-card.png'
          }
        ]
      })

    } catch (error) {
      console.error('Card fetch error:', error)
      await interaction.editReply("Backend error. Try again later.")
    }
  }

  // ---------- /status ----------
  if (interaction.commandName === 'status') {
    await interaction.deferReply({ ephemeral: true })

    try {
      const response = await fetch(
        `${process.env.BACKEND_URL}/status/${interaction.user.id}`
      )

      if (!response.ok) {
        return interaction.editReply("Not registered.")
      }

      const data = await response.json()

      await interaction.editReply(`Your status: **${data.status}**`)
    } catch (error) {
      console.error('Status fetch error:', error)
      await interaction.editReply("Backend error. Try again later.")
    }
  }
})

// ======================
// GLOBAL CRASH PROTECTION
// ======================

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error)
})

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error)
})

// ======================
// LOGIN
// ======================

client.login(process.env.DISCORD_TOKEN)
