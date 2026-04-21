import { EmbedBuilder } from 'discord.js';

export function getTournamentPlayersStats(tournament) {
    const allPlayers = {};

    const processMatch = (match) => {
        if (!match.eaStats) return;

        // Combinar jugadores del clubA y clubB
        const processClubPlayers = (clubPlayers) => {
            if (!clubPlayers) return;
            for (const [pName, pData] of Object.entries(clubPlayers)) {
                if (!allPlayers[pName]) {
                    allPlayers[pName] = {
                        name: pData.name,
                        pos: pData.pos.toLowerCase(),
                        goals: 0,
                        assists: 0,
                        ratingSum: 0,
                        saves: 0,
                        gamesPlayed: 0,
                        cleanSheets: 0,
                        goalsConceded: 0,
                        mom: 0
                    };
                }
                const tp = allPlayers[pName];
                tp.goals += pData.goals || 0;
                tp.assists += pData.assists || 0;
                tp.ratingSum += pData.ratingSum || 0;
                tp.saves += pData.saves || 0;
                tp.gamesPlayed += pData.gamesPlayed || 0;
                tp.cleanSheets += pData.cleanSheets || 0;
                tp.goalsConceded += pData.goalsConceded || 0;
                tp.mom += pData.mom || 0;
            }
        };

        processClubPlayers(match.eaStats.clubA?.players);
        processClubPlayers(match.eaStats.clubB?.players);
    };

    // Procesar grupos
    if (tournament.structure?.calendario) {
        for (const group of Object.values(tournament.structure.calendario)) {
            for (const match of group) {
                processMatch(match);
            }
        }
    }

    // Procesar eliminatorias
    if (tournament.structure?.eliminatorias) {
        for (const [stageKey, stageData] of Object.entries(tournament.structure.eliminatorias)) {
            if (stageKey === 'rondaActual') continue;
            if (Array.isArray(stageData)) {
                for (const match of stageData) {
                    processMatch(match);
                }
            } else if (stageData) {
                processMatch(stageData);
            }
        }
    }

    // Calcular promedio de rating
    for (const tp of Object.values(allPlayers)) {
        if (tp.gamesPlayed > 0) {
            tp.avgRating = tp.ratingSum / tp.gamesPlayed;
        } else {
            tp.avgRating = 0;
        }
    }

    return Object.values(allPlayers);
}

