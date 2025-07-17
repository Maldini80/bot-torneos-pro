// src/logic/translationLogic.js
import { translate } from '@vitalets/google-translate-api';
import { languageRoles } from '../../config.js';

/**
 * Maneja la traducción de un mensaje si el autor tiene un rol de idioma.
 * @param {import('discord.js').Message} message - El mensaje a procesar.
 */
export async function handleMessageTranslation(message) {
    try {
        const authorMember = message.member;
        if (!authorMember) return;

        let sourceLang = '';
        let hasLangRole = false;

        for (const flag in languageRoles) {
            const roleInfo = languageRoles[flag];
            const role = message.guild.roles.cache.find(r => r.name === roleInfo.name);
            if (role && authorMember.roles.cache.has(role.id)) {
                sourceLang = roleInfo.code;
                hasLangRole = true;
                break;
            }
        }

        if (!hasLangRole) return;

        const targetLangCodes = new Set();
        const membersToTranslateFor = message.channel.isThread()
            ? await message.channel.members.fetch().then(coll => coll.map(m => m))
            : message.channel.members.map(m => m);

        for (const member of membersToTranslateFor) {
            for (const flag in languageRoles) {
                const roleInfo = languageRoles[flag];
                const role = message.guild.roles.cache.find(r => r.name === roleInfo.name);
                if (role && member.roles.cache.has(role.id) && roleInfo.code !== sourceLang) {
                    targetLangCodes.add(roleInfo.code);
                }
            }
        }

        if (targetLangCodes.size === 0) return;

        const translationEmbeds = [];
        for (const targetCode of targetLangCodes) {
            try {
                const { text } = await translate(message.content, { to: targetCode });
                const flag = Object.keys(languageRoles).find(f => languageRoles[f].code === targetCode);
                translationEmbeds.push({
                    description: `${flag} *${text}*`,
                    color: 0x5865F2,
                });
            } catch (translateError) {
                console.warn(`[WARN] No se pudo traducir al idioma ${targetCode}:`, translateError.message);
            }
        }
        
        if (translationEmbeds.length > 0) {
            await message.reply({
                embeds: translationEmbeds,
                allowedMentions: { repliedUser: false }
            });
        }

    } catch (error) {
        if (error.code === 10003 || error.code === 50001) { 
             console.warn(`[WARN] No se pudo procesar la traducción en el canal ${message.channel.id}.`);
        } else {
             console.error('[ERROR DE TRADUCCIÓN]', error);
        }
    }
}```
*   Baja y haz clic en **"Commit new file"**.

#### **2. Archivo: `src/logic/tournamentLogic.js`**
*(Este es el archivo más importante. Contiene todas las reglas de los torneos)*

*   Ahora, vuelve a la carpeta `src` y entra en la carpeta `logic` que acabas de crear.
*   Haz clic en **"Add file"** -> **"Create new file"**.
*   Nombra el archivo: **`tournamentLogic.js`**
*   **Pega el siguiente código completo**:
```javascript
// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName } from '../utils/panelManager.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType } from 'discord.js';

/**
 * Crea un nuevo torneo en la base de datos y prepara los canales y mensajes.
 */
export async function createNewTournament(client, guild, name, shortId, config) {
    const db = getDb();
    const format = TOURNAMENT_FORMATS[config.formatId];
    if (!format) throw new Error('Formato de torneo inválido.');

    const newTournament = {
        _id: new ObjectId(),
        shortId: shortId,
        guildId: guild.id,
        nombre: name,
        status: 'inscripcion_abierta',
        config: {
            formatId: config.formatId, format: format, isPaid: config.isPaid,
            prizeCampeon: config.prizeCampeon || 0, prizeFinalista: config.prizeFinalista || 0,
            enlacePaypal: config.enlacePaypal || null,
        },
        teams: { pendientes: {}, aprobados: {} },
        structure: { grupos: {}, calendario: {}, eliminatorias: {} },
        discordMessageIds: {
            statusMessageId: null, matchThreadsParentId: null, teamListMessageId: null,
            classificationMessageId: null, calendarMessageId: null
        }
    };

    const matchThreadsParent = await guild.channels.create({
        name: `⚔️-partidos-${shortId}`,
        type: ChannelType.GuildText,
        parent: TOURNAMENT_CATEGORY_ID,
    });
    newTournament.discordMessageIds.matchThreadsParentId = matchThreadsParent.id;

    const statusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
    const statusMsg = await statusChannel.send(createTournamentStatusEmbed(newTournament));
    newTournament.discordMessageIds.statusMessageId = statusMsg.id;

    const equiposChannel = await client.channels.fetch(CHANNELS.CAPITANES_INSCRITOS);
    const teamListMsg = await equiposChannel.send(createTeamListEmbed(newTournament));
    newTournament.discordMessageIds.teamListMessageId = teamListMsg.id;
    
    const clasificacionChannel = await client.channels.fetch(CHANNELS.CLASIFICACION);
    const classificationMsg = await clasificacionChannel.send({ embeds: [new EmbedBuilder().setTitle(`📊 Clasificación / Ranking - ${name}`).setDescription('El torneo aún no ha comenzado.')] });
    newTournament.discordMessageIds.classificationMessageId = classificationMsg.id;

    const calendarioChannel = await client.channels.fetch(CHANNELS.CALENDARIO);
    const calendarMsg = await calendarioChannel.send({ embeds: [new EmbedBuilder().setTitle(`🗓️ Calendario / Schedule - ${name}`).setDescription('El calendario se publicará aquí.')] });
    newTournament.discordMessageIds.calendarMessageId = calendarMsg.id;

    await db.collection('tournaments').insertOne(newTournament);
    console.log(`[INFO] Nuevo torneo "${name}" creado y anunciado.`);
    return newTournament;
}

