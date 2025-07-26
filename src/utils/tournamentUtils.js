// src/utils/tournamentUtils.js
import { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ARBITRO_ROLE_ID } from '../../config.js';
import { getDb } from '../../database.js';

export function createMatchObject(nombreGrupo, jornada, equipoA, equipoB) {
    const cleanEquipoA = JSON.parse(JSON.stringify(equipoA));
    const cleanEquipoB = JSON.parse(JSON.stringify(equipoB));

    return {
        matchId: `match_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        nombreGrupo, jornada, equipoA: cleanEquipoA, equipoB: cleanEquipoB,
        resultado: null, reportedScores: {}, status: 'pendiente', threadId: null
    };
}

export async function createMatchThread(client, guild, partido, parentChannelId, tournamentShortId) {
    const parentChannel = await client.channels.fetch(parentChannelId).catch(() => null);
    if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
        console.error(`[ERROR] El canal padre para hilos con ID ${parentChannelId} no existe.`);
        return null;
    }

    const safeTeamA = partido.equipoA.nombre.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 10);
    const safeTeamB = partido.equipoB.nombre.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 10);
    let threadName, description;

    if (partido.nombreGrupo) {
        const groupLetter = partido.nombreGrupo.replace('Grupo ', '');
        threadName = `⚔️-g${groupLetter}-j${partido.jornada}-${safeTeamA}-vs-${safeTeamB}`.toLowerCase();
        description = `**${partido.nombreGrupo} - Jornada ${partido.jornada}**`;
    } else {
        const stage = partido.jornada;
        threadName = `⚔️-${stage}-${safeTeamA}-vs-${safeTeamB}`.toLowerCase();
        description = `**Fase Eliminatoria - ${stage}** / **Knockout Stage - ${stage}**`;
    }

    try {
        const thread = await parentChannel.threads.create({
            name: threadName.slice(0, 100),
            autoArchiveDuration: 10080,
            type: ChannelType.PrivateThread,
            reason: `Partido de torneo: ${tournamentShortId}`
        });

        const memberPromises = [
            thread.members.add(partido.equipoA.capitanId),
            thread.members.add(partido.equipoB.capitanId)
        ].map(p => p.catch(e => console.warn(`No se pudo añadir un capitán al hilo: ${e.message}`)));
        
        // --- INICIO DE LA MODIFICACIÓN ---
        // Se añaden también los co-capitanes a la lista de promesas si existen
        if (partido.equipoA.coCaptainId) {
            memberPromises.push(thread.members.add(partido.equipoA.coCaptainId).catch(e => console.warn(`No se pudo añadir al co-capitán ${partido.equipoA.coCaptainId} al hilo: ${e.message}`)));
        }
        if (partido.equipoB.coCaptainId) {
            memberPromises.push(thread.members.add(partido.equipoB.coCaptainId).catch(e => console.warn(`No se pudo añadir al co-capitán ${partido.equipoB.coCaptainId} al hilo: ${e.message}`)));
        }
        // --- FIN DE LA MODIFICACIÓN ---

        await Promise.all(memberPromises);
        
        const embed = new EmbedBuilder().setColor('#3498db').setTitle(`Partido: ${partido.equipoA.nombre} vs ${partido.equipoB.nombre}`)
            .setDescription(`${description}\n\n🇪🇸 **Equipo Visitante:** ${partido.equipoB.nombre}\n**Nombre EAFC:** \`${partido.equipoB.eafcTeamName}\`\n\n🇬🇧 **Away Team:** ${partido.equipoB.nombre}\n**EAFC Name:** \`${partido.equipoB.eafcTeamName}\`\n\n*El equipo local (${partido.equipoA.nombre}) debe buscar e invitar al equipo visitante.*`);
        
        const footerText = '🇪🇸 Para subir una prueba, usa el botón o pega un enlace de YouTube/Twitch.\n' +
                           '🇬🇧 To upload proof, use the button or paste a YouTube/Twitch link.';
        embed.setFooter({ text: footerText });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`report_result_start:${partido.matchId}:${tournamentShortId}`).setLabel("Reportar Resultado").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder()
                .setLabel('Prueba de altura perks')
                .setURL('https://streamable.com')
                .setStyle(ButtonStyle.Link)
                .setEmoji('📹')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`request_referee:${partido.matchId}:${tournamentShortId}`).setLabel("Solicitar Arbitraje").setStyle(ButtonStyle.Danger).setEmoji("⚠️"),
            new ButtonBuilder().setCustomId(`admin_modify_result_start:${partido.matchId}:${tournamentShortId}`).setLabel("Admin: Forzar Resultado").setStyle(ButtonStyle.Secondary).setEmoji("✍️")
        );

        // --- INICIO DE LA MODIFICACIÓN ---
        // Construcción dinámica de menciones para incluir co-capitanes
        let mentions = [`<@${partido.equipoA.capitanId}>`, `<@${partido.equipoB.capitanId}>`];
        if (partido.equipoA.coCaptainId) {
            mentions.push(`<@${partido.equipoA.coCaptainId}>`);
        }
        if (partido.equipoB.coCaptainId) {
            mentions.push(`<@${partido.equipoB.coCaptainId}>`);
        }
        
        await thread.send({ content: mentions.join(' y '), embeds: [embed], components: [row1, row2] });
        // --- FIN DE LA MODIFICACIÓN ---
        
        return thread.id;
    } catch (error) {
        console.error(`[ERROR FATAL] No se pudo crear el hilo del partido para el torneo ${tournamentShortId}.`, error);
        return null;
    }
}

