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
        if (archetypeid == 10 || archetypeid == 12) return 'CARR'; // Chispa/Killer → Carrilero
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
    
    // --- RUTEO AL BOT PRINCIPAL (VPG CRAWLER MODALS) ---
    if (customId.startsWith('vpg_best11_modal')) {
        try {
            const { handleModal } = await import('../../handlers/modalHandler.js');
            return handleModal(interaction);
        } catch (err) {
            console.error('Error delegando modal vpg_best11:', err);
        }
    }

    if (customId.startsWith('modal_team_best11_')) {
        await interaction.deferReply();
        const teamId = customId.replace('modal_team_best11_', '');
        
        const dateFilterRaw = fields.getTextInputValue('dateFilter');
        const timeFilterRaw = fields.getTextInputValue('timeFilter');
        
        let daysFilterRaw = '';
        try { daysFilterRaw = fields.getTextInputValue('daysFilter') || ''; } catch(e) {}

        try {
            const team = await Team.findById(teamId);
            if (!team) return interaction.editReply({ content: '❌ Equipo no encontrado.' });

            const { aggregateTeamLocalStats } = await import('../../logic/localStatsLogic.js');
            const roster = await aggregateTeamLocalStats(team, dateFilterRaw, timeFilterRaw, daysFilterRaw);

            const { calculateTeamBest11, generateTeamBest11Image } = await import('../../utils/teamBest11Generator.js');
            const best11 = await calculateTeamBest11(roster);
            const imageBuffer = await generateTeamBest11Image(best11, team.name, team.logoUrl || team.teamLogoUrl);

            let filterInfo = '';
            if (dateFilterRaw || timeFilterRaw || daysFilterRaw) {
                filterInfo = `\n*(Filtros: ${dateFilterRaw ? dateFilterRaw : 'Siempre'} | ${timeFilterRaw ? timeFilterRaw : 'Todo el día'} | ${daysFilterRaw ? daysFilterRaw : 'Todos los días'})*`;
            }

            let benchText = '';
            if (best11.bench && best11.bench.length > 0) {
                const sortedBench = best11.bench.sort((a, b) => b.points - a.points);
                const mapped = sortedBench.map(p => `• **${p.name}** | ${p.posName || p.posGroup.toUpperCase()} | ${p.points} pts | ${p.gamesPlayed} PJ`);
                benchText = `\n\n🪑 **Banquillo (Resto de plantilla):**\n${mapped.slice(0, 15).join('\n')}`;
                if (mapped.length > 15) benchText += `\n*...y ${mapped.length - 15} más.*`;
            }

            return interaction.editReply({ 
                content: `🌟 **11 Ideal Acumulativo de ${team.name}**${filterInfo}${benchText}`,
                files: [{ attachment: imageBuffer, name: 'best11.png' }] 
            });

        } catch (err) {
            console.error('Error generando el 11 Ideal Local:', err);
            return interaction.editReply({ content: `❌ No se pudo generar el 11 Ideal: ${err.message}` });
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
            const { getDb: getDbImport } = await import('../../../database.js');
            const settingsColl = getDbImport().collection('bot_settings');
            await settingsColl.updateOne({ _id: 'global_config' }, { $set: { crawlerTimeRange: null } });
            // Actualizar el panel principal
            const { updateVpgAdminPanelEmbed } = await import('../../utils/embeds.js');
            await updateVpgAdminPanelEmbed(client);
            return interaction.editReply({ content: '✅ Filtro horario **desactivado**. El crawler guardará partidos de cualquier hora.' });
        }

        // Validar formato HH:MM
        const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startRaw) || !timeRegex.test(endRaw)) {
            return interaction.editReply({ content: '❌ Formato incorrecto. Usa **HH:MM** (ej: `21:30`). Para desactivar, escribe `off` en la hora de inicio.' });
        }

        const { getDb: getDbImport2 } = await import('../../../database.js');
        const settingsColl = getDbImport2().collection('bot_settings');
        await settingsColl.updateOne({ _id: 'global_config' }, { $set: { crawlerTimeRange: { start: startRaw, end: endRaw } } });

        // Actualizar el panel principal
        const { updateVpgAdminPanelEmbed } = await import('../../utils/embeds.js');
        await updateVpgAdminPanelEmbed(client);

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
                            intercepts: p.interceptions ?? p.Interceptions ?? p.interception ?? '—',
                            tacklesMade: p.tacklesMade ?? p.tacklesmade ?? p.tacklescompleted ?? '—',
                            tacklesAtt: p.tacklesAttempted ?? p.tacklesattempted ?? p.tackleattempts ?? '—',
                            allKeys: Object.keys(p),
                            rawDefense: JSON.stringify({
                                interceptions: p.interceptions, Interceptions: p.Interceptions,
                                tacklesmade: p.tacklesmade, tacklesMade: p.tacklesMade, tacklescompleted: p.tacklescompleted,
                                tacklesattempted: p.tacklesattempted, tacklesAttempted: p.tacklesAttempted, tackleattempts: p.tackleattempts
                            }),
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
        output += `${'Fecha'.padEnd(12)} ${'Pos'.padEnd(5)} ${'Map'.padEnd(5)} ${'Arch'.padEnd(5)} ${'Rat'.padEnd(5)} ${'G'.padEnd(3)} ${'A'.padEnd(3)} ${'Int'.padEnd(4)} ${'TM'.padEnd(4)} ${'TA'.padEnd(4)} Club\n`;
        output += `${'─'.repeat(70)}\n`;
        for (const f of found) {
            output += `${f.date.padEnd(12)} ${String(f.pos).substring(0,4).padEnd(5)} ${f.mappedPos.padEnd(5)} ${String(f.archetypeid).padEnd(5)} ${String(f.rating).padEnd(5)} ${String(f.goals).padEnd(3)} ${String(f.assists).padEnd(3)} ${String(f.intercepts).padEnd(4)} ${String(f.tacklesMade).padEnd(4)} ${String(f.tacklesAtt).padEnd(4)} ${f.clubName}\n`;
        }
        output += `\`\`\`\n`;
        output += `**Leyenda:** Pos=EA, Map=resolvePos, Arch=archetypeid, Int=intercepciones, TM=entradas hechas, TA=entradas intentadas\n\n`;
        output += `**Keys defensivas crudas (1er partido):**\n\`\`\`json\n${found[0].rawDefense}\n\`\`\`\n`;
        output += `**Todas las keys EA (1er partido):**\n\`${found[0].allKeys.join(', ')}\``;

        return interaction.editReply({ content: output });
    }

    // --- CRUD de Franjas Horarias con Nombre ---
    if (customId === 'admin_create_time_slot_modal') {
        const slotName = fields.getTextInputValue('slot_name').trim();
        const slotStart = fields.getTextInputValue('slot_start').trim();
        const slotEnd = fields.getTextInputValue('slot_end').trim();
        const slotDaysRaw = (fields.getTextInputValue('slot_days') || '').trim();
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // Validar formato HH:MM
        const timeRegex = /^\d{1,2}:\d{2}$/;
        if (!timeRegex.test(slotStart) || !timeRegex.test(slotEnd)) {
            return interaction.editReply({ content: '❌ Formato incorrecto. Usa **HH:MM** (ej: `22:20`).' });
        }
        
        // Parsear días opcionales
        let daysText = '';
        if (slotDaysRaw) {
            const days = slotDaysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
            const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
            daysText = days.map(d => dayNames[d]).join(', ');
        }
        
        const { getDb: getDbSlots } = await import('../../../database.js');
        const settingsColl = getDbSlots().collection('bot_settings');
        
        // Verificar que no exista ya
        const config = await settingsColl.findOne({ _id: 'global_config' });
        const existing = (config?.timeSlots || []).find(s => s.name.toLowerCase() === slotName.toLowerCase());
        if (existing) {
            return interaction.editReply({ content: `❌ Ya existe una franja con el nombre **"${slotName}"**. Bórrala primero o usa otro nombre.` });
        }
        
        const newSlot = { name: slotName, start: slotStart, end: slotEnd };
        if (daysText) newSlot.days = daysText;
        if (slotDaysRaw) newSlot.daysRaw = slotDaysRaw;
        
        await settingsColl.updateOne(
            { _id: 'global_config' },
            { $push: { timeSlots: newSlot } }
        );
        
        return interaction.editReply({ content: `✅ Franja **"${slotName}"** creada: \`${slotStart}-${slotEnd}\`${daysText ? ` | 📅 ${daysText}` : ''}.\n\n💡 Ahora puedes escribir **"${slotName}"** en el campo de franja horaria de los paneles de estadísticas en vez de escribir la hora manualmente.` });
    }

    if (customId === 'admin_edit_time_slot_modal') {
        const slotName = fields.getTextInputValue('slot_name').trim();
        const slotStart = fields.getTextInputValue('slot_start').trim();
        const slotEnd = fields.getTextInputValue('slot_end').trim();
        const slotDaysRaw = (fields.getTextInputValue('slot_days') || '').trim();
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        const ctx = pendingSelections.get(interaction.user.id);
        const originalName = ctx?.editSlotOriginalName;
        if (ctx) pendingSelections.delete(interaction.user.id);
        
        if (!originalName) return interaction.editReply({ content: '❌ La sesión expiró. Vuelve a intentar editar.' });

        // Validar formato HH:MM
        const timeRegex = /^\d{1,2}:\d{2}$/;
        if (!timeRegex.test(slotStart) || !timeRegex.test(slotEnd)) {
            return interaction.editReply({ content: '❌ Formato incorrecto. Usa **HH:MM** (ej: `22:20`).' });
        }
        
        // Parsear días opcionales
        let daysText = '';
        if (slotDaysRaw) {
            const days = slotDaysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
            const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
            daysText = days.map(d => dayNames[d]).join(', ');
        }
        
        const { getDb: getDbSlots } = await import('../../../database.js');
        const settingsColl = getDbSlots().collection('bot_settings');
        const config = await settingsColl.findOne({ _id: 'global_config' });
        let slots = config?.timeSlots || [];
        
        const idx = slots.findIndex(s => s.name === originalName);
        if (idx === -1) return interaction.editReply({ content: `❌ No se encontró la franja original **"${originalName}"**.` });

        // Verificar colisión de nombre si se cambió el nombre
        if (slotName.toLowerCase() !== originalName.toLowerCase()) {
            const exists = slots.find(s => s.name.toLowerCase() === slotName.toLowerCase());
            if (exists) return interaction.editReply({ content: `❌ Ya existe otra franja con el nombre **"${slotName}"**.` });
        }
        
        // Actualizar datos
        slots[idx].name = slotName;
        slots[idx].start = slotStart;
        slots[idx].end = slotEnd;
        if (daysText) {
            slots[idx].days = daysText;
            slots[idx].daysRaw = slotDaysRaw;
        } else {
            delete slots[idx].days;
            delete slots[idx].daysRaw;
        }
        
        await settingsColl.updateOne({ _id: 'global_config' }, { $set: { timeSlots: slots } });
        
        return interaction.editReply({ content: `✅ Franja actualizada: **"${slotName}"** \`${slotStart}-${slotEnd}\`${daysText ? ` | 📅 ${daysText}` : ''}.` });
    }

    if (customId === 'admin_delete_time_slot_modal') {
        const slotName = fields.getTextInputValue('slot_name').trim();
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { getDb: getDbSlots } = await import('../../../database.js');
        const settingsColl = getDbSlots().collection('bot_settings');
        
        const config = await settingsColl.findOne({ _id: 'global_config' });
        const slots = config?.timeSlots || [];
        const idx = slots.findIndex(s => s.name.toLowerCase() === slotName.toLowerCase());
        
        if (idx === -1) {
            const available = slots.map(s => `• ${s.name}`).join('\n') || '_Ninguna_';
            return interaction.editReply({ content: `❌ No se encontró ninguna franja con el nombre **"${slotName}"**.\n\nFranjas disponibles:\n${available}` });
        }
        
        const removed = slots[idx];
        await settingsColl.updateOne(
            { _id: 'global_config' },
            { $pull: { timeSlots: { name: removed.name } } }
        );
        
        return interaction.editReply({ content: `🗑️ Franja **"${removed.name}"** (\`${removed.start}-${removed.end}\`) eliminada.` });
    }

    // Helper: parsear rango de fechas desde texto
    // Soporta: "15/04/26-28/04/26", "desde 20/04/26", "hasta 28/04/26"
    const parseDateFilter = (raw) => {
        if (!raw) return null;
        const parseDate = (s) => {
            const parts = s.trim().split('/');
            if (parts.length < 2) return null;
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parts[2] ? (parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])) : new Date().getFullYear();
            const d = new Date(year, month, day);
            return isNaN(d.getTime()) ? null : d;
        };
        
        // "desde DD/MM/YY"
        const desdeMatch = raw.match(/^desde\s+(.+)$/i);
        if (desdeMatch) {
            const from = parseDate(desdeMatch[1]);
            return from ? { from, to: null } : null;
        }
        // "hasta DD/MM/YY"
        const hastaMatch = raw.match(/^hasta\s+(.+)$/i);
        if (hastaMatch) {
            const to = parseDate(hastaMatch[1]);
            if (to) to.setHours(23, 59, 59);
            return to ? { from: null, to } : null;
        }
        // "DD/MM/YY-DD/MM/YY"
        const rangeMatch = raw.match(/^(.+?)\s*[-–]\s*(.+)$/);
        if (rangeMatch) {
            const from = parseDate(rangeMatch[1]);
            const to = parseDate(rangeMatch[2]);
            if (to) to.setHours(23, 59, 59);
            return (from || to) ? { from, to } : null;
        }
        // Solo una fecha = ese día
        const single = parseDate(raw);
        if (single) {
            const to = new Date(single);
            to.setHours(23, 59, 59);
            return { from: single, to };
        }
        return null;
    };

    if (customId === 'stats_player_scout_modal') {
        const playerName = fields.getTextInputValue('player_name').trim();
        let timeFilterRaw = '', daysFilterRaw = '', dateFilterRaw = '';
        try { timeFilterRaw = (fields.getTextInputValue('time_filter') || '').trim(); } catch(e) {}
        try { daysFilterRaw = (fields.getTextInputValue('days_filter') || '').trim(); } catch(e) {}
        try { dateFilterRaw = (fields.getTextInputValue('date_filter') || '').trim(); } catch(e) {}
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        console.log(`📊 [STATS] ${interaction.user.tag} (${interaction.user.id}) scout jugador: "${playerName}"`);
        
        const { getDb } = await import('../../../database.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        // 1. Comprobar si hay selección de franjas desde el selector
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        const pending = pendingSelections.get(interaction.user.id);
        if (pending) pendingSelections.delete(interaction.user.id);
        
        console.log(`📊 [DEBUG-SCOUT] pending = ${JSON.stringify(pending)}`);
        
        let timeFilters = []; // Array de { start, end, name }
        let daysFilter = null;
        let resolvedSlotNames = [];
        
        if (pending && pending.slots && !pending.slots.includes('__ALL__')) {
            // Resolver slots seleccionados desde la DB
            const config = await db.collection('bot_settings').findOne({ _id: 'global_config' });
            const savedSlots = config?.timeSlots || [];
            console.log(`📊 [DEBUG-SCOUT] savedSlots en DB = ${JSON.stringify(savedSlots)}`);
            for (const slotName of pending.slots) {
                const found = savedSlots.find(s => s.name === slotName);
                console.log(`📊 [DEBUG-SCOUT] buscando "${slotName}" → ${found ? JSON.stringify(found) : 'NO ENCONTRADO'}`);
                if (found) {
                    timeFilters.push({ start: found.start, end: found.end, name: found.name });
                    resolvedSlotNames.push(found.name);
                    // Usar días del primer slot que los tenga
                    if (found.daysRaw && !daysFilter) {
                        daysFilter = found.daysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
                        if (daysFilter.length === 0) daysFilter = null;
                    }
                }
            }
        } else if (!pending && timeFilterRaw) {
            // Fallback: parsear texto manual
            const timeMatch = timeFilterRaw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
            if (timeMatch) {
                timeFilters.push({ start: timeMatch[1], end: timeMatch[2] });
            } else {
                // Intentar resolver como nombre
                const config = await db.collection('bot_settings').findOne({ _id: 'global_config' });
                const slots = config?.timeSlots || [];
                const found = slots.find(s => s.name.toLowerCase() === timeFilterRaw.toLowerCase());
                if (found) {
                    timeFilters.push({ start: found.start, end: found.end, name: found.name });
                    resolvedSlotNames.push(found.name);
                    if (found.daysRaw && !daysFilterRaw) {
                        daysFilter = found.daysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
                        if (daysFilter.length === 0) daysFilter = null;
                    }
                } else {
                    const available = slots.map(s => `• **${s.name}** → \`${s.start}-${s.end}\``).join('\n');
                    return interaction.editReply({ content: `❌ Formato incorrecto. Usa **HH:MM-HH:MM** o un nombre de franja.${available ? '\n\n📐 Franjas:\n' + available : ''}` });
                }
            }
        }
        
        // Parsear días manual si no viene de slot
        if (!daysFilter && daysFilterRaw) {
            daysFilter = daysFilterRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
            if (daysFilter.length === 0) daysFilter = null;
        }

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
                // Múltiples resultados — mostrar desplegable
                const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
                pendingSelections.set(interaction.user.id, {
                    disambigType: 'player_scout',
                    timeFilters, daysFilter, resolvedSlotNames,
                    dateFilter: dateFilterRaw ? { raw: dateFilterRaw } : null,
                    timestamp: Date.now()
                });
                
                const options = results.slice(0, 25).map(p => {
                    const s = p.stats || {};
                    const m = s.matchesPlayed || 0;
                    let avgR = '—';
                    if (s.ratings && s.ratings.length > 0) avgR = (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1);
                    return {
                        label: p.eaPlayerName,
                        value: p.eaPlayerName,
                        description: `${p.lastPosition || '?'} | ${p.lastClub || '?'} | ${m}P | ⭐${avgR}`
                    };
                });
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('stats_disambig_player')
                    .setPlaceholder('Selecciona el jugador correcto...')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(options);
                
                return interaction.editReply({
                    content: `🔍 Se encontraron **${results.length}** jugadores con **"${playerName}"**. Elige el correcto:`,
                    components: [new ActionRowBuilder().addComponents(selectMenu)]
                });
            }
        }
        
        // Parsear rango de fechas
        const dateFilter = parseDateFilter(dateFilterRaw);
        
        // Helper para filtrar matches por hora/día Madrid — soporta múltiples franjas (OR)
        const filterMatchByTimeAndDay = (match) => {
            if (!match.timestamp) return false;
            const matchDate = new Date(parseInt(match.timestamp) * 1000);
            
            // Filtro de fecha
            if (dateFilter) {
                if (dateFilter.from && matchDate < dateFilter.from) return false;
                if (dateFilter.to && matchDate > dateFilter.to) return false;
            }
            
            // Filtro de día
            if (daysFilter) {
                const madridDayStr = matchDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' });
                const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
                const madridDay = dayMap[madridDayStr] ?? matchDate.getDay();
                if (!daysFilter.includes(madridDay)) return false;
            }
            
            // Filtro horario — match pasa si cae dentro de CUALQUIER franja seleccionada
            if (timeFilters.length > 0) {
                const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                const [h, min] = madridTimeStr.split(':').map(Number);
                const matchMinutes = h * 60 + min;
                
                const matchesAnySlot = timeFilters.some(tf => {
                    const [sh, sm] = tf.start.split(':').map(Number);
                    const [eh, em] = tf.end.split(':').map(Number);
                    const startMin = sh * 60 + sm;
                    const endMin = eh * 60 + em;
                    if (startMin <= endMin) {
                        return matchMinutes >= startMin && matchMinutes <= endMin;
                    } else {
                        return matchMinutes >= startMin || matchMinutes <= endMin;
                    }
                });
                if (!matchesAnySlot) return false;
            }
            return true;
        };

        // Si hay filtros activos, recalcular stats desde scanned_matches
        let s, m, pos, lastClub, lastActive;
        const hasFilters = timeFilters.length > 0 || daysFilter || dateFilter;
        
        if (hasFilters) {
            // Buscar todos los matches donde este jugador participó
            const allMatches = await db.collection('scanned_matches').find({}).sort({ timestamp: -1 }).toArray();
            
            const filtered = allMatches.filter(match => {
                // Check if player is in this match
                if (!match.players) return false;
                for (const clubId of Object.keys(match.players)) {
                    for (const pid of Object.keys(match.players[clubId])) {
                        const pData = match.players[clubId][pid];
                        if (pData.playername && pData.playername.toLowerCase() === profile.eaPlayerName.toLowerCase()) {
                            return filterMatchByTimeAndDay(match);
                        }
                    }
                }
                return false;
            });
            
            // Aggregate stats from filtered matches
            const aggr = { matchesPlayed: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passesMade: 0, passesAttempted: 0, tacklesMade: 0, tacklesAttempted: 0, interceptions: 0, saves: 0, mom: 0, redCards: 0, yellowCards: 0, cleanSheets: 0, goalsConceded: 0, ratings: [], dnfCount: 0 };
            
            const getVal = (obj, ...keys) => { for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; } return 0; };
            
            for (const match of filtered) {
                for (const clubId of Object.keys(match.players || {})) {
                    for (const pid of Object.keys(match.players[clubId])) {
                        const pData = match.players[clubId][pid];
                        if (pData.playername && pData.playername.toLowerCase() === profile.eaPlayerName.toLowerCase()) {
                            // Comprobar si es un partido sin datos reales (DNF temprano)
                            // Se necesitan AMBAS condiciones:
                            // 1. Partido corto (secondsPlayed < 5200 = ~87min)
                            // 2. Datos vacíos (pases + tiros + entradas == 0)
                            const pm = getVal(pData, 'passesMade', 'passesmade');
                            const sh = getVal(pData, 'shots');
                            const tk = getVal(pData, 'tacklesMade', 'tacklesmade');
                            const hasRealStats = (pm + sh + tk) > 0;
                            
                            let matchMaxSecs = 0;
                            for (const cid of Object.keys(match.players || {})) {
                                Object.values(match.players[cid]).forEach(p => {
                                    const sec = parseInt(p.secondsPlayed || 0);
                                    if (sec > matchMaxSecs) matchMaxSecs = sec;
                                });
                            }
                            const isShortMatch = matchMaxSecs > 0 && matchMaxSecs < 5200;
                            
                            // Siempre guardar rating
                            aggr.ratings.push(parseFloat(pData.rating || 0));
                            
                            if (isShortMatch && !hasRealStats) {
                                // Partido corto + sin datos → DNF donde nos desconectamos
                                aggr.dnfCount++;
                                continue;
                            }
                            
                            aggr.matchesPlayed++;
                            aggr.goals += getVal(pData, 'goals');
                            aggr.assists += getVal(pData, 'assists');
                            aggr.shots += sh;
                            aggr.shotsOnTarget += getVal(pData, 'shotsOnTarget', 'shotsontarget', 'shotsongoal', 'shotsOnGoal');
                            aggr.passesMade += pm;
                            aggr.passesAttempted += getVal(pData, 'passesAttempted', 'passesattempted', 'passattempts');
                            aggr.tacklesMade += tk;
                            aggr.tacklesAttempted += getVal(pData, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                            aggr.interceptions += getVal(pData, 'interceptions');
                            aggr.saves += getVal(pData, 'saves');
                            aggr.mom += getVal(pData, 'mom');
                            aggr.redCards += getVal(pData, 'redCards', 'redcards');
                            aggr.yellowCards += getVal(pData, 'yellowCards', 'yellowcards');
                            
                            // GK stats
                            const posStr = String(pData.pos || '').toLowerCase();
                            if (posStr === 'goalkeeper' || posStr === '0') {
                                const goalsAgainst = match.clubs[clubId] ? parseInt(match.clubs[clubId].goalsAgainst || 0) : 0;
                                aggr.goalsConceded += goalsAgainst;
                                if (goalsAgainst === 0) aggr.cleanSheets++;
                            }
                        }
                    }
                }
            }
            
            s = aggr;
            m = aggr.matchesPlayed;
            pos = profile.lastPosition || '???';
            lastClub = profile.lastClub;
            lastActive = profile.lastActive;
        } else {
            s = profile.stats || {};
            m = s.matchesPlayed || 0;
            pos = profile.lastPosition || '???';
            lastClub = profile.lastClub;
            lastActive = profile.lastActive;
        }
        
        if (m === 0) {
            const filterInfo = hasFilters ? ` dentro de la franja/días seleccionados` : '';
            return interaction.editReply({ content: `El jugador **${profile.eaPlayerName}** no tiene partidos registrados${filterInfo}.` });
        }
        
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
        const rawPos = pos;
        const translatedPos = POS_TRANSLATE[rawPos.toLowerCase()] || rawPos;
        const isGK = translatedPos === 'POR';
        
        // Crear texto de filtros activos
        let filterText = '';
        if (resolvedSlotNames.length > 0) {
            filterText += `📐 ${resolvedSlotNames.join(', ')}`;
        } else if (timeFilters.length > 0) {
            filterText += `⏰ ${timeFilters.map(tf => `${tf.start}-${tf.end}`).join(' + ')}`;
        }
        if (daysFilter) {
            const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
            const daysText = daysFilter.map(d => dayNames[d]).join(', ');
            filterText += (filterText ? ' | ' : '') + `📅 ${daysText}`;
        }
        if (dateFilter) {
            const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
            let dateStr = '';
            if (dateFilter.from && dateFilter.to) dateStr = `${fmt(dateFilter.from)} — ${fmt(dateFilter.to)}`;
            else if (dateFilter.from) dateStr = `desde ${fmt(dateFilter.from)}`;
            else if (dateFilter.to) dateStr = `hasta ${fmt(dateFilter.to)}`;
            filterText += (filterText ? ' | ' : '') + `🗓️ ${dateStr}`;
        }
        
        const dnfNote = (s.dnfCount && s.dnfCount > 0) ? ` *(+${s.dnfCount} 🔌 sin datos)*` : '';
        
        const embed = new EmbedBuilder()
            .setTitle(`🔍 Informe de Scout: ${profile.eaPlayerName}`)
            .setDescription(`📋 **Equipo:** ${lastClub || 'Desconocido'}\n🎽 **Posición:** ${translatedPos}\n📅 **Última actividad:** ${lastActive ? new Date(lastActive).toLocaleDateString('es-ES') : '—'}${filterText ? `\n🔎 **Filtro:** ${filterText}` : ''}`)
            .setColor('#2ecc71')
            .addFields(
                { name: '🏟️ Partidos', value: `**${m}**${dnfNote}`, inline: true },
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
                { name: 'Entradas/Partido', value: `${(tacklesMade / m).toFixed(1)}`, inline: true }
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
        
        if (filterText) {
            embed.setFooter({ text: `Filtro aplicado: ${filterText}` });
        }
            
        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'stats_team_scout_modal') {
        const teamName = fields.getTextInputValue('team_name').trim();
        let timeFilterRaw = '', daysFilterRaw = '', dateFilterRaw = '';
        try { timeFilterRaw = (fields.getTextInputValue('time_filter') || '').trim(); } catch(e) {}
        try { daysFilterRaw = (fields.getTextInputValue('days_filter') || '').trim(); } catch(e) {}
        try { dateFilterRaw = (fields.getTextInputValue('date_filter') || '').trim(); } catch(e) {}
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        console.log(`📊 [STATS] ${interaction.user.tag} (${interaction.user.id}) scout equipo: "${teamName}"`);
        
        const { getDb } = await import('../../../database.js');
        const { extractMatchInfo, mergeSessions } = await import('../../utils/matchUtils.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        // Comprobar pendingSelections
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        const pending = pendingSelections.get(interaction.user.id);
        if (pending) pendingSelections.delete(interaction.user.id);
        
        let timeFilters = [];
        let daysFilter = null;
        let resolvedSlotNames = [];
        
        if (pending && pending.slots && !pending.slots.includes('__ALL__')) {
            const config = await db.collection('bot_settings').findOne({ _id: 'global_config' });
            const savedSlots = config?.timeSlots || [];
            for (const slotName of pending.slots) {
                const found = savedSlots.find(s => s.name === slotName);
                if (found) {
                    timeFilters.push({ start: found.start, end: found.end, name: found.name });
                    resolvedSlotNames.push(found.name);
                    if (found.daysRaw && !daysFilter) {
                        daysFilter = found.daysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
                        if (daysFilter.length === 0) daysFilter = null;
                    }
                }
            }
        } else if (!pending && timeFilterRaw) {
            const timeMatch = timeFilterRaw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
            if (timeMatch) {
                timeFilters.push({ start: timeMatch[1], end: timeMatch[2] });
            } else {
                const config = await db.collection('bot_settings').findOne({ _id: 'global_config' });
                const slots = config?.timeSlots || [];
                const found = slots.find(s => s.name.toLowerCase() === timeFilterRaw.toLowerCase());
                if (found) {
                    timeFilters.push({ start: found.start, end: found.end, name: found.name });
                    resolvedSlotNames.push(found.name);
                    if (found.daysRaw && !daysFilterRaw) {
                        daysFilter = found.daysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
                        if (daysFilter.length === 0) daysFilter = null;
                    }
                }
            }
        }
        if (!daysFilter && daysFilterRaw) {
            daysFilter = daysFilterRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
            if (daysFilter.length === 0) daysFilter = null;
        }
        
        // Parsear rango de fechas
        const dateFilter = parseDateFilter(dateFilterRaw);
        
        // Texto de filtros para embed
        let filterText = '';
        if (resolvedSlotNames.length > 0) {
            filterText += `📐 ${resolvedSlotNames.join(', ')}`;
        } else if (timeFilters.length > 0) {
            filterText += `⏰ ${timeFilters.map(tf => `${tf.start}-${tf.end}`).join(' + ')}`;
        }
        if (daysFilter) {
            const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
            filterText += (filterText ? ' | ' : '') + `📅 ${daysFilter.map(d => dayNames[d]).join(', ')}`;
        }
        if (dateFilter) {
            const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
            let dateStr = '';
            if (dateFilter.from && dateFilter.to) dateStr = `${fmt(dateFilter.from)} — ${fmt(dateFilter.to)}`;
            else if (dateFilter.from) dateStr = `desde ${fmt(dateFilter.from)}`;
            else if (dateFilter.to) dateStr = `hasta ${fmt(dateFilter.to)}`;
            filterText += (filterText ? ' | ' : '') + `🗓️ ${dateStr}`;
        }

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
            const { pendingSelections: ps } = await import('../../utils/pendingStatsSelections.js');
            const dateFilter = parseDateFilter(dateFilterRaw);
            ps.set(interaction.user.id, {
                disambigType: 'team_scout',
                timeFilters, daysFilter, resolvedSlotNames,
                dateFilter: dateFilter ? { from: dateFilter.from?.toISOString(), to: dateFilter.to?.toISOString() } : null,
                timestamp: Date.now()
            });
            const options = vpgTeams.slice(0, 25).map(t => ({
                label: t.name,
                value: t.eaClubId,
                description: `${t.abbreviation} — Liga: ${t.league}`
            }));
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('stats_disambig_team')
                .setPlaceholder('Selecciona el equipo correcto...')
                .setMinValues(1).setMaxValues(1)
                .addOptions(options);
            return interaction.editReply({
                content: `🔍 Se encontraron **${vpgTeams.length}** equipos. Elige el correcto:`,
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
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
        
        const hasFilters = timeFilters.length > 0 || daysFilter || dateFilter;
        let s, m;
        
        if (hasFilters) {
            console.log(`📊 [DEBUG-TEAM] Recalculando stats con filtros para ${club.eaClubName}`);
            // Recalcular stats desde scanned_matches con filtro de franja/día
            const allMatches = await db.collection('scanned_matches').find({
                [`clubs.${club.eaClubId}`]: { $exists: true }
            }).sort({ timestamp: -1 }).toArray();
            
            // Helper para filtrar por hora/día/fecha Madrid
            const filterMatch = (match) => {
                if (!match.timestamp) return false;
                const matchDate = new Date(parseInt(match.timestamp) * 1000);
                // Filtro de fecha
                if (dateFilter) {
                    if (dateFilter.from && matchDate < dateFilter.from) return false;
                    if (dateFilter.to && matchDate > dateFilter.to) return false;
                }
                if (daysFilter) {
                    const madridDayStr = matchDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' });
                    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
                    const madridDay = dayMap[madridDayStr] ?? matchDate.getDay();
                    if (!daysFilter.includes(madridDay)) return false;
                }
                if (timeFilters.length > 0) {
                    const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                    const [h, min] = madridTimeStr.split(':').map(Number);
                    const matchMinutes = h * 60 + min;
                    const matchesAnySlot = timeFilters.some(tf => {
                        const [sh, sm] = tf.start.split(':').map(Number);
                        const [eh, em] = tf.end.split(':').map(Number);
                        const startMin = sh * 60 + sm;
                        const endMin = eh * 60 + em;
                        if (startMin <= endMin) return matchMinutes >= startMin && matchMinutes <= endMin;
                        else return matchMinutes >= startMin || matchMinutes <= endMin;
                    });
                    if (!matchesAnySlot) return false;
                }
                return true;
            };
            
            const filtered = allMatches.filter(filterMatch);
            console.log(`📊 [DEBUG-TEAM] ${allMatches.length} matches totales → ${filtered.length} tras filtro`);
            
            const getVal = (obj, ...keys) => { for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; } return 0; };
            
            const aggr = { matchesPlayed: 0, wins: 0, ties: 0, losses: 0, goals: 0, goalsAgainst: 0, shots: 0, passesMade: 0, passesAttempted: 0, tacklesMade: 0, tacklesAttempted: 0 };
            
            const mergedMatches = mergeSessions(filtered, club.eaClubId);
            
            for (const mData of mergedMatches) {
                aggr.matchesPlayed++;
                const og = mData.ourGoals;
                const oag = mData.oppGoals;
                aggr.goals += og;
                aggr.goalsAgainst += oag;
                if (og > oag) aggr.wins++;
                else if (og < oag) aggr.losses++;
                else aggr.ties++;
                
                for (const session of mData.sessions) {
                    const match = session.match;
                    if (match.players?.[club.eaClubId]) {
                        for (const p of Object.values(match.players[club.eaClubId])) {
                            aggr.shots += getVal(p, 'shots');
                            aggr.passesMade += getVal(p, 'passesMade', 'passesmade', 'passescompleted');
                            aggr.passesAttempted += getVal(p, 'passesAttempted', 'passesattempted', 'passattempts');
                            aggr.tacklesMade += getVal(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                            aggr.tacklesAttempted += getVal(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                        }
                    }
                }
            }
            
            s = aggr;
            m = aggr.matchesPlayed;
        } else {
            s = club.stats || {};
            m = s.matchesPlayed || 0;
        }
        
        if (m === 0) {
            const filterInfo = hasFilters ? ' dentro de la franja/días seleccionados' : '';
            return interaction.editReply({ content: `El equipo **${club.eaClubName}** no tiene partidos registrados${filterInfo}.` });
        }
        
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
        const POS_ORDER = { 'POR': 0, 'DFC': 1, 'LD': 2, 'LI': 3, 'CAD': 4, 'CAI': 5, 'MCD': 6, 'MC': 7, 'CARR': 8, 'MCO': 9, 'MD': 10, 'MI': 10, 'ED': 11, 'EI': 12, 'MP': 13, 'DC': 14 };

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
            .setDescription(`📅 **Última actividad:** ${club.lastActive ? new Date(club.lastActive).toLocaleDateString('es-ES') : '—'}${filterText ? `\n🔎 **Filtro:** ${filterText}` : ''}`)
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
        
        if (filterText) {
            embed.setFooter({ text: `Filtro aplicado: ${filterText}` });
        }
            
        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'stats_match_history_modal') {
        const teamName = fields.getTextInputValue('team_name').trim();
        let timeFilterRaw = '', daysFilterRaw = '', dateFilterRaw = '';
        try { timeFilterRaw = (fields.getTextInputValue('time_filter') || '').trim(); } catch(e) {}
        try { daysFilterRaw = (fields.getTextInputValue('days_filter') || '').trim(); } catch(e) {}
        try { dateFilterRaw = (fields.getTextInputValue('date_filter') || '').trim(); } catch(e) {}
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        console.log(`📊 [STATS] ${interaction.user.tag} (${interaction.user.id}) historial equipo: "${teamName}"`);
        
        const { getDb } = await import('../../../database.js');
        const { extractMatchInfo, mergeSessions } = await import('../../utils/matchUtils.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });

        // Comprobar pendingSelections
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        const pending = pendingSelections.get(interaction.user.id);
        if (pending) pendingSelections.delete(interaction.user.id);
        
        console.log(`📊 [DEBUG-HISTORY] pending = ${JSON.stringify(pending)}`);
        
        let timeFilters = [];
        let daysFilter = null;
        let resolvedSlotNames = [];
        
        if (pending && pending.slots && !pending.slots.includes('__ALL__')) {
            const config = await db.collection('bot_settings').findOne({ _id: 'global_config' });
            const savedSlots = config?.timeSlots || [];
            console.log(`📊 [DEBUG-HISTORY] savedSlots en DB = ${JSON.stringify(savedSlots)}`);
            for (const slotName of pending.slots) {
                const found = savedSlots.find(s => s.name === slotName);
                console.log(`📊 [DEBUG-HISTORY] buscando "${slotName}" → ${found ? JSON.stringify(found) : 'NO ENCONTRADO'}`);
                if (found) {
                    timeFilters.push({ start: found.start, end: found.end, name: found.name });
                    resolvedSlotNames.push(found.name);
                    if (found.daysRaw && !daysFilter) {
                        daysFilter = found.daysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
                        if (daysFilter.length === 0) daysFilter = null;
                    }
                }
            }
            console.log(`📊 [DEBUG-HISTORY] timeFilters resueltos = ${JSON.stringify(timeFilters)}, daysFilter = ${JSON.stringify(daysFilter)}`);
        } else if (!pending && timeFilterRaw) {
            const timeMatch = timeFilterRaw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
            if (timeMatch) {
                timeFilters.push({ start: timeMatch[1], end: timeMatch[2] });
            } else {
                const config = await db.collection('bot_settings').findOne({ _id: 'global_config' });
                const slots = config?.timeSlots || [];
                const found = slots.find(s => s.name.toLowerCase() === timeFilterRaw.toLowerCase());
                if (found) {
                    timeFilters.push({ start: found.start, end: found.end, name: found.name });
                    resolvedSlotNames.push(found.name);
                    if (found.daysRaw && !daysFilterRaw) {
                        daysFilter = found.daysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
                        if (daysFilter.length === 0) daysFilter = null;
                    }
                } else {
                    const available = slots.map(s => `• **${s.name}** → \`${s.start}-${s.end}\``).join('\n');
                    return interaction.editReply({ content: `❌ Formato incorrecto. Usa **HH:MM-HH:MM** o un nombre de franja.${available ? '\n\n📐 Franjas:\n' + available : ''}` });
                }
            }
        }
        if (!daysFilter && daysFilterRaw) {
            daysFilter = daysFilterRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6);
            if (daysFilter.length === 0) daysFilter = null;
        }

        // Parsear rango de fechas
        const dateFilter = parseDateFilter(dateFilterRaw);

        const safeQuery = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let club = null;

        // 1. Buscar en equipos VPG (Discord) primero
        const vpgTeams = await Team.find({ name: new RegExp(safeQuery, 'i'), eaClubId: { $ne: null } }).lean();
        if (vpgTeams.length === 1) {
            club = await db.collection('club_profiles').findOne({ eaClubId: vpgTeams[0].eaClubId });
        } else if (vpgTeams.length > 1) {
            const { pendingSelections: ps } = await import('../../utils/pendingStatsSelections.js');
            const dateFilter = parseDateFilter(dateFilterRaw);
            ps.set(interaction.user.id, {
                disambigType: 'match_history',
                timeFilters, daysFilter, resolvedSlotNames,
                dateFilter: dateFilter ? { from: dateFilter.from?.toISOString(), to: dateFilter.to?.toISOString() } : null,
                timestamp: Date.now()
            });
            const options = vpgTeams.slice(0, 25).map(t => ({
                label: t.name,
                value: t.eaClubId,
                description: `${t.abbreviation} — Liga: ${t.league}`
            }));
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('stats_disambig_team')
                .setPlaceholder('Selecciona el equipo correcto...')
                .setMinValues(1).setMaxValues(1)
                .addOptions(options);
            return interaction.editReply({
                content: `🔍 Se encontraron **${vpgTeams.length}** equipos. Elige el correcto:`,
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
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

        // Aplicar filtro horario (multi-slot OR), de días y de fechas
        matches = matches.filter(match => {
            if (!match.timestamp) return false;
            const matchDate = new Date(parseInt(match.timestamp) * 1000);
            
            // Filtro de fecha
            if (dateFilter) {
                if (dateFilter.from && matchDate < dateFilter.from) return false;
                if (dateFilter.to && matchDate > dateFilter.to) return false;
            }
            
            // Filtro de día
            if (daysFilter) {
                const madridDayStr = matchDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' });
                const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
                const madridDay = dayMap[madridDayStr] ?? matchDate.getDay();
                if (!daysFilter.includes(madridDay)) return false;
            }
            
            // Filtro horario — pasa si cae dentro de CUALQUIER franja seleccionada
            if (timeFilters.length > 0) {
                const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                const [h, min] = madridTimeStr.split(':').map(Number);
                const matchMinutes = h * 60 + min;
                
                const matchesAnySlot = timeFilters.some(tf => {
                    const [sh, sm] = tf.start.split(':').map(Number);
                    const [eh, em] = tf.end.split(':').map(Number);
                    const startMin = sh * 60 + sm;
                    const endMin = eh * 60 + em;
                    if (startMin <= endMin) {
                        return matchMinutes >= startMin && matchMinutes <= endMin;
                    } else {
                        return matchMinutes >= startMin || matchMinutes <= endMin;
                    }
                });
                if (!matchesAnySlot) return false;
            }
            
            return true;
        });

        matches = matches.slice(0, 10);
        
        const filterInfo = [];
        if (resolvedSlotNames.length > 0) {
            filterInfo.push(`📐 ${resolvedSlotNames.join(', ')}`);
        } else if (timeFilters.length > 0) {
            filterInfo.push(`franja ${timeFilters.map(tf => `${tf.start}-${tf.end}`).join(' + ')}`);
        }
        if (daysFilter) {
            const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
            filterInfo.push(`días ${daysFilter.map(d => dayNames[d]).join(', ')}`);
        }
        if (dateFilter) {
            const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
            if (dateFilter.from && dateFilter.to) filterInfo.push(`🗓️ ${fmt(dateFilter.from)} — ${fmt(dateFilter.to)}`);
            else if (dateFilter.from) filterInfo.push(`🗓️ desde ${fmt(dateFilter.from)}`);
            else if (dateFilter.to) filterInfo.push(`🗓️ hasta ${fmt(dateFilter.to)}`);
        }
        const filterStr = filterInfo.length > 0 ? ` (${filterInfo.join(', ')})` : '';
        
        if (matches.length === 0) return interaction.editReply({ content: `No hay partidos guardados para **${club.eaClubName}**${filterStr}.` });
        
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
        const POS_ORDER = { 'POR': 0, 'DFC': 1, 'LD': 2, 'LI': 3, 'CAD': 4, 'CAI': 5, 'MCD': 6, 'MC': 7, 'CARR': 8, 'MCO': 9, 'MD': 10, 'MI': 10, 'ED': 11, 'EI': 12, 'MP': 13, 'DC': 14 };

        // Helper para keys inconsistentes de EA API
        const gv = (obj, ...keys) => { for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; } return 0; };

        // --- Agrupar partidos consecutivos contra el mismo rival y fusionar si hubo DNF ---
        const mergedMatches = mergeSessions(matches, club.eaClubId);
        const entries = [];

        for (const mData of mergedMatches) {
            if (mData.isMerged) {
                // Desglose de sesiones para embed
                let sessionLines = '';
                for (let si = 0; si < mData.sessions.length; si++) {
                    const s = mData.sessions[si];
                    const prefix = si < mData.sessions.length - 1 ? '├' : '└';
                    let dnfTag = '';
                    if (s.isDnf) {
                        const dnfMin = Math.floor(s.maxSecs / 60);
                        dnfTag = ` 🔌 Min ${dnfMin}`;
                    }
                    sessionLines += `\n${prefix} Sesión ${si + 1}: ${s.ourGoals} - ${s.oppGoals}${dnfTag}`;
                }

                let resultEmoji = '➖', resultColor = '#95a5a6';
                if (mData.ourGoals > mData.oppGoals) { resultEmoji = '✅'; resultColor = '#2ecc71'; }
                else if (mData.ourGoals < mData.oppGoals) { resultEmoji = '❌'; resultColor = '#e74c3c'; }
                
                const matchDateObj = new Date(mData.timestamp * 1000);
                const matchDate = matchDateObj.toLocaleDateString('es-ES');
                const matchTime = matchDateObj.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
                
                const embed = new EmbedBuilder()
                    .setTitle(`${resultEmoji} ${club.eaClubName} ${mData.ourGoals} - ${mData.oppGoals} ${mData.oppName}`)
                    .setDescription(`📅 ${matchDate} — 🕐 ${matchTime}h (Madrid)\n🔗 **${mData.sessionCount} sesiones** (fusión DNF)${sessionLines}`)
                    .setColor(resultColor);
                
                // Añadir stats de la sesión con datos reales (la que no fue DNF, o la última)
                let bestIdx = mData.sessions.findIndex(s => s.ourHasRealStats && !s.isDnf);
                if (bestIdx < 0) bestIdx = mData.sessions.findIndex(s => s.ourHasRealStats);
                if (bestIdx < 0) bestIdx = mData.sessions.length - 1;
                const bestSession = mData.sessions[bestIdx];
                const bMatch = bestSession.match;
                if (bMatch.players && bMatch.players[club.eaClubId]) {
                    const sumTeamStats = (players) => {
                        let st = { shots: 0, pm: 0, pa: 0, tm: 0, ta: 0, gkSaves: 0 };
                        if (!players) return st;
                        for (const pid in players) {
                            const p = players[pid];
                            st.shots += gv(p, 'shots');
                            st.pm += gv(p, 'passesMade', 'passesmade', 'passescompleted');
                            st.pa += gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
                            st.tm += gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                            st.ta += gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                            st.gkSaves += gv(p, 'saves');
                        }
                        return st;
                    };
                    const ourStats = sumTeamStats(bMatch.players[club.eaClubId]);
                    const oppStats = sumTeamStats(bMatch.players?.[bestSession.opponentId]);
                    const ourShotsOT = bestSession.ourGoals + oppStats.gkSaves;
                    const mPassMade = ourStats.pm, mPassAtt = ourStats.pa;
                    const mPassAcc = mPassAtt > 0 ? ((mPassMade / mPassAtt) * 100).toFixed(0) : '?';
                    const mTackMade = ourStats.tm, mTackAtt = ourStats.ta;
                    const mTackAcc = mTackAtt > 0 ? ((mTackMade / mTackAtt) * 100).toFixed(0) : '?';
                    const totalPassAtt = mPassAtt + oppStats.pa;
                    const estPoss = totalPassAtt > 0 ? ((mPassAtt / totalPassAtt) * 100).toFixed(0) : '?';
                    const estOppPoss = totalPassAtt > 0 ? ((oppStats.pa / totalPassAtt) * 100).toFixed(0) : '?';

                    // Si la sesión elegida NO es DNF, mostrar stats comparativas completas
                    if (!bestSession.isDnf) {
                        const oppPassAcc = oppStats.pa > 0 ? ((oppStats.pm / oppStats.pa) * 100).toFixed(0) : '?';
                        const oppShotsOT = bestSession.oppGoals + ourStats.gkSaves;
                        embed.addFields(
                            { name: '⚽ Posesión (est.)', value: `**${estPoss}%** vs ${estOppPoss}%`, inline: true },
                            { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta) vs ${oppStats.shots} (${oppShotsOT})`, inline: true },
                            { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                            { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%) vs ${oppPassAcc}%`, inline: true },
                            { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                            { name: '\u200B', value: '\u200B', inline: true }
                        );
                    } else {
                        embed.addFields(
                            { name: '⚽ Posesión (est.)', value: `⚠️ *No disp. (DNF)*`, inline: true },
                            { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta)`, inline: true },
                            { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                            { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%)`, inline: true },
                            { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                            { name: '⚠️ DNF', value: `*Stats del rival no disp.*`, inline: true }
                        );
                    }

                    // Alineación con stats por jugador
                    const players = Object.values(bMatch.players[club.eaClubId]);
                    const sorted = players.map(p => {
                        const pos = resolvePos(p.pos, p.archetypeid);
                        const rating = parseFloat(p.rating || 0).toFixed(1);
                        let extras = [];
                        if (parseInt(p.goals || 0) > 0) extras.push(`⚽${p.goals}`);
                        if (parseInt(p.assists || 0) > 0) extras.push(`🎩${p.assists}`);
                        const pPA = gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
                        const pPM = gv(p, 'passesMade', 'passesmade', 'passescompleted');
                        if (pPA > 0) extras.push(`👟${((pPM / pPA) * 100).toFixed(0)}%`);
                        const pTA = gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                        const pTM = gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                        if (pTA > 0) extras.push(`🛡️${((pTM / pTA) * 100).toFixed(0)}%`);
                        return { order: POS_ORDER[pos] ?? 99, text: `\`${pos.padEnd(3)}\` **${p.playername}** ⭐${rating}${extras.length > 0 ? ' ' + extras.join(' ') : ''}` };
                    }).sort((a, b) => a.order - b.order);
                    embed.addFields({ name: `📋 Alineación (sesión ${bestIdx + 1})`, value: sorted.map(p => p.text).join('\n'), inline: false });
                }
                
                entries.push(embed);
            } else {
                // Sin merge: mostrar cada partido individualmente con stats detalladas
                const g = mData.sessions[0];
                const match = g.match;
                const matchDateObj = new Date(g.timestamp * 1000);
                const matchDate = matchDateObj.toLocaleDateString('es-ES');
                const matchTime = matchDateObj.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
                
                let resultEmoji = '➖', resultColor = '#95a5a6';
                if (g.ourGoals > g.oppGoals) { resultEmoji = '✅'; resultColor = '#2ecc71'; }
                else if (g.ourGoals < g.oppGoals) { resultEmoji = '❌'; resultColor = '#e74c3c'; }
                
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
                const oppStats = sumTeamStats(match.players?.[g.opponentId]);
                
                const ourShotsOT = g.ourGoals + oppStats.gkSaves;
                const oppShotsOT = g.oppGoals + ourStats.gkSaves;
                const mPassMade = ourStats.pm;
                const mPassAtt = ourStats.pa;
                const mPassAcc = mPassAtt > 0 ? ((mPassMade / mPassAtt) * 100).toFixed(0) : '?';
                const mTackMade = ourStats.tm;
                const mTackAtt = ourStats.ta;
                const mTackAcc = mTackAtt > 0 ? ((mTackMade / mTackAtt) * 100).toFixed(0) : '?';
                
                const totalPassAtt = mPassAtt + oppStats.pa;
                const estPoss = totalPassAtt > 0 ? ((mPassAtt / totalPassAtt) * 100).toFixed(0) : '?';
                const estOppPoss = totalPassAtt > 0 ? ((oppStats.pa / totalPassAtt) * 100).toFixed(0) : '?';
                const oppPassAcc = oppStats.pa > 0 ? ((oppStats.pm / oppStats.pa) * 100).toFixed(0) : '?';
                
                const dnfText = g.isDnf ? ` *(🔌 DNF min ${Math.floor(g.maxSecs / 60)})*` : '';
                
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
                        if (pAssists > 0) extras.push(`🎩${pAssists}`);
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
                    .setTitle(`${resultEmoji} ${club.eaClubName} ${g.ourGoals} - ${g.oppGoals} ${g.oppName}`)
                    .setDescription(`📅 ${matchDate} — 🕐 ${matchTime}h (Madrid)${dnfText}`)
                    .setColor(resultColor);
                
                if (g.isDnf) {
                    // En DNF las stats comparativas no son fiables
                    embed.addFields(
                        { name: '⚽ Posesión (est.)', value: `⚠️ *No disp. (DNF)*`, inline: true },
                        { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta)`, inline: true },
                        { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                        { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%)`, inline: true },
                        { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                        { name: '⚠️ DNF', value: `*Stats del rival no disp. por desconexión*`, inline: true }
                    );
                } else {
                    embed.addFields(
                        { name: '⚽ Posesión (est.)', value: `**${estPoss}%** vs ${estOppPoss}%`, inline: true },
                        { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta) vs ${oppStats.shots} (${oppShotsOT})`, inline: true },
                        { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                        { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%) vs ${oppPassAcc}%`, inline: true },
                        { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                        { name: '\u200B', value: '\u200B', inline: true }
                    );
                }
                
                if (lineupStr) {
                    embed.addFields({ name: '📋 Alineación y Rendimiento', value: lineupStr, inline: false });
                }
                
                entries.push(embed);
            }
        }

        const embeds = entries.slice(0, 5);
        
        return interaction.editReply({ content: `📜 **Últimos ${embeds.length} partidos de ${club.eaClubName}**${filterStr}:`, embeds });
    }
};
