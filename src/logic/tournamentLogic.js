// src/utils/tournamentUtils.js
import { ChannelType } from 'discord.js';
import { ARBITRO_ROLE_ID } from '../../config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

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
    // ... (Tu código para crear el hilo es correcto) ...
    // Asegúrate de que los customId de los botones son los correctos:
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`report_result_start_${partido.matchId}_${tournament.shortId}`).setLabel("Reportar Resultado").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder().setCustomId(`request_referee_${partido.matchId}_${tournament.shortId}`).setLabel("Solicitar Arbitraje").setStyle(ButtonStyle.Danger).setEmoji("⚠️"),
            new ButtonBuilder().setCustomId(`admin_modify_result_start_${partido.matchId}_${tournament.shortId}`).setLabel("Admin: Forzar Resultado").setStyle(ButtonStyle.Secondary).setEmoji("✍️")
        );
    // ... (El resto de tu código es correcto)
}

// ¡Función clave adaptada de tu index1.txt!
export async function updateMatchThreadName(client, partido, tournament) {
    if (!partido.threadId) return;
    try {
        const thread = await client.channels.fetch(partido.threadId);
        if (!thread) return;

        // Limpia el nombre actual de iconos y resultados previos
        const cleanBaseName = thread.name.replace(/^[⚔️✅⚠️]-/g, '').replace(/-\d+a\d+$/, '');
        
        let icon;
        if (partido.status === 'finalizado') icon = '✅';
        else if (partido.status === 'arbitraje') icon = '⚠️'; // Si implementas arbitraje
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
        if (err.code !== 10003) { // Ignorar error de "Canal Desconocido"
            console.error(`Error al renombrar hilo ${partido.threadId}:`, err); 
        }
    }
}
