import { EmbedBuilder } from 'discord.js';
import { getDb } from '../../database.js';

export async function getTournamentPlayersStats(tournament) {
    const allPlayers = {};
    const teamMetadataCache = {}; // Cache para no saturar la BD
    const dbTest = getDb('test');

    const processMatch = (match) => {
        if (!match.eaStats) return;

        // Combinar jugadores del clubA y clubB
        const processClubPlayers = (clubPlayers, teamName, teamLogo, eaClubId) => {
            if (!clubPlayers) return;
            
            let finalName = teamName;
            let finalLogo = teamLogo;
            
            // Prioridad de logo: 1) Logo puesto por el manager en Discord, 2) Escudo EA Sports como fallback
            if (!finalLogo || finalLogo.includes('2M7540p.png') || finalLogo.includes('V4J2Fcf.png') || finalLogo.includes('default_logo')) {
                // Sin logo propio: intentar con el cache de la BD
                if (teamMetadataCache[eaClubId] && teamMetadataCache[eaClubId].logoUrl) {
                    finalLogo = teamMetadataCache[eaClubId].logoUrl;
                } else if (eaClubId) {
                    // Último recurso: escudo de EA Sports
                    finalLogo = `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${eaClubId}.png`;
                }
            }

            if (eaClubId && teamMetadataCache[eaClubId]) {
                // Si el nombre es muy simple, usar el de EA
                if (!teamName || teamName === 'Desconocido' || teamName === 'TMP') {
                    finalName = teamMetadataCache[eaClubId].name || teamName;
                }
            }

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
                        teamName: finalName || 'Desconocido',
                        teamLogo: finalLogo || null
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
                
                if (finalName) tp.teamName = finalName;
                if (finalLogo) tp.teamLogo = finalLogo;
            }
        };

        const eaClubIdA = match.equipoA?.eaClubId || (tournament.teams?.aprobados && tournament.teams.aprobados[match.equipoA?.id]?.eaClubId);
        const eaClubIdB = match.equipoB?.eaClubId || (tournament.teams?.aprobados && tournament.teams.aprobados[match.equipoB?.id]?.eaClubId);

        processClubPlayers(match.eaStats.clubA?.players, match.equipoA?.nombre, match.equipoA?.logoUrl, eaClubIdA);
        processClubPlayers(match.eaStats.clubB?.players, match.equipoB?.nombre, match.equipoB?.logoUrl, eaClubIdB);
    };

    // Pre-carga de metadatos desde test.teams para los eaClubId de los equipos del torneo
    if (tournament.teams?.aprobados) {
        const eaClubIds = Object.values(tournament.teams.aprobados).map(t => t.eaClubId).filter(id => id);
        if (eaClubIds.length > 0) {
            try {
                const teamsFromDb = await dbTest.collection('teams').find({ eaClubId: { $in: eaClubIds } }).toArray();
                for (const t of teamsFromDb) {
                    teamMetadataCache[t.eaClubId] = { logoUrl: t.logoUrl, name: t.eaClubName || t.name };
                }
            } catch (err) {
                console.error('[STATS LOGIC] Error buscando metadata de equipos en test.teams:', err);
            }
        }
    }

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
        'md': 'CARR', 'mi': 'CARR', 'carr': 'CARR',
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
    const getGkScore = (p) => (p.avgRating * 3) + (p.cleanSheets * 4) - (p.goalsConceded * 0.5) + (p.saves * 0.2);
    const getDefScore = (p) => (p.avgRating * 3) + (p.cleanSheets * 3) + (p.goals * 1) + (p.assists * 1);
    const getMedScore = (p) => (p.avgRating * 2) + (p.assists * 2) + (p.goals * 1.5) + (p.mom * 1);
    const getCarrScore = (p) => (p.avgRating * 2) + (p.cleanSheets * 2) + (p.assists * 2) + (p.goals * 1.5) + (p.mom * 1);
    const getDcScore = (p) => (p.avgRating * 2) + (p.goals * 3) + (p.assists * 1.5) + (p.mom * 1);

    gks.sort((a, b) => getGkScore(b) - getGkScore(a));
    defs.sort((a, b) => getDefScore(b) - getDefScore(a));
    meds.sort((a, b) => getMedScore(b) - getMedScore(a));
    carrs.sort((a, b) => getCarrScore(b) - getCarrScore(a));
    dcs.sort((a, b) => getDcScore(b) - getDcScore(a));

    // Calcular Premios Individuales primero para coherencia total
    const validPlayers = players.filter(p => p.gamesPlayed >= 1);
    const sortedByGoals = [...validPlayers].sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating);
    const topScorer = sortedByGoals[0];

    const sortedByAssists = [...validPlayers].sort((a, b) => b.assists - a.assists || b.avgRating - a.avgRating);
    const topAssister = sortedByAssists[0];

    const sortedByRating = [...validPlayers].sort((a, b) => b.avgRating - a.avgRating);
    const mvp = sortedByRating[0];

    // Portero menos goleado (Zamora) -> mínimo 1 partido, más clean sheets, menos goalsConceded
    const validGks = gks.filter(p => p.gamesPlayed >= 1);
    const sortedGks = [...validGks].sort((a, b) => {
        if (b.cleanSheets !== a.cleanSheets) return b.cleanSheets - a.cleanSheets;
        return a.goalsConceded - b.goalsConceded;
    });
    const zamora = sortedGks[0];

    // Formación 3-5-2 (1 GK, 3 DEF, 3 MED, 2 CARR, 2 DC)
    // El Zamora siempre es el portero del Mejor 11 si existe
    const bestGk = [zamora || gks[0]].filter(Boolean);

    // Asegurar que el Pichichi (Bota de Oro) esté en el Mejor 11
    if (topScorer && topScorer.goals > 0) {
        const topScorerCat = categorizePosition(topScorer.pos);
        if (topScorerCat === 'DC') {
            const idx = dcs.findIndex(p => p.name === topScorer.name);
            if (idx > -1) {
                dcs.splice(idx, 1);
                dcs.unshift(topScorer);
            }
        }
    }

    // Asegurar que el MVP esté en el Mejor 11 en su categoría
    if (mvp) {
        const mvpCat = categorizePosition(mvp.pos);
        if (mvpCat === 'MED') {
            const idx = meds.findIndex(p => p.name === mvp.name);
            if (idx > -1) {
                meds.splice(idx, 1);
                meds.unshift(mvp);
            }
        } else if (mvpCat === 'DC') {
            const idx = dcs.findIndex(p => p.name === mvp.name);
            if (idx > -1) {
                dcs.splice(idx, 1);
                dcs.unshift(mvp);
            }
        }
    }

    // Asegurar que el Máximo Asistente esté en el Mejor 11 si es MED
    if (topAssister && topAssister.assists > 0) {
        const astCat = categorizePosition(topAssister.pos);
        if (astCat === 'MED') {
            const idx = meds.findIndex(p => p.name === topAssister.name);
            if (idx > 2) {
                meds.splice(idx, 1);
                meds.splice(1, 0, topAssister);
            }
        }
    }

    const bestDefs = defs.slice(0, 3);

    // Ajuste puntual solicitado para blitz-289-g11: sustituir a Enekko por zzRaydenzz con sus estadísticas
    if (tournament.shortId === 'blitz-289-g11') {
        const enekkoIdx = bestDefs.findIndex(p => p.name?.toLowerCase().includes('enekko'));
        if (enekkoIdx > -1) {
            bestDefs[enekkoIdx] = {
                ...bestDefs[enekkoIdx],
                name: 'zzRaydenzz'
            };
        }
    }
    const bestMeds = meds.slice(0, 3);
    const bestDcs = dcs.slice(0, 2);
    
    let bestCarrs = carrs.slice(0, 2);
    
    // Fallback: Si no hay carrileros suficientes, rellenar con los siguientes mejores DC o MED
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

    const formatPlayer = (p) => `**${p.name}** (⭐ ${p.avgRating.toFixed(1)})`;

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Reporte Estadístico: ${tournament.nombre}`)
        .setColor('#FFD700') // Dorado
        .setDescription('Basado en los datos oficiales extraídos de EA Sports FC.\nFormación: **3-5-2** (1 GK, 3 DEF, 3 MED, 2 CARR, 2 DC)');

    // Awards Field
    let awardsText = '';
    if (mvp) awardsText += `🥇 **MVP del Torneo:** ${mvp.name} (⭐ ${mvp.avgRating.toFixed(1)})\n`;
    if (topScorer && topScorer.goals > 0) awardsText += `👟 **Bota de Oro:** ${topScorer.name} (${topScorer.goals} goles)\n`;
    if (topAssister && topAssister.assists > 0) awardsText += `🎩 **Máximo Asistente:** ${topAssister.name} (${topAssister.assists} asist.)\n`;
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
