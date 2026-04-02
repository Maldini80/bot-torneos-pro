// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');
const PendingTeam = require('../models/pendingTeam.js');
const t = require('../utils/translator.js');
const mongoose = require('mongoose');

const POSITION_KEYS = ['GK', 'CB', 'WB', 'CDM', 'CM', 'CAM', 'ST'];

async function sendApprovalRequest(interaction, client, { vpgUsername, teamName, teamAbbr, teamTwitter, leagueName, logoUrl }) {
    const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
    if (!approvalChannelId) return;
    const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
    if (!approvalChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 Nueva Solicitud de Registro')
        .setColor('Orange')
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setThumbnail(logoUrl && logoUrl.startsWith('http') ? logoUrl : null)
        .addFields(
            { name: 'Usuario VPG', value: vpgUsername },
            { name: 'Nombre del Equipo', value: teamName },
            { name: 'Abreviatura', value: teamAbbr },
            { name: 'Twitter del Equipo', value: teamTwitter || 'No especificado' },
            { name: 'URL del Logo', value: `[Ver Logo](${logoUrl})` }
        )
        .setTimestamp();

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`approve_team_select_${interaction.user.id}`)
            .setPlaceholder('Elige la liga para APROBAR este equipo')
            .addOptions([
                { label: '💎 Liga DIAMOND (1550+ ELO)', value: '1550_DIAMOND', description: 'Empieza con 1550 Puntos' },
                { label: '👑 Liga GOLD (1300-1549 ELO)', value: '1300_GOLD', description: 'Empieza con 1300 Puntos' },
                { label: '⚙️ Liga SILVER (1000-1299 ELO)', value: '1000_SILVER', description: 'Empieza con 1000 Puntos' },
                { label: '🥉 Liga BRONZE (<1000 ELO)', value: '700_BRONZE', description: 'Empieza con 700 Puntos' }
            ])
    );

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`reject_request_${interaction.user.id}`)
            .setLabel('Rechazar')
            .setStyle(ButtonStyle.Danger)
    );

    await approvalChannel.send({ content: `**Solicitante:** <@${interaction.user.id}>`, embeds: [embed], components: [selectRow, buttonRow] });
}


