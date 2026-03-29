import { getDb } from '../../database.js';
import { getLeagueByElo } from './eloLogic.js';
import { LEAGUE_ORDER } from './eloLogic.js';

/**
 * Parsea una lista de WhatsApp para extraer equipos.
 * Formato esperado: "1. Nombre Equipo - @usuarioDiscord" o similar.
 * @param {string} rawText - El texto pegado
 * @returns {Array<{index: number, teamName: string, discordUser: string, rawLine: string}>}
 */
export function parseWhatsAppList(rawText) {
    const lines = rawText.split('\n');
    const parsedTeams = [];
    let index = 1;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Intentar parsear líneas como "1. Nombre del Equipo - @usuario"
        // o "1- Nombre del Equipo (premier)"
        // Quitamos números y puntos/guiones iniciales
        let cleanLine = line.replace(/^\d+[\.\-\)]\s*/, '').trim();

        // Buscar si hay un usuario de twitter/discord o notas adicionales al final
        let teamName = cleanLine;
        let extrainfo = "";
        
        // Separador común '-' o '('
        const splitMatch = cleanLine.match(/^(.*?)([\-\(].*)$/);
        if (splitMatch) {
            teamName = splitMatch[1].trim();
            extrainfo = splitMatch[2].trim();
        }

        if (teamName) {
            parsedTeams.push({
                index: index++,
                teamName: teamName,
                extraInfo: extrainfo,
                rawLine: line
            });
        }
    }

    return parsedTeams;
}

/**
 * Normaliza nombres de equipos para mejorar las comparaciones.
 */
function normalizeTeamName(name) {
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/\b(esports|e-sports|fc|cf|club|team|gaming)\b/gi, '') // Quitar palabras comunes
        .replace(/[^a-z0-9]/g, '') // Dejar solo alfanuméricos
        .trim();
}

/**
 * Busca cada equipo en la BD con fuzzy matching.
 * @param {Array} parsedTeams
 * @param {string} guildId
 * @returns {Promise<{ matched: Array<{parsed, dbTeam}>, unmatched: Array<{parsed}> }>}
 */
export async function matchTeamsToDatabase(parsedTeams, guildId) {
    const testDb = getDb('test');
    
    // Obtener todos los equipos de este guild una sola vez para hacer la búsqueda in-memory
    const allDbTeams = await testDb.collection('teams').find({ guildId }).toArray();
    
    // Pre-calcular nombre normalizado para búsquedas rápidas
    const dbTeamsNormalized = allDbTeams.map(t => ({
        ...t,
        searchName: normalizeTeamName(t.name)
    }));

    const matched = [];
    const unmatched = [];

    for (const parsed of parsedTeams) {
        const parsedSearchName = normalizeTeamName(parsed.teamName);
        
        let foundDbTeam = null;

        // Nivel 1: Búsqueda exacta normalizada (es la más segura)
        foundDbTeam = dbTeamsNormalized.find(t => t.searchName === parsedSearchName);

        // Nivel 2: "Empieza por" o "Contiene" si el nombre limpio es lo suficientemente largo
        if (!foundDbTeam && parsedSearchName.length >= 4) {
             foundDbTeam = dbTeamsNormalized.find(t => 
                t.searchName.startsWith(parsedSearchName) || 
                parsedSearchName.startsWith(t.searchName) ||
                t.searchName.includes(parsedSearchName)
            );
        }

        if (foundDbTeam) {
            matched.push({
                parsed: parsed,
                dbTeam: foundDbTeam
            });
        } else {
            unmatched.push({ parsed: parsed });
        }
    }

    return { matched, unmatched };
}

/**
 * Distribuye los equipos matched entre torneos activos gratuitos.
 * @param {Array} matchedTeams
 * @param {Array} activeTournaments
 * @param {number} maxPerTournament
 */
export function distributeByElo(matchedTeams, activeTournaments, maxPerTournament) {
    // Calculamos el ELO y liga de todos antes de ordenar
    const teamsWithElo = matchedTeams.map(m => {
        const elo = m.dbTeam.elo || 1000;
        const league = m.dbTeam.league || getLeagueByElo(elo);
        return {
            ...m,
            elo,
            league
        };
    });

    // Ordenar por ELO descendente (los mejores primero)
    teamsWithElo.sort((a, b) => b.elo - a.elo);

    const assignments = new Map(); // tournamentId -> Array of teams
    for (const t of activeTournaments) {
        assignments.set(t.shortId, []);
    }
    const overflow = [];

    // Recorremos cada equipo y tratamos de meterlo en un torneo que admita su liga
    // y que no haya superado maxPerTournament.
    for (const team of teamsWithElo) {
        let assigned = false;
        
        for (const tourney of activeTournaments) {
            const tourneyAssignments = assignments.get(tourney.shortId);
            
            // Ya está lleno (por el límite de "max de esta distribución")
            if (tourneyAssignments.length >= maxPerTournament) continue;

            // Restricción de liga
            const allowsLeague = !tourney.config.allowedLeagues || 
                                 tourney.config.allowedLeagues.length === 0 || 
                                 tourney.config.allowedLeagues.includes(team.league);
            
            if (allowsLeague) {
                // Verificar si ya está en el torneo desde antes por si acaso (aunque es para nuevos)
                // Se asume que estos son torneos nuevos o se debe saltar si ya está
                const alreadyInAprobados = tourney.teams?.aprobados?.[team.dbTeam.managerId] != null;
                const alreadyInPendientes = tourney.teams?.pendientes?.[team.dbTeam.managerId] != null;
                
                if (!alreadyInAprobados && !alreadyInPendientes) {
                    tourneyAssignments.push(team);
                    assigned = true;
                    break;
                }
            }
        }

        if (!assigned) {
            overflow.push(team);
        }
    }

    return { assignments, overflow };
}