export function generateBest11Embed(tournament, players) {
    if (players.length === 0) {
        return new EmbedBuilder()
            .setTitle(`Mejor 11: ${tournament.nombre}`)
            .setDescription('No hay suficientes estadísticas de EA recopiladas en este torneo todavía.')
            .setColor('Red');
    }

    // Categorizar jugadores por posición
    const gks = [];
    const defs = [];
    const centralMids = [];
    const wideMids = [];
    const fwds = [];

    for (const p of players) {
        const pos = p.pos || '';
        if (pos.includes('goalkeeper') || pos.includes('gk') || pos === 'portero') {
            gks.push(p);
        } else if (pos.includes('defender') || pos.includes('cb') || pos.includes('lb') || pos.includes('rb')) {
            // Laterales puros (LB/RB) suelen considerarse defensas en EA, a menos que jueguen LWB/RWB
            defs.push(p);
        } else if (pos.includes('lwb') || pos.includes('rwb') || pos.includes('lm') || pos.includes('rm')) {
            // Carrileros y bandas
            wideMids.push(p);
        } else if (pos.includes('midfielder') || pos.includes('cm') || pos.includes('cam') || pos.includes('cdm')) {
            // Medios centros (Ofensivos o defensivos)
            centralMids.push(p);
        } else if (pos.includes('forward') || pos.includes('st') || pos.includes('rw') || pos.includes('lw') || pos.includes('cf')) {
            // Delanteros y extremos ofensivos
            fwds.push(p);
        } else {
            // Default
            centralMids.push(p);
        }
    }

    // Sistema de puntuación para ordenar
    const getScore = (p) => {
        return (p.avgRating * 2) + (p.goals * 1) + (p.assists * 0.5) + (p.mom * 1);
    };

    gks.sort((a, b) => getScore(b) - getScore(a));
    defs.sort((a, b) => getScore(b) - getScore(a));
    centralMids.sort((a, b) => getScore(b) - getScore(a));
    wideMids.sort((a, b) => getScore(b) - getScore(a));
    fwds.sort((a, b) => getScore(b) - getScore(a));

    // Formación 3-5-2 (1 GK, 3 DEF, 2 Bandas, 3 Medios, 2 FWD)
    const bestGk = gks.slice(0, 1);
    const bestDefs = defs.slice(0, 3);
    const bestWideMids = wideMids.slice(0, 2);
    const bestCentralMids = centralMids.slice(0, 3);
    const bestFwds = fwds.slice(0, 2);

    // Si faltan jugadores para la formación, rellenar (con fallbacks)
    while (bestDefs.length < 3 && defs.length > bestDefs.length) bestDefs.push(defs[bestDefs.length]);
    while (bestWideMids.length < 2 && wideMids.length > bestWideMids.length) bestWideMids.push(wideMids[bestWideMids.length]);
    while (bestCentralMids.length < 3 && centralMids.length > bestCentralMids.length) bestCentralMids.push(centralMids[bestCentralMids.length]);
    while (bestFwds.length < 2 && fwds.length > bestFwds.length) bestFwds.push(fwds[bestFwds.length]);

    // Calcular Premios Individuales
    const validPlayers = players.filter(p => p.gamesPlayed >= 1); // Mínimo de partidos
    const sortedByGoals = [...validPlayers].sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating);
    const topScorer = sortedByGoals[0];

    const sortedByAssists = [...validPlayers].sort((a, b) => b.assists - a.assists || b.avgRating - a.avgRating);
    const topAssister = sortedByAssists[0];

    const sortedByRating = [...validPlayers].sort((a, b) => b.avgRating - a.avgRating);
    const mvp = sortedByRating[0];

    // Portero menos goleado (Zamora) -> mínimo 1 partido, más clean sheets, menos goalsConceded
    const validGks = gks.filter(p => p.gamesPlayed >= 1);
    const sortedGks = [...validGks].sort((a, b) => {
        // Orden: Clean sheets DESC, Goals Conceded ASC
        if (b.cleanSheets !== a.cleanSheets) return b.cleanSheets - a.cleanSheets;
        return a.goalsConceded - b.goalsConceded;
    });
    const zamora = sortedGks[0];

    const formatPlayer = (p) => `**${p.name}** (⭐ ${p.avgRating.toFixed(1)})`;

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Reporte Estadístico: ${tournament.nombre}`)
        .setColor('#FFD700') // Dorado
        .setDescription('Basado en los datos oficiales extraídos de EA Sports FC.');

    // Awards Field
    let awardsText = '';
    if (mvp) awardsText += `🥇 **MVP del Torneo:** ${mvp.name} (⭐ ${mvp.avgRating.toFixed(1)})\n`;
    if (topScorer && topScorer.goals > 0) awardsText += `👟 **Bota de Oro:** ${topScorer.name} (${topScorer.goals} goles)\n`;
    if (topAssister && topAssister.assists > 0) awardsText += `🎯 **Máximo Asistente:** ${topAssister.name} (${topAssister.assists} asist.)\n`;
    if (zamora) awardsText += `🧤 **Guante de Oro:** ${zamora.name} (${zamora.cleanSheets} imbatidas)\n`;

    if (awardsText) {
        embed.addFields({ name: '🎖️ Galardones Individuales', value: awardsText });
    }

    // Best 11 Field
    embed.addFields(
        { 
            name: '⚽ Delanteros (FWD)', 
            value: bestFwds.length > 0 ? bestFwds.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🪄 Medios Centros (CM/CAM/CDM)', 
            value: bestCentralMids.length > 0 ? bestCentralMids.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🏃 Carrileros y Bandas (LM/RM/LWB/RWB)', 
            value: bestWideMids.length > 0 ? bestWideMids.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🛡️ Defensas Centrales y Laterales (CB/LB/RB)', 
            value: bestDefs.length > 0 ? bestDefs.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🧤 Portero (GK)', 
            value: bestGk.length > 0 ? bestGk.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        }
    );

    embed.setFooter({ text: 'Sistema Oficial VPG - Powered by EA Sports', iconURL: 'https://i.imgur.com/Qk9z9Xk.png' });
    embed.setTimestamp();

    return embed;
}