export async function updateMatchThreadName(client, partido) {
    if (!partido.threadId) return;
    try {
        const thread = await client.channels.fetch(partido.threadId);
        if (!thread) return;

        if (thread.name.startsWith('⚠️')) return;

        const cleanBaseName = thread.name.replace(/^[⚔️✅⚠️]-/g, '').replace(/-\d+a\d+$/, '');
        
        let icon;
        if (partido.status === 'finalizado') {
            icon = '✅';
        } else {
            icon = '⚔️';
        }
        
        let newName = `${icon}-${cleanBaseName}`;
        if (partido.status === 'finalizado' && partido.resultado) {
             const resultString = partido.resultado.replace(/-/g, 'a');
             newName = `${newName}-${resultString}`;
        }
        
        if (thread.name !== newName) {
            await thread.setName(newName.slice(0, 100));
        }
    } catch(err) {
        if (err.code !== 10003) {
            console.error(`Error al renombrar hilo ${partido.threadId}:`, err); 
        }
    }
}

export async function checkAndCreateNextRoundThreads(client, guild, tournament, completedMatch) {
    if (!completedMatch.nombreGrupo) return;
    const db = getDb();
    let currentTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    const allMatchesInGroup = currentTournamentState.structure.calendario[completedMatch.nombreGrupo];
    const nextJornadaNum = completedMatch.jornada + 1;
    if (!allMatchesInGroup.some(p => p.jornada === nextJornadaNum)) return;
    const teamsInCompletedMatch = [completedMatch.equipoA.id, completedMatch.equipoB.id];
    for (const teamId of teamsInCompletedMatch) {
        const nextMatch = allMatchesInGroup.find(p => p.jornada === nextJornadaNum && (p.equipoA.id === teamId || p.equipoB.id === teamId));
        if (!nextMatch || nextMatch.threadId) continue;
        const opponentId = nextMatch.equipoA.id === teamId ? nextMatch.equipoB.id : nextMatch.equipoA.id;
        const opponentCurrentMatch = allMatchesInGroup.find(p => p.jornada === completedMatch.jornada && (p.equipoA.id === opponentId || p.equipoB.id === opponentId));
        if (opponentCurrentMatch && opponentCurrentMatch.status === 'finalizado') {
            const threadId = await createMatchThread(client, guild, nextMatch, currentTournamentState.discordChannelIds.matchesChannelId, currentTournamentState.shortId);
            const matchIndex = allMatchesInGroup.findIndex(m => m.matchId === nextMatch.matchId);
            if(matchIndex > -1) {
                await db.collection('tournaments').updateOne( { _id: tournament._id }, { $set: { [`structure.calendario.${nextMatch.nombreGrupo}.${matchIndex}.threadId`]: threadId, [`structure.calendario.${nextMatch.nombreGrupo}.${matchIndex}.status`]: 'en_curso' } } );
            }
        }
    }
}
