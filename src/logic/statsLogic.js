import { EmbedBuilder } from 'discord.js';

export function getTournamentPlayersStats(tournament) {
    const allPlayers = {};

    const processMatch = (match) => {
        if (!match.eaStats) return;

        // Combinar jugadores del clubA y clubB
        const processClubPlayers = (clubPlayers, teamName, teamLogo) => {
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
                        mom: 0,
                        passesMade: 0,
                        passAttempts: 0,
                        tacklesMade: 0,
                        tackleAttempts: 0,
                        shots: 0,
                        teamName: teamName || 'Desconocido',
                        teamLogo: teamLogo || null
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
                tp.passesMade += pData.passesMade || 0;
                tp.passAttempts += pData.passAttempts || 0;
                tp.tacklesMade += pData.tacklesMade || 0;
                tp.tackleAttempts += pData.tackleAttempts || 0;
                tp.shots += pData.shots || 0;
                
                // Si el jugador juega en varios equipos (raro, pero posible en mix), nos quedamos con el último
                if (teamName) tp.teamName = teamName;
                if (teamLogo) tp.teamLogo = teamLogo;
            }
        };

        processClubPlayers(match.eaStats.clubA?.players, match.equipoA?.nombre, match.equipoA?.logoUrl);
        processClubPlayers(match.eaStats.clubB?.players, match.equipoB?.nombre, match.equipoB?.logoUrl);
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

// --- Categorización de posiciones ---
// EA envía texto genérico en inglés (forward, midfielder, defender, goalkeeper)
// o abreviaturas en español desde el sistema interno (POR, DFC, MC, DC, etc.)
// Esta función unifica ambos formatos en 5 categorías: GK, DEF, MED, CARR, DC
function categorizePosition(pos) {
    const p = (pos || '').toLowerCase().trim();

    // 1. Coincidencia exacta con abreviaturas en español (más preciso)
    const exactMap = {
        'por': 'GK', 'portero': 'GK',
        'dfc': 'DEF', 'ld': 'DEF', 'li': 'DEF', 'cad': 'DEF', 'cai': 'DEF',
        'mcd': 'MED', 'mc': 'MED', 'mco': 'MED',
        'md': 'CARR', 'mi': 'CARR',
        'ed': 'DC', 'ei': 'DC', 'mp': 'DC', 'dc': 'DC'
    };
    if (exactMap[p]) return exactMap[p];

    // 2. Coincidencia por texto en inglés (lo que envía EA en stats de partido)
    if (p.includes('goalkeeper') || p === 'gk') return 'GK';
    if (p.includes('defender') || p.includes('centerback') || p.includes('fullback')
        || p.includes('leftback') || p.includes('rightback')) return 'DEF';
    if (p.includes('lwb') || p.includes('rwb') || p.includes('wingback')) return 'CARR';
    if (p.includes('midfielder') || p.includes('midfield')) return 'MED';
    if (p.includes('forward') || p.includes('striker') || p.includes('winger')
        || p.includes('attacker')) return 'DC';

    // 3. Default: Medios (para no dejar a nadie fuera)
    return 'MED';
}

export function generateBest11Embed(tournament, players) {
    if (players.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle(`Mejor 11: ${tournament.nombre}`)
            .setDescription('No hay suficientes estadísticas de EA recopiladas en este torneo todavía.')
            .setColor('Red');
        return { embed, best11: { gk: [], defs: [], meds: [], carrs: [], dcs: [] } };
    }

    // Categorizar jugadores por posición usando el sistema robusto
    const gks = [];
    const defs = [];
    const meds = [];
    const carrs = [];
    const dcs = [];

    for (const p of players) {
        const category = categorizePosition(p.pos);
        switch (category) {
            case 'GK': gks.push(p); break;
            case 'DEF': defs.push(p); break;
            case 'MED': meds.push(p); break;
            case 'CARR': carrs.push(p); break;
            case 'DC': dcs.push(p); break;
        }
    }

    // Fórmulas de puntuación diferenciadas por línea
    const getGkScore = (p) => (p.avgRating * 3) + (p.cleanSheets * 3) - (p.goalsConceded * 0.5) + (p.saves * 0.2);
    const getDefScore = (p) => (p.avgRating * 3) + (p.cleanSheets * 2) + (p.goals * 0.5) + (p.assists * 0.5);
    const getMedScore = (p) => (p.avgRating * 2) + (p.assists * 1.5) + (p.goals * 1) + (p.mom * 1);
    const getCarrScore = (p) => (p.avgRating * 2) + (p.assists * 1.5) + (p.goals * 1) + (p.mom * 1);
    const getDcScore = (p) => (p.avgRating * 2) + (p.goals * 2) + (p.assists * 1) + (p.mom * 1);

    gks.sort((a, b) => getGkScore(b) - getGkScore(a));
    defs.sort((a, b) => getDefScore(b) - getDefScore(a));
    meds.sort((a, b) => getMedScore(b) - getMedScore(a));
    carrs.sort((a, b) => getCarrScore(b) - getCarrScore(a));
    dcs.sort((a, b) => getDcScore(b) - getDcScore(a));

    // Formación 3-5-2 (1 GK, 3 DEF, 3 MED, 2 CARR, 2 DC)
    const bestGk = gks.slice(0, 1);
    const bestDefs = defs.slice(0, 3);
    const bestMeds = meds.slice(0, 3);
    const bestDcs = dcs.slice(0, 2);
    
    let bestCarrs = carrs.slice(0, 2);
    
    // Fallback: Si no hay carrileros suficientes (por limitaciones de EA API), rellenar con los siguientes mejores DC o MED
    let remainingDcs = dcs.slice(2);
    let remainingMeds = meds.slice(3);
    while (bestCarrs.length < 2) {
        if (remainingDcs.length > 0) {
            bestCarrs.push(remainingDcs.shift());
        } else if (remainingMeds.length > 0) {
            bestCarrs.push(remainingMeds.shift());
        } else {
            break;
        }
    }

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
        .setDescription('Basado en los datos oficiales extraídos de EA Sports FC.\nFormación: **3-5-2** (1 GK, 3 DEF, 3 MED, 2 CARR, 2 DC)');

    // Awards Field
    let awardsText = '';
    if (mvp) awardsText += `🥇 **MVP del Torneo:** ${mvp.name} (⭐ ${mvp.avgRating.toFixed(1)})\n`;
    if (topScorer && topScorer.goals > 0) awardsText += `👟 **Bota de Oro:** ${topScorer.name} (${topScorer.goals} goles)\n`;
    if (topAssister && topAssister.assists > 0) awardsText += `🎯 **Máximo Asistente:** ${topAssister.name} (${topAssister.assists} asist.)\n`;
    if (zamora) awardsText += `🧤 **Guante de Oro:** ${zamora.name} (${zamora.cleanSheets} imbatidas)\n`;

    if (awardsText) {
        embed.addFields({ name: '🎖️ Galardones Individuales', value: awardsText });
    }

    // Best 11 Field - De arriba a abajo del campo
    embed.addFields(
        { 
            name: '⚽ Delanteros (DC)', 
            value: bestDcs.length > 0 ? bestDcs.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🏃 Carrileros (CARR)', 
            value: bestCarrs.length > 0 ? bestCarrs.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🪄 Medios (MED)', 
            value: bestMeds.length > 0 ? bestMeds.map(formatPlayer).join(' - ') : 'N/A',
            inline: false
        },
        { 
            name: '🛡️ Defensas (DEF)', 
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

    return { embed, best11: { gk: bestGk, defs: bestDefs, meds: bestMeds, carrs: bestCarrs, dcs: bestDcs }, awards: { mvp, topScorer, topAssister, zamora } };
}
