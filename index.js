import { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST } from 'discord.js'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)

const commands = [
  new SlashCommandBuilder()
    .setName('card')
    .setDescription('Get your UOI ID card'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check your registration status')
].map(command => command.toJSON())

await rest.put(
  Routes.applicationCommands(process.env.APPLICATION_ID),
  { body: commands }
)

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return

  if (interaction.commandName === 'card') {
    await interaction.deferReply()

    const response = await fetch(
      `${process.env.BACKEND_URL}/card/${interaction.user.id}?avatar=${interaction.user.displayAvatarURL({ extension: 'png', size: 256 })}`
    )

    if (!response.ok) {
      return interaction.editReply("Card not available.")
    }

    const buffer = await response.arrayBuffer()

    await interaction.editReply({
      files: [{ attachment: Buffer.from(buffer), name: 'uoi-card.png' }]
    })
  }

  if (interaction.commandName === 'status') {
    await interaction.deferReply({ ephemeral: true })

    const response = await fetch(
      `${process.env.BACKEND_URL}/status/${interaction.user.id}`
    )

    if (!response.ok) {
      return interaction.editReply("Not registered.")
    }

    const data = await response.json()
    await interaction.editReply(`Your status: **${data.status}**`)
  }
})

client.login(process.env.DISCORD_TOKEN)