/**
 * Realiza el sorteo de grupos para un torneo.
 */
export async function startGroupStage(client, guild, tournament) {
    if (tournament.status !== 'inscripcion_abierta') return;
    tournament.status = 'fase_de_grupos';
    const format = tournament.config.format;
    let teams = Object.values(tournament.teams.aprobados);
    for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[teams[i], teams[j]] = [teams[j], teams[i]]; }
    const grupos = {}, numGrupos = format.groups, tamanoGrupo = format.size / numGrupos;
    for (let i = 0; i < teams.length; i++) {
        const grupoIndex = Math.floor(i / tamanoGrupo), nombreGrupo = `Grupo ${String.fromCharCode(65 + grupoIndex)}`;
        if (!grupos[nombreGrupo]) grupos[nombreGrupo] = { equipos: [] };
        teams[i].stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 };
        grupos[nombreGrupo].equipos.push(teams[i]);
    }
    tournament.structure.grupos = grupos;
    const calendario = {};
    for (const nombreGrupo in grupos) {
        const equiposGrupo = grupos[nombreGrupo].equipos;
        calendario[nombreGrupo] = [];
        if (equiposGrupo.length === 4) {
            const [t1, t2, t3, t4] = equiposGrupo;
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, t1, t2), createMatchObject(nombreGrupo, 1, t3, t4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, t1, t3), createMatchObject(nombreGrupo, 2, t2, t4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, t1, t4), createMatchObject(nombreGrupo, 3, t2, t3));
        }
    }
    tournament.structure.calendario = calendario;
    for (const nombreGrupo in calendario) {
        for (const partido of calendario[nombreGrupo].filter(p => p.jornada === 1)) {
            const threadId = await createMatchThread(client, guild, partido, tournament);
            partido.threadId = threadId;
            partido.status = 'en_curso';
        }
    }
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    await updatePublicMessages(client, tournament);
    await updateTournamentChannelName(client);
    console.log(`[INFO] Sorteo realizado para el torneo: ${tournament.nombre}`);
}

/**
 * Aprueba un equipo, lo mueve de pendiente a aprobado y actualiza la UI.
 */
export async function approveTeam(client, tournament, teamData) {
    if (!tournament.teams.aprobados) tournament.teams.aprobados = {};
    tournament.teams.aprobados[teamData.capitanId] = teamData;
    if (tournament.teams.pendientes[teamData.capitanId]) delete tournament.teams.pendientes[teamData.capitanId];
    
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    await updatePublicMessages(client, tournament);
    
    const teamCount = Object.keys(tournament.teams.aprobados).length;
    if (teamCount === tournament.config.format.size) {
        console.log(`[INFO] ¡Cupo lleno para ${tournament.nombre}! Iniciando sorteo.`);
        const guild = await client.guilds.fetch(tournament.guildId);
        await startGroupStage(client, guild, tournament);
    }
}

/**
 * Finaliza un torneo, actualizando su estado y limpiando mensajes.
 */
export async function endTournament(client, tournament) {
    tournament.status = 'finalizado';
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    await updatePublicMessages(client, tournament);
    await updateTournamentChannelName(client);
    try {
        const clasificacionChannel = await client.channels.fetch(CHANNELS.CLASIFICACION);
        const classificationMessage = await clasificacionChannel.messages.fetch(tournament.discordMessageIds.classificationMessageId);
        await classificationMessage.delete();
        const calendarioChannel = await client.channels.fetch(CHANNELS.CALENDARIO);
        const calendarMessage = await calendarioChannel.messages.fetch(tournament.discordMessageIds.calendarMessageId);
        await calendarMessage.delete();
    } catch(e) {
        console.warn(`[WARN] No se pudieron borrar los mensajes de un torneo finalizado: ${tournament.nombre}`);
    }
}

/**
 * Actualiza todos los mensajes públicos asociados a un torneo.
 */
export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState) return;

    const updateTasks = [
        client.channels.fetch(CHANNELS.TORNEOS_STATUS).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.statusMessageId).then(m => m.edit(createTournamentStatusEmbed(latestTournamentState)))),
        client.channels.fetch(CHANNELS.CAPITANES_INSCRITOS).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.teamListMessageId).then(m => m.edit(createTeamListEmbed(latestTournamentState)))),
    ];
    if (latestTournamentState.status !== 'inscripcion_abierta') {
        updateTasks.push(client.channels.fetch(CHANNELS.CLASIFICACION).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.classificationMessageId).then(m => m.edit(createClassificationEmbed(latestTournamentState)))));
        updateTasks.push(client.channels.fetch(CHANNELS.CALENDARIO).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.calendarMessageId).then(m => m.edit(createCalendarEmbed(latestTournamentState)))));
    }
    
    await Promise.all(updateTasks).catch(e => console.warn(`[WARN] Falla parcial al actualizar mensajes públicos para ${latestTournamentState.nombre}: ${e.message}`));
}
