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

// Resuelve posición combinando pos (categoría EA) + archetypeid (clase)
function resolvePos(posRaw, archetypeid) {
    const POS_MAP_INLINE = {
        0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
        6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
        11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC'
    };
    if (!isNaN(posRaw) && POS_MAP_INLINE[posRaw] !== undefined) return POS_MAP_INLINE[posRaw];
    const p = String(posRaw || '').toLowerCase();
    if (p === 'goalkeeper') return 'POR';
    if (p === 'forward' || p === 'attacker' || p === 'striker') return 'DC';
    if (p === 'defender' || p === 'centerback') return 'DFC';
    if (p === 'midfielder') {
        if (archetypeid == 10 || archetypeid == 12) return 'MI'; // Chispa/Killer → Carrilero
        return 'MC';
    }
    return POS_MAP_INLINE[posRaw] || posRaw || '???';
}

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

    if (customId.startsWith('scout_player_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        
        if (!team) return interaction.editReply({ content: 'El equipo VPG ya no existe.' });
        if (!team.eaClubId) return interaction.editReply({ content: '❌ Este equipo no tiene un Club de EA vinculado.' });

        const playerNameQuery = fields.getTextInputValue('player_name').trim();

        try {
            const playerColl = mongoose.connection.client.db('test').collection('player_profiles');
            
            // Buscar al jugador por coincidencia (case insensitive)
            const player = await playerColl.findOne({
                eaPlayerName: { $regex: new RegExp(playerNameQuery, 'i') }
            });

            if (!player || !player.stats) {
                return interaction.editReply({ content: `❌ No se ha encontrado a ningún jugador en nuestra base de datos local que contenga "${playerNameQuery}". Es posible que aún no haya jugado ningún partido competitivo escaneado por el bot.` });
            }

            const pName = player.eaPlayerName || playerNameQuery;
            const stats = player.stats;
            
            const passesMade = stats.passesMade || 0;
            const passAttempts = stats.passesAttempted || passesMade;
            const passPercentage = passAttempts > 0 ? Math.round((passesMade / passAttempts) * 100) : 0;

            const tacklesMade = stats.tacklesMade || 0;
            const tackleAttempts = stats.tacklesAttempted || tacklesMade;
            const tacklePercentage = tackleAttempts > 0 ? Math.round((tacklesMade / tackleAttempts) * 100) : 0;
            
            let ratingAvg = 0;
            if (stats.ratings && stats.ratings.length > 0) {
                ratingAvg = (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length).toFixed(1);
            }

            const embed = new EmbedBuilder()
                .setTitle(`Reporte de Scout: ${pName}`)
                .setColor('Gold')
                .setThumbnail(`https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${team.eaClubId}.png`)
                .setDescription(`Estadísticas extraídas de nuestra **Base de Datos Local**. Muestra el historial completo de partidos oficiales escaneados para este jugador.`)
                .addFields(
                    { name: 'Partidos Jugados', value: `🏟️ ${stats.matchesPlayed || 0}`, inline: true },
                    { name: 'Valoración Media', value: `⭐ ${ratingAvg}`, inline: true },
                    { name: 'Hombre del Partido', value: `🏅 ${stats.mom || 0}`, inline: true },
                    { name: 'Goles Totales', value: `⚽ ${stats.goals || 0}`, inline: true },
                    { name: 'Asistencias', value: `👟 ${stats.assists || 0}`, inline: true },
                    { name: 'Último Equipo', value: `🛡️ ${player.lastClub || 'Desconocido'}`, inline: true },
                    { name: 'Pases Completados', value: `🔄 ${passesMade} / ${passAttempts} (${passPercentage}%)`, inline: true },
                    { name: 'Entradas con Éxito', value: `🛡️ ${tacklesMade} / ${tackleAttempts} (${tacklePercentage}%)`, inline: true },
                    { name: 'Tarjetas Rojas', value: `🟥 ${stats.redCards || 0}`, inline: true }
                )
                .setFooter({ text: 'VPG EA Sports Scout System (Local DB)' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error en scout player:', error);
            return interaction.editReply({ content: '❌ Ha ocurrido un error interno al buscar las estadísticas.' });
        }
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
        
        const logoUrl = fields.getTextInputValue('teamLogoUrlInput').trim();

        // Validar que la URL sea una imagen accesible
        let isValid = false;
        try {
            if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) throw new Error('No es URL');
            const response = await fetch(logoUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            const contentType = response.headers.get('content-type') || '';
            isValid = response.ok && contentType.startsWith('image/');
        } catch (e) {
            isValid = false;
        }

        if (!isValid) {
            const retryRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ask_logo_yes_${pendingTeamId}`)
                    .setLabel('Intentar de nuevo')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId(`ask_logo_no_${pendingTeamId}`)
                    .setLabel('Usar logo por defecto')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🛡️')
            );

            return interaction.editReply({
                content: '❌ **La URL que has pegado no es válida o no es una imagen.**\n\n' +
                    '📌 **¿Cómo obtener la URL correcta?**\n' +
                    '1. Sube tu logo a un servicio como [Imgur](https://imgur.com/) o [Postimages](https://postimages.org/)\n' +
                    '2. Haz **click derecho** sobre la imagen subida\n' +
                    '3. Selecciona **"Copiar dirección de imagen"** (o "Copy image address")\n' +
                    '4. La URL debe terminar en `.png`, `.jpg`, `.gif` o similar\n\n' +
                    '⚠️ No pegues el enlace de la página, sino el **enlace directo de la imagen**.',
                components: [retryRow]
            });
        }

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
        const newLogoRaw = fields.getTextInputValue('newLogo')?.trim();
        const newTwitter = fields.getTextInputValue('newTwitter') || oldData.twitterHandle;

        // Si puso una URL nueva de logo, validarla
        let newLogo = oldData.logoUrl;
        if (newLogoRaw && newLogoRaw !== oldData.logoUrl) {
            let isValid = false;
            try {
                if (!newLogoRaw.startsWith('http://') && !newLogoRaw.startsWith('https://')) throw new Error('No es URL');
                const response = await fetch(newLogoRaw, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
                const contentType = response.headers.get('content-type') || '';
                isValid = response.ok && contentType.startsWith('image/');
            } catch (e) {
                isValid = false;
            }

            if (!isValid) {
                return interaction.editReply({
                    content: '❌ **La URL del logo no es válida o no es una imagen.**\n\n' +
                        'El resto de datos NO se han guardado. Vuelve a intentarlo con una URL correcta.\n\n' +
                        '📌 **¿Cómo obtener la URL correcta?**\n' +
                        '1. Sube tu logo a [Imgur](https://imgur.com/) o [Postimages](https://postimages.org/)\n' +
                        '2. Haz **click derecho** sobre la imagen subida\n' +
                        '3. Selecciona **"Copiar dirección de imagen"**\n' +
                        '4. La URL debe terminar en `.png`, `.jpg`, `.gif` o similar'
                });
            }
            newLogo = newLogoRaw;
        }

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

    if (customId.startsWith('link_ea_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });

        const eaClubName = fields.getTextInputValue('ea_club_name');
        const rawPlatform = fields.getTextInputValue('ea_platform').toLowerCase();
        
        // Traducir lenguaje humano al código técnico de la API de EA
        let eaPlatform = 'common-gen5'; // Por defecto Nueva Generación (PS5/PC/SeriesX)
        if (rawPlatform.includes('antigua') || rawPlatform.includes('ps4') || rawPlatform.includes('old') || rawPlatform.includes('xbox one')) {
            eaPlatform = 'common-gen4';
        }

        try {
            const eaRes = await fetch(`https://proclubs.ea.com/api/fc/allTimeLeaderboard/search?clubName=${encodeURIComponent(eaClubName)}&platform=${eaPlatform}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Origin': 'https://www.ea.com',
                    'Referer': 'https://www.ea.com/'
                }
            });

            if (eaRes.status === 404) {
                return interaction.editReply({ content: '❌ EA Sports no encontró ningún club con ese nombre en esta plataforma (Error 404). Por favor, asegúrate de escribir el nombre **exacto**.' });
            }

            if (!eaRes.ok) {
                return interaction.editReply({ content: `❌ Error al contactar con los servidores de EA Sports (Código: ${eaRes.status}). La API de EA puede estar caída temporalmente.` });
            }

            const data = await eaRes.json();
            
            if (!data || Object.keys(data).length === 0) {
                return interaction.editReply({ content: '❌ No se encontraron clubes con ese nombre en esa plataforma. Asegúrate de escribir el nombre exacto.' });
            }

            // EA API allTimeLeaderboard returns an array of objects
            const clubs = Array.isArray(data) ? data : Object.values(data);
            const options = clubs.slice(0, 25).map(c => {
                const name = c.clubName || (c.clubInfo && c.clubInfo.name) || c.name || 'Club Desconocido';
                const safeName = name.substring(0, 50).replace(/\|/g, ''); // max 50 chars para asegurar que quepa en el value
                return {
                    label: name.substring(0, 100),
                    description: `ID: ${c.clubId} | Plataforma: ${eaPlatform}`,
                    value: `${c.clubId}|${eaPlatform}|${safeName}`
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`link_ea_select_${teamId}`)
                .setPlaceholder('Selecciona tu club de EA FC...')
                .addOptions(options);

            return interaction.editReply({
                content: `🔍 **Búsqueda completada.** Se encontraron varios clubes. Por favor, selecciona el tuyo de la lista a continuación:\n\n*Nota: Al seleccionar el club, tu equipo de VPG quedará vinculado automáticamente para la recolección de estadísticas.*`,
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });

        } catch (error) {
            console.error('Error al buscar club de EA:', error);
            return interaction.editReply({ content: '❌ Hubo un problema al buscar en los servidores de EA. Inténtalo de nuevo más tarde.' });
        }
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
    if (customId === 'admin_search_team_modal') {
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });

        const query = fields.getTextInputValue('teamSearchQuery').trim().toLowerCase();
        
        await interaction.deferReply({ ephemeral: true });
        
        const teams = await Team.find({ 
            guildId: interaction.guildId,
            name: { $regex: query, $options: 'i' }
        }).sort({ name: 1 }).lean();

        if (teams.length === 0) {
            return interaction.editReply({ content: `No se encontró ningún equipo que contenga "${query}".` });
        }

        const { sendPaginatedTeamMenu } = require('./buttonHandler.js');
        await sendPaginatedTeamMenu(interaction, teams, 'admin_select_team_to_manage', 'manage', 0, `Equipos encontrados para "${query}":`);
        return;
    }

    if (customId === 'admin_crawler_time_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const startRaw = fields.getTextInputValue('crawler_time_start').trim().toLowerCase();
        const endRaw = fields.getTextInputValue('crawler_time_end').trim().toLowerCase();

        // Permitir desactivar con "off" o "null"
        if (startRaw === 'off' || startRaw === 'null' || startRaw === 'no') {
            const settingsColl = mongoose.connection.client.db('test').collection('bot_settings');
            await settingsColl.updateOne({ _id: 'global_config' }, { $set: { crawlerTimeRange: null } });
            return interaction.editReply({ content: '✅ Filtro horario **desactivado**. El crawler guardará partidos de cualquier hora.' });
        }

        // Validar formato HH:MM
        const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startRaw) || !timeRegex.test(endRaw)) {
            return interaction.editReply({ content: '❌ Formato incorrecto. Usa **HH:MM** (ej: `21:30`). Para desactivar, escribe `off` en la hora de inicio.' });
        }

        const settingsColl = mongoose.connection.client.db('test').collection('bot_settings');
        await settingsColl.updateOne({ _id: 'global_config' }, { $set: { crawlerTimeRange: { start: startRaw, end: endRaw } } });

        return interaction.editReply({ content: `✅ Franja horaria del crawler actualizada: **${startRaw} — ${endRaw}** (hora Madrid).\\n\\nSolo se guardarán partidos que terminen dentro de este rango. Para desactivar, escribe \`off\`.` });
    }

    if (customId === 'stats_debug_ea_modal') {
        const playerName = fields.getTextInputValue('player_name').trim();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const { getDb } = await import('../../../database.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        const safeQuery = playerName.toLowerCase();
        const recentMatches = await db.collection('scanned_matches').find({}).sort({ timestamp: -1 }).limit(300).toArray();

        const found = [];
        for (const match of recentMatches) {
            if (!match.players) continue;
            for (const clubId in match.players) {
                for (const pId in match.players[clubId]) {
                    const p = match.players[clubId][pId];
                    if (p.playername && p.playername.toLowerCase().includes(safeQuery)) {
                        const matchDate = new Date(parseInt(match.timestamp) * 1000);
                        const madridTime = matchDate.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                        const mappedPos = resolvePos(p.pos, p.archetypeid);
                        found.push({
                            name: p.playername,
                            pos: p.pos,
                            mappedPos,
                            archetypeid: p.archetypeid ?? '—',
                            rating: p.rating || '—',
                            goals: p.goals || 0,
                            assists: p.assists || 0,
                            date: madridTime,
                            matchId: match.matchId,
                            clubName: match.clubs?.[clubId]?.details?.name || clubId
                        });
                    }
                }
            }
            if (found.length >= 5) break;
        }

        if (found.length === 0) {
            return interaction.editReply({ content: `🔬 No se encontró ningún jugador con **"${playerName}"** en los últimos 300 partidos escaneados.` });
        }

        let output = `🔬 **Debug EA — ${found[0].name}**\n\`\`\`\n`;
        output += `${'Fecha'.padEnd(12)} ${'pos'.padEnd(4)} ${'Mapeado'.padEnd(8)} ${'Archetype'.padEnd(10)} ${'Rating'.padEnd(7)} ${'G'.padEnd(3)} ${'A'.padEnd(3)} Club\n`;
        output += `${'─'.repeat(70)}\n`;
        for (const f of found) {
            output += `${f.date.padEnd(12)} ${String(f.pos).padEnd(4)} ${f.mappedPos.padEnd(8)} ${String(f.archetypeid).padEnd(10)} ${String(f.rating).padEnd(7)} ${String(f.goals).padEnd(3)} ${String(f.assists).padEnd(3)} ${f.clubName}\n`;
        }
        output += `\`\`\`\n`;
        output += `**Leyenda:** \`pos\` = ID de posición EA → \`Mapeado\` = resultado de POS_MAP\n`;
        output += `Si \`pos\` es **12** → mapea a **MI** (nuestro cambio para carrileros)`;

        return interaction.editReply({ content: output });
    }

    if (customId === 'stats_player_scout_modal') {
        const playerName = fields.getTextInputValue('player_name').trim();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { getDb } = await import('../../../database.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        // Escapar caracteres especiales de regex
        const safeQuery = playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Búsqueda parcial: primero exacta, luego parcial
        let profile = await db.collection('player_profiles').findOne({ eaPlayerName: new RegExp(`^${safeQuery}$`, 'i') });
        
        if (!profile) {
            // Búsqueda parcial — puede devolver varios
            const results = await db.collection('player_profiles').find({
                eaPlayerName: new RegExp(safeQuery, 'i')
            }).limit(10).toArray();

            if (results.length === 0) {
                return interaction.editReply({ content: `No se encontró ningún jugador que contenga **"${playerName}"**.\n💡 Prueba con otra parte del nombre.` });
            }
            if (results.length === 1) {
                profile = results[0];
            } else {
                // Múltiples resultados — mostrar lista
                let list = results.map((p, i) => {
                    const s = p.stats || {};
                    const m = s.matchesPlayed || 0;
                    let avgR = '—';
                    if (s.ratings && s.ratings.length > 0) avgR = (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1);
                    return `**${i + 1}.** \`${p.eaPlayerName}\` — ${p.lastPosition || '?'} | ${p.lastClub || '?'} | ${m}P | ⭐${avgR} | ⚽${s.goals || 0}`;
                }).join('\n');
                
                return interaction.editReply({ content: `🔍 Se encontraron **${results.length}** jugadores con **"${playerName}"**. Escribe el nombre más completo:\n\n${list}` });
            }
        }
        
        const s = profile.stats || {};
        const m = s.matchesPlayed || 0;
        if (m === 0) return interaction.editReply({ content: `El jugador **${profile.eaPlayerName}** no tiene partidos registrados aún.` });
        
        const goals = s.goals || 0, assists = s.assists || 0, shots = s.shots || 0, shotsOT = s.shotsOnTarget || 0;
        const passesMade = s.passesMade || 0, passesAtt = s.passesAttempted || 0;
        const tacklesMade = s.tacklesMade || 0, tacklesAtt = s.tacklesAttempted || 0;
        const intercepts = s.interceptions || 0, saves = s.saves || 0, mom = s.mom || 0;
        const redCards = s.redCards || 0, yellowCards = s.yellowCards || 0;
        const cleanSheets = s.cleanSheets || 0, goalsConceded = s.goalsConceded || 0;
        
        const passAcc = passesAtt > 0 ? ((passesMade / passesAtt) * 100).toFixed(1) : '—';
        const tackleAcc = tacklesAtt > 0 ? ((tacklesMade / tacklesAtt) * 100).toFixed(1) : '—';
        const shotAcc = shots > 0 ? ((shotsOT / shots) * 100).toFixed(1) : '—';
        const gpg = (goals / m).toFixed(2), apg = (assists / m).toFixed(2);
        const spg = (shots / m).toFixed(1), passPerGame = (passesMade / m).toFixed(1);
        
        let avgRating = '—';
        if (s.ratings && s.ratings.length > 0) avgRating = (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1);
        
        // Traducir posiciones de texto EA que quedaron sin normalizar en perfiles antiguos
        const POS_TRANSLATE = { 'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC', 'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD', 'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC', 'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC', 'striker': 'DC', 'winger': 'ED' };
        const rawPos = profile.lastPosition || '???';
        const pos = POS_TRANSLATE[rawPos.toLowerCase()] || rawPos;
        const isGK = pos === 'POR';
        
        const embed = new EmbedBuilder()
            .setTitle(`🔍 Informe de Scout: ${profile.eaPlayerName}`)
            .setDescription(`📋 **Equipo:** ${profile.lastClub || 'Desconocido'}\n🎽 **Posición:** ${pos}\n📅 **Última actividad:** ${profile.lastActive ? new Date(profile.lastActive).toLocaleDateString('es-ES') : '—'}`)
            .setColor('#2ecc71')
            .addFields(
                { name: '🏟️ Partidos', value: `**${m}**`, inline: true },
                { name: '⭐ Nota Media', value: `**${avgRating}**`, inline: true },
                { name: '🏆 MVP', value: `**${mom}**`, inline: true },
                { name: '\u200B', value: '**⚽ ATAQUE**', inline: false },
                { name: 'Goles', value: `${goals} (${gpg}/P)`, inline: true },
                { name: 'Asistencias', value: `${assists} (${apg}/P)`, inline: true },
                { name: 'Contribución Gol', value: `${goals + assists} (${((goals + assists) / m).toFixed(2)}/P)`, inline: true },
                { name: 'Tiros', value: `${shots} (${spg}/P)`, inline: true },
                { name: 'Tiros/Gol', value: goals > 0 ? `${(shots / goals).toFixed(1)}` : '—', inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '\u200B', value: '**👟 PASE**', inline: false },
                { name: 'Precisión', value: passAcc !== '—' ? `${passAcc}%` : '—', inline: true },
                { name: 'Pases Completos', value: passesAtt > 0 ? `${passesMade}/${passesAtt}` : `${passesMade}`, inline: true },
                { name: 'Pases/Partido', value: `${passPerGame}`, inline: true },
                { name: '\u200B', value: '**🛡️ DEFENSA**', inline: false },
                { name: 'Eficacia Entradas', value: tackleAcc !== '—' ? `${tackleAcc}%` : '—', inline: true },
                { name: 'Entradas', value: tacklesAtt > 0 ? `${tacklesMade}/${tacklesAtt}` : `${tacklesMade}`, inline: true },
                { name: 'Intercepciones', value: `${intercepts}`, inline: true }
            );
        
        if (isGK) {
            const savesPerGame = (saves / m).toFixed(1);
            const concededPerGame = (goalsConceded / m).toFixed(1);
            const saveRate = (saves + goalsConceded) > 0 ? (((saves / (saves + goalsConceded)) * 100).toFixed(1)) : '—';
            embed.addFields(
                { name: '\u200B', value: '**🧤 PORTERO**', inline: false },
                { name: 'Paradas', value: `${saves} (${savesPerGame}/P)`, inline: true },
                { name: '% Paradas', value: `${saveRate}%`, inline: true },
                { name: 'Porterías a 0', value: `${cleanSheets}`, inline: true },
                { name: 'Goles Encajados', value: `${goalsConceded} (${concededPerGame}/P)`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '\u200B', value: '\u200B', inline: true }
            );
        }
        
        embed.addFields(
            { name: '\u200B', value: '**📊 DISCIPLINA**', inline: false },
            { name: '🟨 Amarillas', value: `${yellowCards}`, inline: true },
            { name: '🟥 Rojas', value: `${redCards}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true }
        );
            
        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'stats_team_scout_modal') {
        const teamName = fields.getTextInputValue('team_name').trim();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { getDb } = await import('../../../database.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        const safeQuery = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let club = null;
        let vpgTeamName = null;
        let vpgLogo = null;

        // 1. Buscar primero en equipos VPG (Discord) por nombre parcial
        const vpgTeams = await Team.find({ name: new RegExp(safeQuery, 'i'), eaClubId: { $ne: null } }).lean();
        
        if (vpgTeams.length === 1) {
            club = await db.collection('club_profiles').findOne({ eaClubId: vpgTeams[0].eaClubId });
            vpgTeamName = vpgTeams[0].name;
            vpgLogo = vpgTeams[0].logoUrl;
        } else if (vpgTeams.length > 1) {
            const list = vpgTeams.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.name} (${t.abbreviation}) — Liga: ${t.league}`).join('\n');
            return interaction.editReply({ content: `🔍 Se encontraron **${vpgTeams.length}** equipos. Escribe el nombre más completo:\n\n${list}` });
        }

        // 2. Fallback: buscar en club_profiles por nombre EA
        if (!club) {
            club = await db.collection('club_profiles').findOne({ eaClubName: new RegExp(`^${safeQuery}$`, 'i') });
            if (!club) club = await db.collection('club_profiles').findOne({ eaClubName: new RegExp(safeQuery, 'i') });
        }

        if (!club) {
            // 3. Último intento: VPG team sin EA vinculado
            const anyVpg = await Team.find({ name: new RegExp(safeQuery, 'i') }).lean();
            if (anyVpg.length > 0) {
                const list = anyVpg.slice(0, 5).map(t => `• **${t.name}** — ${t.eaClubId ? '✅ EA vinculado' : '❌ Sin EA vinculado'}`).join('\n');
                return interaction.editReply({ content: `Se encontraron equipos en Discord pero sin datos de EA:\n\n${list}\n\n💡 Los equipos necesitan vincular su club de EA para tener estadísticas.` });
            }
            return interaction.editReply({ content: `No se encontró ningún equipo con **"${teamName}"**.` });
        }
        
        const s = club.stats || {};
        const m = s.matchesPlayed || 0;
        if (m === 0) return interaction.editReply({ content: `El equipo **${club.eaClubName}** no tiene partidos registrados aún.` });
        
        const wins = s.wins || 0, ties = s.ties || 0, losses = s.losses || 0;
        const goals = s.goals || 0, goalsAgainst = s.goalsAgainst || 0;
        const shots = s.shots || 0;
        const passesMade = s.passesMade || 0, passesAtt = s.passesAttempted || 0;
        const tacklesMade = s.tacklesMade || 0, tacklesAtt = s.tacklesAttempted || 0;
        
        const winrate = ((wins / m) * 100).toFixed(1);
        const gpg = (goals / m).toFixed(1), gapg = (goalsAgainst / m).toFixed(1);
        const passAcc = passesAtt > 0 ? ((passesMade / passesAtt) * 100).toFixed(1) : '—';
        const tackleAcc = tacklesAtt > 0 ? ((tacklesMade / tacklesAtt) * 100).toFixed(1) : '—';
        
        // Buscar última alineación ORDENADA
        const POS_MAP = {
            0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
            6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
            11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC',
            'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
            'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
            'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
            'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC',
            'striker': 'DC', 'winger': 'ED', 'wing': 'ED'
        };
        const POS_ORDER = { 'POR': 0, 'DFC': 1, 'LD': 2, 'LI': 3, 'CAD': 4, 'CAI': 5, 'MCD': 6, 'MC': 7, 'MCO': 8, 'MD': 9, 'MI': 10, 'ED': 11, 'EI': 12, 'MP': 13, 'DC': 14 };

        let lineupStr = 'Sin datos de alineación';
        const lastMatch = await db.collection('scanned_matches').find({
            [`clubs.${club.eaClubId}`]: { $exists: true }
        }).sort({ timestamp: -1 }).limit(1).toArray();
        
        if (lastMatch.length > 0 && lastMatch[0].players && lastMatch[0].players[club.eaClubId]) {
            const players = Object.values(lastMatch[0].players[club.eaClubId]);
            const sorted = players.map(p => {
                const pos = resolvePos(p.pos, p.archetypeid);
                return { pos, name: p.playername, order: POS_ORDER[pos] ?? 99 };
            }).sort((a, b) => a.order - b.order);
            lineupStr = sorted.map(p => `**${p.pos}** ${p.name}`).join(' | ');
        }
        
        const displayName = vpgTeamName ? `${vpgTeamName} (${club.eaClubName})` : club.eaClubName;
        const embed = new EmbedBuilder()
            .setTitle(`🛡️ Análisis Táctico: ${displayName}`)
            .setDescription(`📅 **Última actividad:** ${club.lastActive ? new Date(club.lastActive).toLocaleDateString('es-ES') : '—'}`)
            .setColor('#3498db');
        
        if (vpgLogo) embed.setThumbnail(vpgLogo);

        embed.addFields(
                { name: '\u200B', value: '**⚔️ RÉCORD GLOBAL**', inline: false },
                { name: '🏟️ Partidos', value: `**${m}**`, inline: true },
                { name: '📈 Winrate', value: `**${winrate}%**`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '✅ Victorias', value: `${wins}`, inline: true },
                { name: '➖ Empates', value: `${ties}`, inline: true },
                { name: '❌ Derrotas', value: `${losses}`, inline: true },
                { name: '\u200B', value: '**⚽ ATAQUE**', inline: false },
                { name: 'Goles', value: `${goals} (${gpg}/P)`, inline: true },
                { name: 'Tiros', value: `${shots} (${(shots / m).toFixed(1)}/P)`, inline: true },
                { name: 'Tiros/Gol', value: goals > 0 ? `${(shots / goals).toFixed(1)}` : '—', inline: true },
                { name: '\u200B', value: '**👟 POSESIÓN Y PASE**', inline: false },
                { name: 'Precisión Pase', value: passAcc !== '—' ? `${passAcc}%` : '—', inline: true },
                { name: 'Pases/Partido', value: `${(passesMade / m).toFixed(0)}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '\u200B', value: '**🛡️ DEFENSA**', inline: false },
                { name: 'Goles en Contra', value: `${goalsAgainst} (${gapg}/P)`, inline: true },
                { name: 'Eficacia Entradas', value: `${tackleAcc}%`, inline: true },
                { name: 'Diferencia Goles', value: `${goals > goalsAgainst ? '+' : ''}${goals - goalsAgainst}`, inline: true },
                { name: '\u200B', value: '**📋 ÚLTIMA ALINEACIÓN**', inline: false },
                { name: '\u200B', value: lineupStr, inline: false }
            );
            
        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'stats_match_history_modal') {
        const teamName = fields.getTextInputValue('team_name').trim();
        const timeFilterRaw = (fields.getTextInputValue('time_filter') || '').trim();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { getDb } = await import('../../../database.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        // Parsear filtro horario opcional (formato: HH:MM-HH:MM)
        let timeFilter = null;
        if (timeFilterRaw) {
            const timeMatch = timeFilterRaw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
            if (timeMatch) {
                timeFilter = { start: timeMatch[1], end: timeMatch[2] };
            } else {
                return interaction.editReply({ content: '❌ Formato de franja horaria incorrecto. Usa **HH:MM-HH:MM** (ej: `21:00-00:00`). Déjalo vacío para ver todos.' });
            }
        }

        const safeQuery = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let club = null;

        // 1. Buscar en equipos VPG (Discord) primero
        const vpgTeams = await Team.find({ name: new RegExp(safeQuery, 'i'), eaClubId: { $ne: null } }).lean();
        if (vpgTeams.length === 1) {
            club = await db.collection('club_profiles').findOne({ eaClubId: vpgTeams[0].eaClubId });
        } else if (vpgTeams.length > 1) {
            const list = vpgTeams.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.name} (${t.abbreviation}) — Liga: ${t.league}`).join('\n');
            return interaction.editReply({ content: `🔍 Se encontraron **${vpgTeams.length}** equipos. Escribe el nombre más completo:\n\n${list}` });
        }

        // 2. Fallback a club_profiles
        if (!club) {
            club = await db.collection('club_profiles').findOne({ eaClubName: new RegExp(`^${safeQuery}$`, 'i') });
            if (!club) club = await db.collection('club_profiles').findOne({ eaClubName: new RegExp(safeQuery, 'i') });
        }
        if (!club) return interaction.editReply({ content: `No se encontró ningún equipo con **"${teamName}"**.` });
        
        let matches = await db.collection('scanned_matches').find({
            [`clubs.${club.eaClubId}`]: { $exists: true }
        }).sort({ timestamp: -1 }).limit(50).toArray();

        // Aplicar filtro horario si se proporcionó
        if (timeFilter) {
            const [sh, sm] = timeFilter.start.split(':').map(Number);
            const [eh, em] = timeFilter.end.split(':').map(Number);
            const startMin = sh * 60 + sm;
            const endMin = eh * 60 + em;

            matches = matches.filter(match => {
                if (!match.timestamp) return false;
                const matchDate = new Date(parseInt(match.timestamp) * 1000);
                const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                const [h, min] = madridTimeStr.split(':').map(Number);
                const matchMinutes = h * 60 + min;

                if (startMin <= endMin) {
                    return matchMinutes >= startMin && matchMinutes <= endMin;
                } else {
                    return matchMinutes >= startMin || matchMinutes <= endMin;
                }
            });
        }

        matches = matches.slice(0, 10);
        
        if (matches.length === 0) return interaction.editReply({ content: timeFilter ? `No hay partidos guardados para **${club.eaClubName}** en la franja **${timeFilter.start}-${timeFilter.end}** (Madrid).` : `No hay partidos guardados para **${club.eaClubName}**.` });
        
        const POS_MAP = {
            0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
            6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
            11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC',
            'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
            'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
            'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
            'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC',
            'striker': 'DC', 'winger': 'ED', 'wing': 'ED'
        };
        const POS_ORDER = { 'POR': 0, 'DFC': 1, 'LD': 2, 'LI': 3, 'CAD': 4, 'CAI': 5, 'MCD': 6, 'MC': 7, 'MCO': 8, 'MD': 9, 'MI': 10, 'ED': 11, 'EI': 12, 'MP': 13, 'DC': 14 };

        const embeds = [];
        
        for (let i = 0; i < Math.min(matches.length, 5); i++) {
            const match = matches[i];
            const clubIds = Object.keys(match.clubs || {});
            const ourClub = match.clubs[club.eaClubId] || {};
            const opponentId = clubIds.find(id => id !== club.eaClubId);
            const opponentClub = opponentId ? (match.clubs[opponentId] || {}) : {};
            const opponentName = opponentClub.details?.name || opponentId || 'Desconocido';
            
            const ourGoals = parseInt(ourClub.goals || 0);
            const oppGoals = parseInt(opponentClub.goals || 0);
            const matchDateObj = match.timestamp ? new Date(parseInt(match.timestamp) * 1000) : null;
            const matchDate = matchDateObj ? matchDateObj.toLocaleDateString('es-ES') : '?';
            const matchTime = matchDateObj ? matchDateObj.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '';
            
            let resultEmoji = '➖', resultColor = '#95a5a6';
            if (ourGoals > oppGoals) { resultEmoji = '✅'; resultColor = '#2ecc71'; }
            else if (ourGoals < oppGoals) { resultEmoji = '❌'; resultColor = '#e74c3c'; }
            
            // Helper para keys inconsistentes de EA API
            const gv = (obj, ...keys) => { for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; } return 0; };
            
            // Sumar stats de todos los jugadores del equipo
            const sumTeamStats = (players) => {
                let s = { shots: 0, pm: 0, pa: 0, tm: 0, ta: 0, gkSaves: 0 };
                if (!players) return s;
                for (const pid in players) {
                    const p = players[pid];
                    s.shots += gv(p, 'shots');
                    s.pm += gv(p, 'passesMade', 'passesmade', 'passescompleted');
                    s.pa += gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
                    s.tm += gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                    s.ta += gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                    s.gkSaves += gv(p, 'saves');
                }
                return s;
            };
            
            const ourStats = sumTeamStats(match.players?.[club.eaClubId]);
            const oppStats = sumTeamStats(match.players?.[opponentId]);
            
            // Tiros a puerta = goles + paradas del portero rival
            const ourShotsOT = ourGoals + oppStats.gkSaves;
            const oppShotsOT = oppGoals + ourStats.gkSaves;
            const mPassMade = ourStats.pm;
            const mPassAtt = ourStats.pa;
            const mPassAcc = mPassAtt > 0 ? ((mPassMade / mPassAtt) * 100).toFixed(0) : '?';
            const mTackMade = ourStats.tm;
            const mTackAtt = ourStats.ta;
            const mTackAcc = mTackAtt > 0 ? ((mTackMade / mTackAtt) * 100).toFixed(0) : '?';
            
            // Posesión estimada: ratio de pases intentados
            const totalPassAtt = mPassAtt + oppStats.pa;
            const estPoss = totalPassAtt > 0 ? ((mPassAtt / totalPassAtt) * 100).toFixed(0) : '?';
            const estOppPoss = totalPassAtt > 0 ? ((oppStats.pa / totalPassAtt) * 100).toFixed(0) : '?';
            const oppPassAcc = oppStats.pa > 0 ? ((oppStats.pm / oppStats.pa) * 100).toFixed(0) : '?';
            
            // Alineación ORDENADA con stats detalladas
            let lineupStr = '';
            if (match.players && match.players[club.eaClubId]) {
                const players = Object.values(match.players[club.eaClubId]);
                const sorted = players.map(p => {
                    const pos = resolvePos(p.pos, p.archetypeid);
                    const pGoals = parseInt(p.goals || 0);
                    const pAssists = parseInt(p.assists || 0);
                    const rating = parseFloat(p.rating || 0).toFixed(1);
                    const pPM = gv(p, 'passesMade', 'passesmade', 'passescompleted');
                    const pPA = gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
                    const pTM = gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                    const pTA = gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                    const pPassPct = pPA > 0 ? ((pPM / pPA) * 100).toFixed(0) + '%' : '';
                    const pTackPct = pTA > 0 ? ((pTM / pTA) * 100).toFixed(0) + '%' : '';
                    
                    let extras = [];
                    if (pGoals > 0) extras.push(`⚽${pGoals}`);
                    if (pAssists > 0) extras.push(`👟${pAssists}`);
                    if (pPassPct) extras.push(`👟${pPassPct}`);
                    if (pTackPct) extras.push(`🛡️${pTackPct}`);
                    
                    return {
                        order: POS_ORDER[pos] ?? 99,
                        text: `\`${pos.padEnd(3)}\` **${p.playername}** ⭐${rating}${extras.length > 0 ? ' ' + extras.join(' ') : ''}`
                    };
                }).sort((a, b) => a.order - b.order);
                lineupStr = sorted.map(p => p.text).join('\n');
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`${resultEmoji} ${club.eaClubName} ${ourGoals} - ${oppGoals} ${opponentName}`)
                .setDescription(`📅 ${matchDate} — 🕐 ${matchTime}h (Madrid)`)
                .setColor(resultColor)
                .addFields(
                    { name: '⚽ Posesión (est.)', value: `**${estPoss}%** vs ${estOppPoss}%`, inline: true },
                    { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta) vs ${oppStats.shots} (${oppShotsOT})`, inline: true },
                    { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                    { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%) vs ${oppPassAcc}%`, inline: true },
                    { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }
                );
            
            if (lineupStr) {
                embed.addFields({ name: '📋 Alineación y Rendimiento', value: lineupStr, inline: false });
            }
            
            embeds.push(embed);
        }
        
        return interaction.editReply({ content: `📜 **Últimos ${embeds.length} partidos de ${club.eaClubName}:**`, embeds });
    }
};