module.exports = async (client, interaction) => {
    const { customId, fields, user } = interaction;
    let member = interaction.member;
    let guild = interaction.guild;

    // BLOQUE DE SEGURIDAD: Asegura que 'member' y 'guild' siempre tengan valor, incluso desde MDs.
    if (!member || !guild) {
        try {
            guild = await client.guilds.fetch(process.env.GUILD_ID);
            member = await guild.members.fetch(user.id);
        } catch (e) {
            console.error("Error crítico al buscar miembro/guild en modalHandler:", e);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: 'Error crítico: No pude encontrarte en el servidor principal. No se puede continuar.', flags: MessageFlags.Ephemeral });
            }
            return;
        }
    }
    
    if (customId.startsWith('admin_submit_logo_modal_')) {
        await interaction.deferUpdate();
        const teamId = customId.split('_')[4];
        const logoUrl = fields.getTextInputValue('logoUrl');

        await Team.findByIdAndUpdate(teamId, { logoUrl });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_add_captains_${teamId}`).setLabel('Añadir Capitanes').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`admin_add_players_${teamId}`).setLabel('Añadir Jugadores').setStyle(ButtonStyle.Success)
        );
        await interaction.editReply({
            content: `✅ Logo personalizado añadido con éxito. Ahora puedes añadir miembros a la plantilla.`,
            components: [row]
        });
        return;
    }

    if (customId.startsWith('admin_create_team_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = customId.split('_');
        const managerId = parts[4];
        const leagueName = parts[5].replace(/-/g, ' ');
        const teamName = fields.getTextInputValue('teamName');
        const teamAbbr = fields.getTextInputValue('teamAbbr').toUpperCase();
        const teamTwitter = fields.getTextInputValue('teamTwitter') || null;    

        const existingTeam = await Team.findOne({ name: teamName, guildId: guild.id });
        if (existingTeam) return interaction.editReply({ content: `❌ Ya existe un equipo con el nombre "${teamName}".` });
        
        const managerMember = await guild.members.fetch(managerId).catch(() => null);
        if (!managerMember) return interaction.editReply({ content: `❌ El mánager seleccionado ya no está en el servidor.` });

        const newTeam = new Team({ 
            name: teamName, 
            abbreviation: teamAbbr, 
            guildId: guild.id, 
            league: leagueName, 
            logoUrl: 'https://i.imgur.com/X2YIZh4.png',
            managerId,
            twitterHandle: teamTwitter
        });
        await newTeam.save();

        await managerMember.roles.add([process.env.MANAGER_ROLE_ID, process.env.PLAYER_ROLE_ID]);
        await managerMember.setNickname(`|MG| ${teamAbbr} ${managerMember.user.username}`).catch(() => {});
        
        const teamId = newTeam._id.toString();
        
        const logoRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_set_logo_custom_${teamId}`).setLabel('Añadir Logo Personalizado').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_continue_no_logo_${teamId}`).setLabel('Continuar (Usar Defecto)').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ 
            content: `✅ Equipo **${teamName}** creado con <@${managerId}> como Mánager.\n\n**Paso 3 de 3:** ¿Quieres añadir un logo personalizado o usar el logo por defecto?`,
            components: [logoRow]
        });
        return;
    }

    if (customId.startsWith('unified_registration_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const platform = customId.split('_')[3];
        const gameId = fields.getTextInputValue('gameIdInput');
        const vpgUsername = fields.getTextInputValue('vpgUsernameInput');
        const twitter = fields.getTextInputValue('twitterInput');
        const whatsapp = fields.getTextInputValue('whatsappInput');

        let tournamentDbConnection;
        try {
            tournamentDbConnection = await mongoose.createConnection(process.env.DATABASE_URL, {
                dbName: 'tournamentBotDb'
            });
            const verifiedUsersCollection = tournamentDbConnection.collection('verified_users');
            const draftsCollection = tournamentDbConnection.collection('drafts');

            const verifiedUserData = {
                discordId: user.id, discordTag: user.tag, gameId: gameId,
                platform: platform,
                twitter: twitter, whatsapp: whatsapp,
                verifiedAt: new Date()
            };
            await verifiedUsersCollection.updateOne({ discordId: user.id }, { $set: verifiedUserData }, { upsert: true });

            await VPGUser.findOneAndUpdate(
                { discordId: user.id },
                { vpgUsername: vpgUsername, twitterHandle: twitter },
                { upsert: true, new: true }
            );

            if (process.env.PLAYER_ROLE_ID) await member.roles.add(process.env.PLAYER_ROLE_ID);
            if (process.env.VERIFIED_ROLE_ID) await member.roles.add(process.env.VERIFIED_ROLE_ID);

            const activeDraft = await draftsCollection.findOne({ status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] } });

            if (activeDraft) {
                const embed = new EmbedBuilder()
                    .setTitle(t('unifiedRegistrationDraftTitle', member))
                    .setColor('Green')
                    .setDescription(t('unifiedRegistrationDraftDescription', member).replace('{displayName}', member.displayName).replace('{draftName}', activeDraft.name))
                    .addFields({ 
                        name: t('unifiedRegistrationDraftFieldTitle', member),
                        value: t('unifiedRegistrationDraftFieldValue', member)
                    })
                    .setImage('https://i.imgur.com/jw4PnKN.jpeg');

                const button = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(t('goToDraftChannelButton', member))
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${guild.id}/1413906746258362398`)
                );
                await interaction.editReply({ embeds: [embed], components: [button] });

            } else {
                const embed = new EmbedBuilder()
                    .setTitle(t('unifiedRegistrationNoDraftTitle', member))
                    .setColor('Blue')
                    .setDescription(t('unifiedRegistrationNoDraftDescription', member).replace('{displayName}', member.displayName))
                    .setImage('https://i.imgur.com/T7hXuuA.jpeg');

                const button = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(t('goToControlPanelButton', member))
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${guild.id}/1396815232122228827`)
                );
                await interaction.editReply({ embeds: [embed], components: [button] });
            }

        } catch (error) {
            console.error("Error durante el registro unificado:", error);
            await interaction.editReply({ content: t('registrationError', member) });
        } finally {
            if (tournamentDbConnection) await tournamentDbConnection.close();
        }
        return;
    }

    if (customId === 'edit_profile_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const vpgUsername = fields.getTextInputValue('vpgUsernameInput');
        const twitterHandle = fields.getTextInputValue('twitterInput');
        const psnId = fields.getTextInputValue('psnIdInput') || null;
        const eaId = fields.getTextInputValue('eaIdInput') || null;

        const updatedProfile = await VPGUser.findOneAndUpdate(
            { discordId: user.id },
            { vpgUsername, twitterHandle, psnId, eaId },
            { upsert: true, new: true }
        );

        let responseMessage = '✅ ¡Tu perfil ha sido actualizado con éxito!';
        const playerRoleId = process.env.PLAYER_ROLE_ID;

        if (updatedProfile && updatedProfile.primaryPosition && playerRoleId && !member.roles.cache.has(playerRoleId)) {
            try {
                await member.roles.add(playerRoleId);
                responseMessage += '\n\n¡Hemos detectado que no tenías el rol de Jugador y te lo hemos asignado!';
            } catch (error) {
                console.error(`Error al asignar rol de jugador a ${user.tag} tras actualizar perfil:`, error);
                responseMessage += '\n\nHubo un problema al intentar asignarte el rol de Jugador. Por favor, contacta a un administrador.';
            }
        }
        
        const managerRoleId = process.env.MANAGER_ROLE_ID;
        const captainRoleId = process.env.CAPTAIN_ROLE_ID;
        const isManagerOrCaptain = member.roles.cache.has(managerRoleId) || member.roles.cache.has(captainRoleId);

        if (!isManagerOrCaptain) {
            try {
                const playerGuideEmbed = new EmbedBuilder()
                    .setTitle('✅ ¡Perfil Actualizado! Aquí tienes tu Guía de Jugador.')
                    .setColor('Green')
                    .setImage('https://i.imgur.com/7sB0gaa.jpg')
                    .setDescription(`¡Hola, ${member.user.username}! Hemos actualizado tu perfil. Te recordamos las herramientas que tienes a tu disposición como jugador:`)
                    .addFields(
                        { name: '➡️ ¿Ya tienes equipo pero necesitas unirte en Discord?', value: 'Tienes dos formas de hacerlo:\n1. **La más recomendada:** Habla con tu **Mánager o Capitán**. Ellos pueden usar la función `Invitar Jugador` desde su panel para añadirte al instante.\n2. **Si prefieres tomar la iniciativa:** Puedes ir al panel de <#1396815232122228827>, pulsar `Acciones de Jugador` -> `Aplicar a un Equipo`, buscar tu club en la lista y enviarles una solicitud formal.' },
                        { name: '🔎 ¿Buscas un nuevo reto? Guía Completa del Mercado de Fichajes', value: 'El canal <#1402608609724072040> es tu centro de operaciones.\n• **Para anunciarte**: Usa `Anunciarse como Agente Libre`. Si ya tenías un anuncio publicado, **este será reemplazado automáticamente por el nuevo**, nunca tendrás duplicados. Esta acción de publicar/reemplazar tu anuncio solo se puede realizar **una vez cada 3 días**.\n• **Para buscar**: Usa `Buscar Ofertas de Equipo` para ver qué equipos han publicado vacantes y qué perfiles necesitan.\n• **Para administrar tu anuncio**: Usa `Gestionar mi Anuncio` en cualquier momento para **editar** los detalles o **borrarlo** definitivamente si encuentras equipo.'},
                        { name: '⚙️ Herramientas Clave de tu Carrera', value: 'Desde el panel principal de <#1396815232122228827> (`Acciones de Jugador`) tienes control total:\n• **`Actualizar Perfil`**: Es crucial que mantengas tus IDs de juego (PSN, EA) actualizados.\n• **`Abandonar Equipo`**: Si en el futuro decides dejar tu equipo actual, esta opción te dará total independencia para hacerlo.'}
                    );
                
                await member.send({ embeds: [playerGuideEmbed] });
                responseMessage += '\n\nℹ️ Te hemos enviado un recordatorio de tu guía de jugador por MD.';

            } catch (dmError) {
                console.log(`AVISO: No se pudo enviar el MD de recordatorio al jugador ${member.user.tag} (flujo de actualización).`);
            }
        }

        return interaction.editReply({ content: responseMessage });
    }

    // >>> ESTE ES EL NUEVO BLOQUE CORREGIDO <<<
if (customId.startsWith('manager_request_modal_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const leagueName = customId.split('_')[3];
    const vpgUsername = fields.getTextInputValue('vpgUsername');
    const teamName = fields.getTextInputValue('teamName');
    const teamAbbr = fields.getTextInputValue('teamAbbr').toUpperCase();
    const teamTwitter = fields.getTextInputValue('teamTwitterInput');

    const pendingTeam = await new PendingTeam({
        userId: user.id,
        guildId: guild.id,
        leagueName,
        vpgUsername,
        teamName,
        teamAbbr,
        teamTwitter,
    }).save();

    // --- CORRECCIÓN: Ahora usamos el traductor t() ---
    const embed = new EmbedBuilder()
        .setTitle(t('askForLogoTitle', member)) // Texto traducido
        .setDescription(t('askForLogoDescription', member)) // Texto traducido
        .setColor('Green');

    // --- CORRECCIÓN: Ahora usamos el traductor t() para los botones ---
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ask_logo_yes_${pendingTeam._id}`)
            .setLabel(t('addLogoYesButton', member)) // Botón traducido
            .setStyle(ButtonStyle.Success)
            .setEmoji('🖼️'),
        new ButtonBuilder()
            .setCustomId(`ask_logo_no_${pendingTeam._id}`)
            .setLabel(t('addLogoNoButton', member)) // Botón traducido
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️')
    );
    
    await interaction.editReply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

    if (customId.startsWith('final_logo_submit_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const pendingTeamId = customId.split('_')[3];
        
        const pendingTeam = await PendingTeam.findById(pendingTeamId);
        if (!pendingTeam || pendingTeam.userId !== user.id) {
            return interaction.editReply({ content: t('errorRequestExpired', member), components: [] });
        }
        
        const logoUrl = fields.getTextInputValue('teamLogoUrlInput');

        await sendApprovalRequest(interaction, client, { ...pendingTeam.toObject(), logoUrl });
        await PendingTeam.findByIdAndDelete(pendingTeamId);
        
        await interaction.editReply({ content: t('requestSentCustomLogo', member), components: [] });
    }

    // --- ELO: Manejador del modal de edición de ELO ---
    if (customId.startsWith('admin_edit_elo_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[4]; // "admin_edit_elo_modal_ID" -> parts: 0, 1, 2, 3, 4
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });

        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || user.id === process.env.OWNER_DISCORD_ID;
        if (!isAdmin) return interaction.editReply({ content: 'Acción restringida.' });

        const rawElo = fields.getTextInputValue('newElo');
        const newElo = parseInt(rawElo, 10);

        if (isNaN(newElo) || newElo < 0) {
            return interaction.editReply({ content: '❌ El ELO debe ser un número entero válido mayor o igual a 0.' });
        }

        const oldElo = team.elo || 1000;
        
        // Registrar en historial e incidir ELO actual
        const historyEntry = {
            date: new Date(),
            oldElo: oldElo,
            newElo: newElo,
            delta: newElo - oldElo,
            reason: 'manual_admin_edit'
        };

        // En Mongoose o driver nativo 'test', usamos updateOne directo para mantener el esquema mixto
        const testDb = mongoose.connection.client.db('test');
        await testDb.collection('teams').updateOne(
            { _id: team._id },
            { 
                $set: { elo: newElo },
                $push: { eloHistory: { $each: [historyEntry], $slice: -100 } }
            }
        );

        return interaction.editReply({ content: `✅ ELO del equipo **${team.name}** actualizado exitosamente: \`${oldElo} ➡️  ${newElo}\`.` });
    }

    if (customId.startsWith('edit_data_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: t('errorTeamNoLongerExists', member) });

        const isManager = team.managerId === user.id;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isManager && !isAdmin) return interaction.editReply({ content: t('errorNoPermission', member) });

        const oldData = {
            name: team.name,
            abbreviation: team.abbreviation,
            logoUrl: team.logoUrl,
            twitterHandle: team.twitterHandle
        };

        const newName = fields.getTextInputValue('newName') || oldData.name;
        const newAbbr = fields.getTextInputValue('newAbbr')?.toUpperCase() || oldData.abbreviation;
        const newLogo = fields.getTextInputValue('newLogo') || oldData.logoUrl;
        const newTwitter = fields.getTextInputValue('newTwitter') || oldData.twitterHandle;

        team.name = newName;
        team.abbreviation = newAbbr;
        team.logoUrl = newLogo;
        team.twitterHandle = newTwitter;
        await team.save();

        if (isManager && !isAdmin) {
            try {
                const logChannelId = process.env.APPROVAL_CHANNEL_ID;
                if (logChannelId) {
                    const logChannel = await client.channels.fetch(logChannelId);
                    
                    const changes = [];
                    const noneText = t('logValueNone', member);
                    if (oldData.name !== newName) changes.push(`**${t('logFieldName', member)}:** \`\`\`diff\n- ${oldData.name}\n+ ${newName}\`\`\``);
                    if (oldData.abbreviation !== newAbbr) changes.push(`**${t('logFieldAbbreviation', member)}:** \`\`\`diff\n- ${oldData.abbreviation}\n+ ${newAbbr}\`\`\``);
                    if (oldData.logoUrl !== newLogo) changes.push(`**${t('logFieldLogo', member)}:** ${t('logFieldLogoChanged', member)}`);
                    if ((oldData.twitterHandle || '') !== (newTwitter || '')) changes.push(`**${t('logFieldTwitter', member)}:** \`\`\`diff\n- ${oldData.twitterHandle || noneText}\n+ ${newTwitter || noneText}\`\`\``);

                    if (changes.length > 0) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle(t('logTeamDataEditedTitle', member).replace('{teamName}', team.name))
                            .setColor('Blue')
                            .setAuthor({ name: t('logActionMadeBy', member).replace('{userTag}', user.tag), iconURL: user.displayAvatarURL() })
                            .setDescription(`${t('logManagerUpdatedFollowing', member)}\n\n${changes.join('\n')}`)
                            .setThumbnail(newLogo && newLogo.startsWith('http') ? newLogo : null)
                            .setFooter({ text: `ID del Equipo: ${team._id}` })
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }
            } catch (error) {
                console.error("Error al enviar la notificación de cambio de datos:", error);
            }
        }
        return interaction.editReply({ content: `✅ Los datos del equipo **${team.name}** han sido actualizados.` });
    }

    if (customId === 'market_agent_modal' || customId.startsWith('market_agent_modal_edit')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const isEditing = customId.startsWith('market_agent_modal_edit');
    
    const existingAd = await FreeAgent.findOne({ userId: user.id });
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    if (existingAd && existingAd.updatedAt > threeDaysAgo && !isEditing) {
        return interaction.editReply({ content: t('errorAdRateLimit', member) });
    }
    
    const experience = fields.getTextInputValue('experienceInput');
    const seeking = fields.getTextInputValue('seekingInput');
    const availability = fields.getTextInputValue('availabilityInput');

    const channelId = process.env.PLAYERS_AD_CHANNEL_ID;
    if (!channelId) return interaction.editReply({ content: t('errorPlayerAdChannelNotSet', member) });
    
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.editReply({ content: t('errorPlayerAdChannelNotFound', member) });

    const profile = await VPGUser.findOne({ discordId: user.id }).lean();
    if (!profile || !profile.primaryPosition) {
        return interaction.editReply({ content: t('errorProfileIncomplete', member) });
    }
    
    const playerAdEmbed = new EmbedBuilder()
        .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL())
        .setTitle(t('playerAdEmbedTitle', member).replace('{displayName}', member.displayName))
        .setColor('Blue')
        .addFields(
            { name: t('playerAdFieldPositions', member), value: `**${profile.primaryPosition}** / ${profile.secondaryPosition || 'N/A'}`, inline: true },
            { name: t('playerAdFieldGameIds', member), value: `PSN: ${profile.psnId || 'N/A'}\nEA ID: ${profile.eaId || 'N/A'}`, inline: false },
            { name: t('playerAdFieldExperience', member), value: experience, inline: false },
            { name: t('playerAdFieldSeeking', member), value: seeking, inline: false },
            { name: t('playerAdFieldAvailability', member), value: availability, inline: false }
        )
        .setTimestamp();
    
    let messageId;
    let responseMessageKey;
    
    const messagePayload = {
        content: `**${t('playerAdContact', member)}** <@${user.id}>`,
        embeds: [playerAdEmbed]
    };

    if (isEditing && existingAd && existingAd.messageId) {
        try {
            const adMessage = await channel.messages.fetch(existingAd.messageId);
            await adMessage.edit(messagePayload);
            messageId = existingAd.messageId;
            responseMessageKey = 'adUpdatedSuccess';
        } catch (error) {
            const newMessage = await channel.send(messagePayload);
            messageId = newMessage.id;
            responseMessageKey = 'adNotFoundRepublished';
        }
    } else {
        if (existingAd && existingAd.messageId) {
            try { await channel.messages.delete(existingAd.messageId); } catch(e) {}
        }
        const newMessage = await channel.send(messagePayload);
        messageId = newMessage.id;
        responseMessageKey = 'adPublishedSuccess';
    }

    await FreeAgent.findOneAndUpdate(
        { userId: user.id }, 
        { guildId: guild.id, experience, seeking, availability, status: 'ACTIVE', messageId }, 
        { upsert: true, new: true }
    );

    const finalMessage = t('adPublishedInChannel', member)
        .replace('{message}', t(responseMessageKey, member))
        .replace('{channel}', channel.toString());

    return interaction.editReply({ content: finalMessage });
}
    if (customId.startsWith('offer_add_requirements_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = customId.split('_');
        const teamId = parts[3];
        const positions = parts[4].split('-');
        const requirements = fields.getTextInputValue('requirementsInput');

        const channelId = process.env.TEAMS_AD_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: '❌ Error: El canal de ofertas de equipos no está configurado.' });

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: '❌ Error: No se pudo encontrar el canal de ofertas de equipos.' });

        const team = await Team.findById(teamId).lean();
        if (!team.logoUrl) {
            return interaction.editReply({ content: '❌ Error: Tu equipo necesita tener un logo configurado para poder publicar.' });
        }

        const teamOfferEmbed = new EmbedBuilder()
            .setAuthor({ name: `${team.name} busca fichajes`, iconURL: team.logoUrl })
            .setColor('#2ECC71')
            .setThumbnail(team.logoUrl)
            .addFields(
                { name: '📄 Posiciones Vacantes', value: `\`\`\`${positions.join(' | ')}\`\`\`` },
                { name: '📋 Requisitos', value: `> ${requirements.replace(/\n/g, '\n> ')}` },
                { name: '🏆 Liga', value: team.league, inline: true },
                { name: '🐦 Twitter', value: team.twitterHandle ? `[@${team.twitterHandle}](https://twitter.com/${team.twitterHandle})` : 'No especificado', inline: true }
            )
            .setTimestamp();

        const existingOffer = await TeamOffer.findOne({ teamId: teamId });
        let offerMessage;
        let statusKey;

        const messagePayload = {
            content: `**Contacto:** <@${team.managerId}>`,
            embeds: [teamOfferEmbed]
        };
            
        if (existingOffer && existingOffer.messageId) {
            try {
                const oldMessage = await channel.messages.fetch(existingOffer.messageId);
                offerMessage = await oldMessage.edit(messagePayload);
                statusKey = 'offerStatusUpdated';
            } catch (error) {
                offerMessage = await channel.send(messagePayload);
                statusKey = 'offerStatusRepublished';
            }
        } else {
            offerMessage = await channel.send(messagePayload);
            statusKey = 'offerStatusPublished';
        }
        
        await TeamOffer.findOneAndUpdate(
            { teamId: teamId },
            { guildId: guild.id, postedById: user.id, positions, requirements, messageId: offerMessage.id, status: 'ACTIVE' },
            { upsert: true, new: true }
        );

        const statusText = t(statusKey, member);
        const successMessage = t('offerPublishedSuccess', member)
            .replace('{status}', statusText)
            .replace('{channel}', channel.toString());

        return interaction.editReply({ content: successMessage });
    }
   
    if (customId === 'create_league_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const leagueName = fields.getTextInputValue('leagueNameInput');
        const existingLeague = await League.findOne({ name: leagueName, guildId: guild.id });
        if (existingLeague) return interaction.editReply({ content: `La liga **${leagueName}** ya existe.` });
        await new League({ name: leagueName, guildId: guild.id }).save();
        return interaction.editReply({ content: `✅ La liga **${leagueName}** ha sido creada.` });
    }

    if (customId.startsWith('confirm_dissolve_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });
        const confirmationText = fields.getTextInputValue('confirmation_text');
        if (confirmationText !== team.name) return interaction.editReply({ content: `❌ Confirmación incorrecta. Disolución cancelada.` });
        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        for (const memberId of memberIds) {
            try {
                const member = await guild.members.fetch(memberId);
                if (member) {
                    await member.roles.remove([process.env.MANAGER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                    if (member.id !== guild.ownerId) await member.setNickname(member.user.username).catch(() => {});
                    await member.send(`El equipo **${team.name}** ha sido disuelto.`).catch(() => {});
                }
            } catch (error) { /* Ignorar */ }
        }
        await Team.deleteOne({ _id: teamId });
        await PlayerApplication.deleteMany({ teamId: teamId });
        await VPGUser.updateMany({ teamName: team.name }, { $set: { teamName: null, teamLogoUrl: null, isManager: false } });
        return interaction.editReply({ content: `✅ El equipo **${team.name}** ha sido disuelto.` });
    }
    
    if (customId.startsWith('application_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[2];
        const team = await Team.findById(teamId);
        if(!team || !team.recruitmentOpen) return interaction.editReply({ content: 'Este equipo ya no existe o ha cerrado su reclutamiento.' });
        const manager = await client.users.fetch(team.managerId).catch(()=>null);
        if(!manager) return interaction.editReply({ content: 'No se pudo encontrar al mánager.' });
        const presentation = fields.getTextInputValue('presentation');
        const application = await PlayerApplication.create({ userId: user.id, teamId: teamId, presentation: presentation });
        
        const embed = new EmbedBuilder().setTitle(`✉️ New Application / Nueva Solicitud for ${team.name}`).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).setDescription(presentation).setColor('Blue');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`accept_application_${application._id}`).setLabel('Accept / Aceptar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_application_${application._id}`).setLabel('Decline / Rechazar').setStyle(ButtonStyle.Danger));
        
        try {
            await manager.send({ embeds: [embed], components: [row] });
            const successMessage = t('applicationSentSuccess', member).replace('{teamName}', team.name);
            return interaction.editReply({ content: successMessage });
        } catch (error) {
            await PlayerApplication.findByIdAndDelete(application._id);
            return interaction.editReply({ content: t('applicationSentFailManagerDMsClosed', member) });
        }
    }
};
