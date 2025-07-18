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

export async function createMatchThread(client, guild, partido, tournament) {
    const parentChannel = await client.channels.fetch(tournament.discordMessageIds.matchThreadsParentId).catch(() => null);
    if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
        console.error(`[ERROR] El canal padre para hilos del torneo ${tournament.nombre} no existe.`);
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
            reason: `Partido de torneo: ${tournament.nombre}`
        });

        const memberPromises = [
            thread.members.add(partido.equipoA.capitanId),
            thread.members.add(partido.equipoB.capitanId)
        ].map(p => p.catch(e => console.warn(`No se pudo añadir un capitán al hilo: ${e.message}`)));
        
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (arbitroRole) {
            arbitroRole.members.forEach(member => {
                memberPromises.push(thread.members.add(member.id).catch(() => {}));
            });
        }
        
        await Promise.all(memberPromises);
        
        // NUEVO: Añadido el nombre del equipo en EAFC al embed.
        const embed = new EmbedBuilder().setColor('#3498db').setTitle(`Partido: ${partido.equipoA.nombre} vs ${partido.equipoB.nombre}`)
            .setDescription(`${description}\n\n**Nombres en EAFC / EAFC Names:**\n- ${partido.equipoA.nombre}: \`${partido.equipoA.eafcTeamName}\`\n- ${partido.equipoB.nombre}: \`${partido.equipoB.eafcTeamName}\`\n\n🇪🇸 Usad este hilo para coordinar y jugar. Cuando terminéis, usad los botones.\n🇬🇧 *Use this thread to coordinate and play. When you finish, use the buttons.*`);
        
        // NUEVO: Añadido el botón de Highlights
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`report_result_start_${partido.matchId}_${tournament.shortId}`).setLabel("Reportar Resultado").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder().setCustomId(`upload_highlight_start_${partido.matchId}_${tournament.shortId}`).setLabel("Subir Highlights").setStyle(ButtonStyle.Success).setEmoji("✨"),
            new ButtonBuilder().setCustomId(`request_referee_${partido.matchId}_${tournament.shortId}`).setLabel("Solicitar Arbitraje").setStyle(ButtonStyle.Danger).setEmoji("⚠️"),
            new ButtonBuilder().setCustomId(`admin_modify_result_start_${partido.matchId}_${tournament.shortId}`).setLabel("Admin: Forzar Resultado").setStyle(ButtonStyle.Secondary).setEmoji("✍️")
        );

        await thread.send({ content: `<@${partido.equipoA.capitanId}> y <@${partido.equipoB.capitanId}>`, embeds: [embed], components: [buttons] });
        
        return thread.id;
    } catch (error) {
        console.error(`[ERROR FATAL] No se pudo crear el hilo del partido para ${tournament.nombre}.`, error);
        return null;
    }
}

export async function updateMatchThreadName(client, partido) {
    if (!partido.threadId) return;
    try {
        const thread = await client.channels.fetch(partido.threadId);
        if (!thread) return;

        // No cambiar el icono si está en arbitraje
        if (thread.name.startsWith('⚠️')) return;

        const cleanBaseName = thread.name.replace(/^[⚔️✅⚠️]-/g, '').replace(/-\d+a\d+$/, '');
        
        let icon;
        if (partido.status === 'finalizado') icon = '✅';
        else icon = '⚔️';
        
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
    const allMatchesInGroup = tournament.structure.calendario[completedMatch.nombreGrupo];
    const nextJornadaNum = completedMatch.jornada + 1;

    if (!allMatchesInGroup.some(p => p.jornada === nextJornadaNum)) return;

    const teamsInCompletedMatch = [completedMatch.equipoA.id, completedMatch.equipoB.id];

    for (const teamId of teamsInCompletedMatch) {
        const nextMatch = allMatchesInGroup.find(p => 
            p.jornada === nextJornadaNum && 
            (p.equipoA.id === teamId || p.equipoB.id === teamId)
        );

        if (!nextMatch || nextMatch.threadId) continue;

        const opponentId = nextMatch.equipoA.id === teamId ? nextMatch.equipoB.id : nextMatch.equipoA.id;
        const opponentCurrentMatch = allMatchesInGroup.find(p => 
            p.jornada === completedMatch.jornada &&
            (p.equipoA.id === opponentId || p.equipoB.id === opponentId)
        );

        if (opponentCurrentMatch && opponentCurrentMatch.status === 'finalizado') {
            console.log(`[THREAD CREATION] Creando hilo para J${nextMatch.jornada}: ${nextMatch.equipoA.nombre} vs ${nextMatch.equipoB.nombre}`);
            
            const threadId = await createMatchThread(client, guild, nextMatch, tournament);
            
            const matchIndex = tournament.structure.calendario[nextMatch.nombreGrupo].findIndex(m => m.matchId === nextMatch.matchId);
            if(matchIndex > -1) {
                await db.collection('tournaments').updateOne(
                    { _id: tournament._id },
                    { 
                        $set: { 
                            [`structure.calendario.${nextMatch.nombreGrupo}.${matchIndex}.threadId`]: threadId,
                            [`structure.calendario.${nextMatch.nombreGrupo}.${matchIndex}.status`]: 'en_curso'
                        } 
                    }
                );
            }
        }
    }
}
