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

export async function inviteUserToMatchThread(interaction, team) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    if (!team.coCaptainId) {
        return interaction.editReply({ content: 'Tu equipo no tiene un co-capitán asignado.' });
    }
    
    const thread = interaction.channel;
    if (!thread.isThread()) {
        return interaction.editReply({ content: 'Esta acción solo se puede usar dentro de un hilo de partido.' });
    }

    try {
        await thread.members.add(team.coCaptainId);
        await interaction.editReply({ content: `✅ <@${team.coCaptainId}> ha sido invitado a este hilo.` });
    } catch (error) {
        console.error(`Error al invitar al co-capitán ${team.coCaptainId} al hilo ${thread.id}:`, error);
        await interaction.editReply({ content: '❌ No se pudo invitar al co-capitán. Es posible que ya esté en el hilo.' });
    }
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

        const addMemberIfReal = async (memberId) => {
            if (memberId && /^\d+$/.test(memberId)) {
                await thread.members.add(memberId).catch(e => console.warn(`No se pudo añadir al miembro ${memberId} al hilo: ${e.message}`));
            }
        };

        await Promise.all([
            addMemberIfReal(partido.equipoA.capitanId),
            addMemberIfReal(partido.equipoB.capitanId),
            addMemberIfReal(partido.equipoA.coCaptainId),
            addMemberIfReal(partido.equipoB.coCaptainId)
        ]);
        
        // --- INICIO DE LA CORRECCIÓN: INVITAR ÁRBITROS ---
        try {
            const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID);
            if (arbitroRole) {
                for (const member of arbitroRole.members.values()) {
                    await thread.members.add(member.id).catch(() => {});
                }
            }
        } catch (e) {
            console.error("Error al buscar el rol de árbitro o al invitar a sus miembros al hilo:", e);
        }
        // --- FIN DE LA CORRECCIÓN ---

        let mentions = [];
        if (partido.equipoA.capitanId && /^\d+$/.test(partido.equipoA.capitanId)) mentions.push(`<@${partido.equipoA.capitanId}>`);
        if (partido.equipoB.capitanId && /^\d+$/.test(partido.equipoB.capitanId)) mentions.push(`<@${partido.equipoB.capitanId}>`);
        if (partido.equipoA.coCaptainId && /^\d+$/.test(partido.equipoA.coCaptainId)) mentions.push(`<@${partido.equipoA.coCaptainId}>`);
        if (partido.equipoB.coCaptainId && /^\d+$/.test(partido.equipoB.coCaptainId)) mentions.push(`<@${partido.equipoB.coCaptainId}>`);
        
        const mentionString = mentions.length > 0 ? mentions.join(' y ') : 'No se pudieron mencionar a los capitanes (equipos de prueba).';

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
            new ButtonBuilder().setCustomId(`admin_modify_result_start:${partido.matchId}:${tournamentShortId}`).setLabel("Admin: Forzar Resultado").setStyle(ButtonStyle.Secondary).setEmoji("✍️"),
            new ButtonBuilder().setCustomId(`invite_to_thread:${partido.matchId}:${tournamentShortId}`).setLabel("Invitar al Hilo").setStyle(ButtonStyle.Secondary).setEmoji("🤝")
        );
        
        await thread.send({ content: mentionString, embeds: [embed], components: [row1, row2] });
        
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
