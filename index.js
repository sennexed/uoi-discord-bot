
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField,
    AttachmentBuilder
} = require('discord.js');
require('dotenv').config();
const fetch = require('node-fetch');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.GUILD_ID;
const BACKEND_URL = process.env.BACKEND_URL;
const INDIAN_ROLE_ID = process.env.INDIAN_ROLE_ID;
const FOREIGN_ROLE_ID = process.env.FOREIGN_ROLE_ID;

let requestChannelId = null;

const commands = [
    new SlashCommandBuilder().setName('register').setDescription('Start your verification process'),
    new SlashCommandBuilder().setName('status').setDescription('Check your current verification status'),
    new SlashCommandBuilder().setName('card').setDescription('Get your digital ID card'),
    new SlashCommandBuilder().setName('requests')
        .setDescription('Set the verification requests channel (Admin only)')
        .addChannelOption(option => option.setName('channel').setDescription('Target channel').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('approve')
        .setDescription('Manually approve a user (Admin only)')
        .addUserOption(option => option.setName('user').setDescription('User to approve').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('reject')
        .setDescription('Manually reject a user (Admin only)')
        .addUserOption(option => option.setName('user').setDescription('User to reject').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('revoke')
        .setDescription('Revoke a user verification (Admin only)')
        .addUserOption(option => option.setName('user').setDescription('User to revoke').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body: commands });
        console.log('Successfully registered guild slash commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'register') {
            const modal = new ModalBuilder().setCustomId('register_modal').setTitle('User Verification');
            
            const nameInput = new TextInputBuilder()
                .setCustomId('full_name')
                .setLabel("Full Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const nationalityInput = new TextInputBuilder()
                .setCustomId('nationality')
                .setLabel("Nationality (Indian or NRI)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const passwordInput = new TextInputBuilder()
                .setCustomId('password')
                .setLabel("Password (exactly 6 characters)")
                .setStyle(TextInputStyle.Short)
                .setMinLength(6)
                .setMaxLength(6)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(nationalityInput),
                new ActionRowBuilder().addComponents(passwordInput)
            );

            await interaction.showModal(modal);
        }

        if (commandName === 'status') {
            try {
                const res = await fetch(`${BACKEND_URL}/status/${interaction.user.id}`);
                const data = await res.json();
                if (res.ok) {
                    interaction.reply({ content: `Your status is: **${data.status.toUpperCase()}**`, ephemeral: true });
                } else {
                    interaction.reply({ content: `Verification not found. Use \`/register\` to start.`, ephemeral: true });
                }
            } catch (err) {
                interaction.reply({ content: "Error connecting to backend.", ephemeral: true });
            }
        }

        if (commandName === 'card') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const res = await fetch(`${BACKEND_URL}/generate_card/${interaction.user.id}?avatar_url=${encodeURIComponent(interaction.user.displayAvatarURL({ extension: 'png' }))}`);
                if (res.ok) {
                    const buffer = await res.buffer();
                    const attachment = new AttachmentBuilder(buffer, { name: 'uoi_id_card.png' });
                    await interaction.editReply({ files: [attachment] });
                } else {
                    await interaction.editReply({ content: "You do not have an active ID card. Check status with `/status`." });
                }
            } catch (err) {
                await interaction.editReply({ content: "Error generating ID card." });
            }
        }

        if (commandName === 'requests') {
            requestChannelId = interaction.options.getChannel('channel').id;
            interaction.reply({ content: `Requests channel set to <#${requestChannelId}>`, ephemeral: true });
        }

        if (['approve', 'reject', 'revoke'].includes(commandName)) {
            const targetUser = interaction.options.getUser('user');
            const newStatus = commandName === 'approve' ? 'active' : (commandName === 'reject' ? 'rejected' : 'revoked');
            await handleVerificationUpdate(interaction, targetUser.id, newStatus);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'register_modal') {
            const full_name = interaction.fields.getTextInputValue('full_name');
            const nationalityInput = interaction.fields.getTextInputValue('nationality').trim().toLowerCase();
            const password = interaction.fields.getTextInputValue('password');

            const nationality = nationalityInput.includes('nri') ? 'NRI' : 'Indian';

            try {
                const res = await fetch(`${BACKEND_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        discord_id: interaction.user.id,
                        full_name,
                        nationality,
                        password
                    })
                });

                if (res.ok) {
                    await interaction.reply({ content: "Registration submitted successfully! Please wait for admin approval.", ephemeral: true });
                    
                    if (requestChannelId) {
                        const channel = await client.channels.fetch(requestChannelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle("New Verification Request")
                                .setColor(0x0099FF)
                                .addFields(
                                    { name: "User", value: `${interaction.user.tag} (${interaction.user.id})` },
                                    { name: "Full Name", value: full_name },
                                    { name: "Nationality", value: nationality }
                                )
                                .setTimestamp();

                            const buttons = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`approve_${interaction.user.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
                            );

                            await channel.send({ embeds: [embed], components: [buttons] });
                        }
                    }
                } else {
                    const err = await res.json();
                    await interaction.reply({ content: `Registration failed: ${err.error}`, ephemeral: true });
                }
            } catch (err) {
                await interaction.reply({ content: "Critical error connecting to backend.", ephemeral: true });
            }
        }
    }

    if (interaction.isButton()) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "Only admins can perform this action.", ephemeral: true });
        }

        const [action, userId] = interaction.customId.split('_');
        const status = action === 'approve' ? 'active' : 'rejected';
        await handleVerificationUpdate(interaction, userId, status);
    }
});

async function handleVerificationUpdate(interaction, userId, status) {
    try {
        const res = await fetch(`${BACKEND_URL}/update_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discord_id: userId, status })
        });

        if (res.ok) {
            const data = await res.json();
            const guild = client.guilds.cache.get(GUILD_ID);
            const member = await guild.members.fetch(userId).catch(() => null);

            if (status === 'active' && member) {
                const roleId = data.nationality === 'Indian' ? INDIAN_ROLE_ID : FOREIGN_ROLE_ID;
                if (roleId) await member.roles.add(roleId).catch(console.error);

                // Send DM with Card
                try {
                    const cardRes = await fetch(`${BACKEND_URL}/generate_card/${userId}?avatar_url=${encodeURIComponent(member.user.displayAvatarURL({ extension: 'png' }))}`);
                    if (cardRes.ok) {
                        const buffer = await cardRes.buffer();
                        const attachment = new AttachmentBuilder(buffer, { name: 'uoi_id_card.png' });
                        await member.send({ content: "Congratulations! Your verification is complete. Here is your ID card.", files: [attachment] });
                    }
                } catch (dmErr) { console.error("Could not send DM to user."); }
            }

            const msg = `User <@${userId}> has been ${status === 'active' ? 'APPROVED' : (status === 'rejected' ? 'REJECTED' : 'REVOKED')}.`;
            if (interaction.isButton()) {
                await interaction.update({ content: msg, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: msg, ephemeral: true });
            }
        } else {
            const err = await res.json();
            await interaction.reply({ content: `Update failed: ${err.error}`, ephemeral: true });
        }
    } catch (err) {
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: "Communication error with backend.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Communication error with backend.", ephemeral: true });
        }
    }
}

client.login(TOKEN);
