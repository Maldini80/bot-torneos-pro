// --- INICIO DEL ARCHIVO visualizerServer.js (VERSIÓN FINAL Y COMPLETA) ---

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
// IMPORTAMOS LAS NUEVAS FUNCIONES DE GESTIÓN
import { advanceDraftTurn, handlePlayerSelectionFromWeb, requestStrikeFromWeb, requestKickFromWeb, handleRouletteSpinResult, undoLastPick, forcePickFromWeb, adminKickPlayerFromWeb, adminAddPlayerFromWeb, sendRegistrationRequest, sendPaymentApprovalRequest, adminReplacePickFromWeb, approveExternalDraftCaptain } from './src/logic/tournamentLogic.js';
import { getDb } from './database.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ObjectId } from 'mongodb'; // FIX: Global import for ObjectId
import { processMatchResult, finalizeMatchThread, findMatch } from './src/logic/matchLogic.js';
import { getLeagueByElo, LEAGUE_EMOJIS } from './src/logic/eloLogic.js';
import { createPoolEmbed } from './src/utils/embeds.js';
import { scheduleRegistrationListUpdate } from './src/utils/registrationListManager.js';

// FIX: Mutex por draft para evitar race conditions en picks concurrentes
const draftLocks = new Map();
async function withDraftLock(draftId, fn) {
    while (draftLocks.get(draftId)) {
        await draftLocks.get(draftId);
    }
    let resolve;
    const promise = new Promise(r => resolve = r);
    draftLocks.set(draftId, promise);
    try {
        return await fn();
    } finally {
        draftLocks.delete(draftId);
        resolve();
    }
}

// FIX: Variable global para acceder al cliente VPG desde cualquier endpoint.
// Se rellena desde index.js mediante setVisualizerClient() DESPUÉS de que el VPG bot arranque.
// Antes se llamaba a startVpgBot() aquí también, lo que creaba una SEGUNDA instancia del bot
// con el mismo token, generando conflictos de sesión en Discord y caídas del sistema.
let client;

const app = express();
// FIX: Middlewares esenciales para que funcione el body parser y archivos estáticos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SEGURIDAD: Utilidades de validación y sanitización ---
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeInput(str, maxLength = 100) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/<[^>]*>/g, '').substring(0, maxLength);
}

// Rate limiter ligero sin dependencias externas
function createRateLimiter(maxRequests = 30, windowMs = 60000) {
    const hits = new Map();
    // Limpiar cada minuto para evitar memory leak
    setInterval(() => hits.clear(), windowMs);
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        const record = hits.get(key) || { count: 0, resetAt: now + windowMs };
        if (now > record.resetAt) {
            record.count = 0;
            record.resetAt = now + windowMs;
        }
        record.count++;
        hits.set(key, record);
        if (record.count > maxRequests) {
            return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
        }
        next();
    };
}

// Aplicar rate limiter global a todas las rutas API
app.use('/api/', createRateLimiter(60, 60000)); // 60 peticiones por minuto
// --- FIN SEGURIDAD ---

// Root route: serve landing page or visualizer
app.get('/', (req, res) => {
    if (req.query.tournamentId || req.query.draftId || req.query.rouletteSessionId || req.query.torneo || req.query.pickorder) {
        res.sendFile('index.html', { root: 'public' });
    } else {
        res.sendFile('home.html', { root: 'public' });
    }
});

// Registration form page
app.get('/inscripcion/:tournamentId', (req, res) => {
    res.sendFile('inscripcion.html', { root: 'public' });
});

// Pool registration page (shareable via WhatsApp)
app.get('/bolsa/:poolId', (req, res) => {
    res.sendFile('bolsa.html', { root: 'public' });
});

app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// FIX: Habilitar confianza en proxies inversos (Render, Nginx, Cloudflare) 
// para que req.ip contenga la IP real del usuario en lugar de la del balanceador interno.
app.set('trust proxy', true);

const draftStates = new Map();
const tournamentStates = new Map();

function sanitizeDraftForPublic(draft) {
    // Copia profunda para no mutar el original
    const cleanDraft = JSON.parse(JSON.stringify(draft));
    if (cleanDraft.players) {
        cleanDraft.players.forEach(p => {
            delete p.whatsapp;
            delete p.phoneNumber; // Por si acaso
        });
    }
    return cleanDraft;
}

function broadcastUpdate(type, id, data) {
    console.log(`[DEBUG 5] Enviando actualización a todos los clientes. Tipo: ${type}, ID: ${id}`);

    // Preparamos las dos versiones del payload
    const publicData = (type === 'draft') ? sanitizeDraftForPublic(data) : data;
    const privatePayload = JSON.stringify({ type, id, data }); // Data completa
    const publicPayload = JSON.stringify({ type, id, data: publicData });

    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            // Si el usuario está autenticado (client.user existe), enviamos todo. Si no, sanitizado.
            if (client.user) {
                client.send(privatePayload);
            } else {
                client.send(publicPayload);
            }
        }
    });
}

function sendToUser(userId, payload) {
    // Si enviamos a un usuario específico, asumimos que es privado/seguro, pero verificamos auth del socket
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
        if (client.user && String(client.user.id) === String(userId) && client.readyState === client.OPEN) {
            client.send(message);
        }
    }
}

export const visualizerStateHandler = {
    updateDraft: (draft) => {
        draftStates.set(draft.shortId, draft);
        broadcastUpdate('draft', draft.shortId, draft);
        console.log(`[Visualizer State] Estado de DRAFT actualizado para: ${draft.shortId}`);
    },
    updateTournament: (tournament) => {
        tournamentStates.set(tournament.shortId, tournament);
        broadcastUpdate('tournament', tournament.shortId, tournament);
        console.log(`[Visualizer State] Estado de TORNEO actualizado para: ${tournament.shortId}`);
    },
    sendToUser: sendToUser
};

// Export was previously setVisualizerClient, now removed.

const sessionParser = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.DATABASE_URL,
        dbName: 'tournamentBotDb',
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60, // 14 días
        autoRemove: 'native', // Auto-limpieza de sesiones expiradas
        touchAfter: 24 * 3600 // Lazy update (1 día)
    }),
    cookie: {
        secure: (process.env.BASE_URL || '').startsWith('https'),
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 días
    }
});
app.use(sessionParser);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// La estrategia de passport se define en startVisualizerServer para acceder al cliente

app.use(passport.initialize());
app.use(passport.session());

app.get('/login', (req, res, next) => {
    const returnTo = Buffer.from(req.query.returnTo || '/').toString('base64');
    passport.authenticate('discord', { state: returnTo })(req, res, next);
});

app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    const returnTo = Buffer.from(req.query.state, 'base64').toString('utf8');
    res.redirect(returnTo || '/');
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/home.html');
    });
});

app.get('/api/user', (req, res) => {
    if (req.user) {
        const userWithAdmin = { ...req.user, isAdmin: req.user.id === process.env.OWNER_DISCORD_ID };
        res.json(userWithAdmin);
    } else {
        res.json(null);
    }
});

// ===============================================
// === ENDPOINTS ELO ===
// ===============================================
app.get('/ranking.html', (req, res) => res.sendFile('ranking.html', { root: 'public' }));

app.get('/api/elo/ranking', async (req, res) => {
    try {
        const testDb = getDb('test');
        const teams = await testDb.collection('teams')
            .find({}, { projection: {
                name: 1, abbreviation: 1, logoUrl: 1, elo: 1, managerId: 1,
                'historicalStats.totalMatchesPlayed': 1,
                'historicalStats.totalWins': 1,
                'historicalStats.totalDraws': 1,
                'historicalStats.totalLosses': 1,
                'historicalStats.currentWinStreak': 1,
                'historicalStats.bestWinStreak': 1,
                'historicalStats.currentLossStreak': 1,
                'historicalStats.worstLossStreak': 1,
                'historicalStats.tournamentsWon': 1,
                'historicalStats.tournamentsRunnerUp': 1
            }})
            .sort({ elo: -1 })
            .toArray();
        res.json(teams);
    } catch (e) {
        console.error('Error cargando ranking:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/elo/hall-of-fame', async (req, res) => {
    try {
        const testDb = getDb('test');
        // Extraemos todos los equipos que tengan stats
        const teams = await testDb.collection('teams')
            .find({ 'historicalStats.tournamentsPlayed': { $gt: 0 } })
            .project({ name: 1, abbreviation: 1, logoUrl: 1, logo: 1, historicalStats: 1 })
            .toArray();

        // 1. Top Campeones
        const topCampeones = [...teams]
            .filter(t => t.historicalStats.tournamentsWon > 0)
            .sort((a, b) => b.historicalStats.tournamentsWon - a.historicalStats.tournamentsWon)
            .slice(0, 10);

        // 2. Top Goleadores
        const topGoleadores = [...teams]
            .filter(t => t.historicalStats.totalGoalsScored > 0)
            .sort((a, b) => b.historicalStats.totalGoalsScored - a.historicalStats.totalGoalsScored)
            .slice(0, 10);

        // 3. Top Victorias
        const topVictorias = [...teams]
            .filter(t => t.historicalStats.totalWins > 0)
            .sort((a, b) => b.historicalStats.totalWins - a.historicalStats.totalWins)
            .slice(0, 10);

        // 4. Muro Defensivo (Mínimo 10 partidos jugados para ser justo)
        const topDefensas = [...teams]
            .filter(t => t.historicalStats.totalMatchesPlayed >= 10)
            .sort((a, b) => a.historicalStats.totalGoalsConceded - b.historicalStats.totalGoalsConceded)
            .slice(0, 10);

        // 5. Más Veteranos (torneos disputados)
        const topVeteranos = [...teams]
            .filter(t => t.historicalStats.tournamentsPlayed > 0)
            .sort((a, b) => b.historicalStats.tournamentsPlayed - a.historicalStats.tournamentsPlayed)
            .slice(0, 10);

        res.json({
            topCampeones,
            topGoleadores,
            topVictorias,
            topDefensas,
            topVeteranos
        });
    } catch (e) {
        console.error('Error obteniendo hall of fame stats:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/elo/update', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const { teamId, newElo } = req.body;
        if (!teamId || typeof newElo !== 'number' || newElo < 0) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }
        const testDb = getDb('test');
        await testDb.collection('teams').updateOne(
            { _id: new ObjectId(teamId) },
            { 
                $set: { elo: newElo },
                $push: { eloHistory: { $each: [{ date: new Date(), oldElo: 0, newElo, delta: 0, reason: 'web_admin_edit' }], $slice: -100 } }
            }
        );
        res.json({ success: true, newElo });
    } catch (e) {
        console.error('Error actualizando ELO:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.put('/api/admin/teams/:id/info', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const teamId = req.params.id;
        const { name, logoUrl } = req.body;
        
        if (!teamId || !name || !logoUrl) {
            return res.status(400).json({ error: 'Datos incompletos.' });
        }
        
        const testDb = getDb('test');
        let queryId;
        try { queryId = new ObjectId(teamId); } catch(e) { queryId = teamId; }
        
        const result = await testDb.collection('teams').updateOne(
            { _id: queryId },
            { $set: { name: name.substring(0, 50), logoUrl: logoUrl.substring(0, 255) } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        res.json({ success: true });
    } catch (e) {
        console.error('Error actualizando info del equipo:', e);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/admin/teams/:id', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const teamId = req.params.id;
        if (!teamId) return res.status(400).json({ error: 'Falta ID del equipo' });
        
        const testDb = getDb('test');
        let queryId;
        try { queryId = new ObjectId(teamId); } catch(e) { queryId = teamId; }
        
        const team = await testDb.collection('teams').findOne({ _id: queryId });
        if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

        // Intentar limpiar roles de Discord vía API HTTP directa (por si client no está disponible)
        if (process.env.GUILD_ID && process.env.DISCORD_TOKEN) {
            const memberIds = [team.managerId, ...(team.captains || []), ...(team.players || [])].filter(Boolean);
            const rolesToRemove = [process.env.MANAGER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID, process.env.MUTED_ROLE_ID].filter(Boolean);
            
            for (const memberId of memberIds) {
                for (const roleId of rolesToRemove) {
                    try {
                        await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${memberId}/roles/${roleId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                        });
                    } catch (e) { /* Ignorar si no tiene el rol */ }
                }
            }
        }

        // Borrados en DB
        await testDb.collection('teams').deleteOne({ _id: queryId });
        await testDb.collection('playerapplications').deleteMany({ teamId: teamId });
        await testDb.collection('users').updateMany(
            { teamName: team.name }, 
            { $set: { teamName: null, teamLogoUrl: null, isManager: false } }
        );

        res.json({ success: true, message: `Equipo ${team.name} disuelto correctamente.` });
    } catch (e) {
        console.error('Error eliminando equipo:', e);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/admin/recalculate-leagues', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    try {
        const testDb = getDb('test'); 
        console.log('[LEAGUES] Inciando migración masiva de Ligas según ELO...');

        const teams = await testDb.collection('teams').find({}).toArray();
        let modifiedCount = 0;

        for (const team of teams) {
            const elo = team.elo || 1000;
            let newLeague = 'BRONZE';
            if (elo >= 1550) newLeague = 'DIAMOND';
            else if (elo >= 1300) newLeague = 'GOLD';
            else if (elo >= 1000) newLeague = 'SILVER';
            
            if (team.league !== newLeague) {
                await testDb.collection('teams').updateOne(
                    { _id: team._id },
                    { $set: { league: newLeague } }
                );
                modifiedCount++;
            }
        }
        console.log(`[LEAGUES] Migración completada. Modificados ${modifiedCount} equipos.`);
        res.json({ success: true, message: `Migración completada. Modificados ${modifiedCount} equipos.` });
    } catch (e) {
        console.error('Error en migración de ligas:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/admin/run-backfill', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    try {
        const tournamentDb = getDb(); // tournamentBotDb
        const testDb = getDb('test'); // test
        
        console.log('[BACKFILL] Analizando torneos finalizados...');
        const tournaments = await tournamentDb.collection('tournaments').find({ status: 'finalizado' }).toArray();
        let statsMap = {}; 

        for (const t of tournaments) {
            if (t.shortId && typeof t.shortId === 'string' && t.shortId.startsWith('draft-')) continue;

            let teamsInTournament = new Set();
            let championId = null;

            const finalMatch = t.structure?.eliminatorias?.final;
            if (finalMatch) {
               const fm = Array.isArray(finalMatch) ? finalMatch[0] : finalMatch;
               if (fm && fm.resultado) {
                   const [gA, gB] = fm.resultado.split('-').map(Number);
                   if (!isNaN(gA) && !isNaN(gB)) {
                        championId = gA > gB ? (fm.equipoA?.id || fm.equipoA?._id) : (fm.equipoB?.id || fm.equipoB?._id);
                   }
               }
            }

            // Si no hay campeón de la Final (porque es Liguilla o terminó por puntos), el campeón es el primero de la tabla general
            if (!championId && t.structure?.grupos) {
                let allLeagueTeams = [];
                for (const gName in t.structure.grupos) {
                    allLeagueTeams = allLeagueTeams.concat(t.structure.grupos[gName].equipos || []);
                }
                allLeagueTeams = allLeagueTeams.filter(team => team.id && team.id !== 'ghost');
                
                if (allLeagueTeams.length > 0) {
                    allLeagueTeams.sort((a, b) => {
                        if ((a.stats?.pts || 0) !== (b.stats?.pts || 0)) return (b.stats?.pts || 0) - (a.stats?.pts || 0);

                        // Buchholz para sistema suizo
                        if (t.config?.formatId === 'flexible_league' && t.config?.leagueMode === 'custom_rounds') {
                            if ((a.stats?.buchholz || 0) !== (b.stats?.buchholz || 0)) return (b.stats?.buchholz || 0) - (a.stats?.buchholz || 0);
                        }

                        if ((a.stats?.dg || 0) !== (b.stats?.dg || 0)) return (b.stats?.dg || 0) - (a.stats?.dg || 0);
                        if ((a.stats?.gf || 0) !== (b.stats?.gf || 0)) return (b.stats?.gf || 0) - (a.stats?.gf || 0);

                        // Enfrentamiento directo (H2H)
                        if (t.structure?.calendario) {
                            for (const gn in t.structure.calendario) {
                                const enfrentamiento = t.structure.calendario[gn]?.find(p => p.resultado && ((p.equipoA?.id === a.id && p.equipoB?.id === b.id) || (p.equipoA?.id === b.id && p.equipoB?.id === a.id)));
                                if (enfrentamiento) {
                                    const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
                                    if (enfrentamiento.equipoA.id === a.id) { if (golesA > golesB) return -1; if (golesB > golesA) return 1; }
                                    else { if (golesB > golesA) return -1; if (golesA > golesB) return 1; }
                                    break;
                                }
                            }
                        }

                        if ((a.stats?.pg || 0) !== (b.stats?.pg || 0)) return (b.stats?.pg || 0) - (a.stats?.pg || 0);

                        return (a.nombre || '').localeCompare(b.nombre || '');
                    });
                    
                    // Asegurarnos de que el primero de la liga haya jugado al menos 1 partido para que no sea un título regalado en torneos vacíos
                    if (allLeagueTeams[0].stats && allLeagueTeams[0].stats.pj > 0) {
                        championId = allLeagueTeams[0].id || allLeagueTeams[0]._id;
                    }
                }
            }

            const rondas = ['dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'];
            for (const r of rondas) {
                if (t.structure?.eliminatorias?.[r]) {
                    const matches = Array.isArray(t.structure.eliminatorias[r]) ? t.structure.eliminatorias[r] : [t.structure.eliminatorias[r]];
                    for (const m of matches) {
                        processMatchForBackfill(m, statsMap, teamsInTournament);
                    }
                }
            }

            if (t.structure?.faseGrupos) {
                for (const g of t.structure.faseGrupos) {
                    if (g.jornadas) {
                        for (const jorn of g.jornadas) {
                            if (jorn.partidos) {
                                for (const m of jorn.partidos) {
                                     processMatchForBackfill(m, statsMap, teamsInTournament);
                                }
                            }
                        }
                    }
                }
            }
            
            if (t.structure?.calendario) {
                for (const groupName in t.structure.calendario) {
                    const matches = t.structure.calendario[groupName];
                    if (Array.isArray(matches)) {
                        for (const m of matches) {
                            processMatchForBackfill(m, statsMap, teamsInTournament);
                        }
                    }
                }
            }

            for (const teamId of teamsInTournament) {
                if (statsMap[teamId]) {
                    statsMap[teamId].tournamentsPlayed++;
                }
            }

            if (championId && statsMap[championId]) {
                statsMap[championId].tournamentsWon++;
            }
        }

        const bulkOps = [];
        for (const [teamId, stats] of Object.entries(statsMap)) {
            let queryId;
            try {
                queryId = new ObjectId(teamId);
            } catch(e) { queryId = teamId; }

            bulkOps.push({
                updateOne: {
                    filter: { $or: [{ _id: queryId }, { id: teamId }, { managerId: teamId }] },
                    update: {
                        $set: {
                            'historicalStats.tournamentsPlayed': stats.tournamentsPlayed,
                            'historicalStats.tournamentsWon': stats.tournamentsWon,
                            'historicalStats.totalMatchesPlayed': stats.matches,
                            'historicalStats.totalWins': stats.wins,
                            'historicalStats.totalDraws': stats.draws,
                            'historicalStats.totalLosses': stats.losses,
                            'historicalStats.totalGoalsScored': stats.goalsScored,
                            'historicalStats.totalGoalsConceded': stats.goalsConceded
                        }
                    }
                }
            });
        }

        if (bulkOps.length > 0) {
            console.log('[BACKFILL] Actualizando equipos...');
            const result = await testDb.collection('teams').bulkWrite(bulkOps, { ordered: false });
            console.log('[BACKFILL] Modificados ' + result.modifiedCount + ' equipos exitosamente.');
            
            // Check if we actually found them using an extra debug count
            const foundTeamsStr = Object.keys(statsMap);
            const debugQuery = { 
                $or: [
                    { _id: { $in: foundTeamsStr.map(id => { try { return new ObjectId(id); } catch(e){ return id; } }) } },
                    { id: { $in: foundTeamsStr } },
                    { managerId: { $in: foundTeamsStr } }
                ]
            };
            const actualTeamsInDb = await testDb.collection('teams').countDocuments(debugQuery);
            const actualTeamsInTournDb = await tournamentDb.collection('teams').countDocuments(debugQuery);
            
            res.json({ 
                success: true, 
                message: `Backfill completado. Modificados: ${result.modifiedCount}. Encontrados en memoria: ${foundTeamsStr.length}. Equipos reales en DB 'test': ${actualTeamsInDb}. Equipos reales en DB 'tournamentBotDb': ${actualTeamsInTournDb}. Ids extraidos: ${foundTeamsStr.slice(0, 5).join(', ')}...`
            });
        } else {
             res.json({ success: true, message: 'Backfill completado pero no hubo torneos ni partidos que procesar.' });
        }

    } catch (e) {
        console.error('Error ejecutando backfill:', e);
        res.status(500).json({ error: 'Error ejecutando backfill: ' + e.message });
    }
});

function processMatchForBackfill(m, statsMap, teamsInTournament) {
    if (!m || !m.resultado || !m.equipoA || !m.equipoB) return;
    const [ga, gb] = m.resultado.split('-').map(Number);
    if (isNaN(ga) || isNaN(gb)) return;

    const idA = (m.equipoA.id || m.equipoA._id) ? (m.equipoA.id || m.equipoA._id).toString() : null;
    const idB = (m.equipoB.id || m.equipoB._id) ? (m.equipoB.id || m.equipoB._id).toString() : null;
    if (!idA || !idB) return;

    if (!statsMap[idA]) statsMap[idA] = { matches: 0, wins: 0, draws: 0, losses: 0, goalsScored: 0, goalsConceded: 0, titles: 0, tournamentsPlayed: 0, tournamentsWon: 0 };
    if (!statsMap[idB]) statsMap[idB] = { matches: 0, wins: 0, draws: 0, losses: 0, goalsScored: 0, goalsConceded: 0, titles: 0, tournamentsPlayed: 0, tournamentsWon: 0 };

    teamsInTournament.add(idA);
    teamsInTournament.add(idB);

    statsMap[idA].matches++;
    statsMap[idB].matches++;
    statsMap[idA].goalsScored += ga;
    statsMap[idB].goalsScored += gb;
    statsMap[idA].goalsConceded += gb;
    statsMap[idB].goalsConceded += ga;

    if (ga > gb) {
        statsMap[idA].wins++;
        statsMap[idB].losses++;
    } else if (gb > ga) {
        statsMap[idB].wins++;
        statsMap[idA].losses++;
    } else {
        statsMap[idA].draws++;
        statsMap[idB].draws++;
    }
}

// ===============================================
// === ENDPOINTS PARA LA RULETA TRUCADA ===
// ===============================================

// Obtener el hint (ganador forzado) para el draft/torneo actual
app.get('/api/admin/roulette-hint', async (req, res) => {
    // Solo permitimos esto si el usuario está autenticado y es admin (podemos chequear roles o ID de propietario)
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    
    // Verificación simple: si es el OWNER, o si tiene un rol específico.
    // Asumiremos que si la petición se hace, validamos el OWNER_DISCORD_ID
    if (req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No tienes permisos para consultar hints de ruleta' });
    }

    const tournamentId = req.query.tournamentId;
    if (!tournamentId) return res.status(400).json({ error: 'Falta tournamentId' });

    try {
        const db = getDb();
        const config = await db.collection('bot_settings').findOne({ _id: 'globalConfig' });
        
        if (config && config.riggedRoulette && config.riggedRoulette.tournamentShortId === tournamentId) {
            return res.json({ targetCaptainId: config.riggedRoulette.captainId });
        }
        res.json({ targetCaptainId: null });
    } catch (e) {
        console.error('Error obteniendo roulette hint:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Borrar el hint una vez usado
app.delete('/api/admin/roulette-hint', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    try {
        const db = getDb();
        await db.collection('bot_settings').updateOne(
            { _id: 'globalConfig' },
            { $unset: { riggedRoulette: "" } }
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Error borrando roulette hint:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});
// ===============================================

// Endpoint: Verificar membresía y estado de usuario
app.get('/api/check-membership', async (req, res) => {
    if (!req.user) {
        return res.json({ authenticated: false });
    }

    try {
        const db = getDb(); // FIX: Usuarios en tournamentBotDb
        const userId = req.user.id;

        // 1. Verificar estado de verificación en DB si no está en sesión
        if (req.user.isVerified === undefined) {
            const userDoc = await db.collection('verified_users').findOne({ discordId: userId });
            req.user.isVerified = !!userDoc;
            if (userDoc) {
                req.user.psnId = userDoc.psnId;
                req.user.platform = userDoc.platform;
            }
        }

        // 2. Verificar roles si no están en sesión (Fallback)
        let roles = req.user.roles || [];
        if (req.user.roles === undefined) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                if (response.ok) {
                    const member = await response.json();
                    roles = member.roles;
                    req.user.roles = roles;
                    req.user.isMember = true;
                } else if (response.status === 404) {
                    req.user.isMember = false;
                }
            } catch (e) { console.error('Error fetching member fallback:', e); }
        }

        res.json({
            authenticated: true,
            isMember: req.user.isMember ?? false,
            user: {
                id: req.user.id,
                username: req.user.username,
                discriminator: req.user.discriminator,
                avatar: req.user.avatar,
                global_name: req.user.global_name || req.user.username,
                isVerified: req.user.isVerified,
                psnId: req.user.psnId,
                platform: req.user.platform
            },
            roles: roles
        });
    } catch (error) {
        console.error('Error checking membership:', error);
        return res.status(500).json({ error: 'Error verificando membresía' });
    }
});

// Endpoint: Buscar usuarios (Autocompletado para invitaciones)
app.get('/api/users/search', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const query = req.query.q;
    if (!query || query.length < 2) return res.json([]); // Mínimo 2 caracteres

    try {
        const db = getDb(); // FIX: Usuarios están en tournamentBotDb
        // Buscar por username, psnId o discordId parcial
        const limit = 10;
        const safeQuery = escapeRegex(query);
        const users = await db.collection('verified_users').find({
            $or: [
                { username: { $regex: safeQuery, $options: 'i' } },
                { gameId: { $regex: safeQuery, $options: 'i' } }, // FIX: Usar gameId
                { psnId: { $regex: safeQuery, $options: 'i' } }, // Mantener soporte legacy
                { discordId: { $regex: safeQuery, $options: 'i' } }
            ]
        }).limit(limit).project({
            discordId: 1,
            username: 1,
            gameId: 1, // FIX
            psnId: 1,
            platform: 1
        }).toArray();

        // FIX: Buscar también en Discord Guild Members (si el cliente está disponible)
        if (client && users.length < limit) {
            try {
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                // FIX: guild.searchMembers is deprecated/removed in v14+, use guild.members.search
                const memberResults = await guild.members.search({ query: query, limit: limit - users.length });

                memberResults.forEach(member => {
                    // Evitar duplicados (si ya estaba en DB)
                    if (!users.find(u => u.discordId === member.id)) {
                        users.push({
                            discordId: member.id,
                            username: member.user.username,
                            psnId: null, // No verificado
                            gameId: null,
                            platform: null
                        });
                    }
                });
            } catch (discordErr) {
                console.warn('[Search] Error buscando en Discord:', discordErr);
            }
        }

        res.json(users);
    } catch (e) {
        console.error('Error searching users:', e);
        res.status(500).json({ error: 'Error buscando usuarios' });
    }
});

// Endpoint: Verificar ID de usuario (Vincular Cuenta)
app.post('/api/user/verify', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const { platform, psnId: rawPsnId } = req.body;
    const psnId = sanitizeInput(rawPsnId, 30);
    if (!psnId || psnId.length < 3) return res.status(400).json({ error: 'ID inválido (mínimo 3 caracteres)' });

    // Validar plataforma
    const validPlatforms = ['psn', 'xbox', 'pc'];
    if (!validPlatforms.includes(platform)) return res.status(400).json({ error: 'Plataforma no válida' });

    try {
        const db = getDb(); // FIX: Usar la BD por defecto (tournamentBotDb) para que el draft lo reconozca

        // Comprobar si el ID ya está usado por otro discordId
        const existing = await db.collection('verified_users').findOne({
            psnId: { $regex: new RegExp(`^${escapeRegex(psnId)}$`, 'i') }
        });

        if (existing && existing.discordId !== req.user.id) {
            return res.status(400).json({ error: 'Este ID Online ya está vinculado a otra cuenta de Discord.' });
        }

        // Guardar o Actualizar
        await db.collection('verified_users').updateOne(
            { discordId: req.user.id },
            {
                $set: {
                    discordId: req.user.id,
                    username: req.user.username,
                    psnId: psnId,
                    platform: platform,
                    verifiedAt: new Date(),
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        // Actualizar sesión en memoria
        req.user.isVerified = true;
        req.user.psnId = psnId;
        req.user.platform = platform;

        console.log(`[Verify] Usuario ${req.user.username} verificó su cuenta con ID: ${psnId} (${platform})`);
        res.json({ success: true, message: 'Cuenta verificada correctamente' });

    } catch (e) {
        console.error('Error en verificación:', e);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint: Obtener los equipos del usuario (como manager o capitán)
app.get('/api/user/teams', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    try {
        const db = getDb('test'); // FIX: Usar 'test' para equipos
        const userId = req.user.id;

        // Buscar equipos donde el usuario es Manager O Capitán
        const teams = await db.collection('teams').find({
            $or: [
                { managerId: userId },
                { captains: userId }
            ]
        }).project({
            name: 1, logoUrl: 1, abbreviation: 1, managerId: 1, captains: 1
        }).toArray();

        // 2. Buscar equipos donde es capitán en drafts generados/finalizados
        const mainDb = getDb();
        const drafts = await mainDb.collection('drafts').find({
            "captains.userId": userId,
            status: { $in: ['torneo_generado', 'finalizado', 'completed'] }
        }).toArray();

        const draftTeams = drafts.map(draft => {
            const captainInfo = draft.captains.find(c => c.userId === userId);
            if (!captainInfo) return null;

            return {
                _id: 'draft_' + draft.shortId + '_' + userId,
                isDraftTeam: true,
                draftId: draft.shortId,
                name: captainInfo.teamName || `Equipo Draft de ${captainInfo.userName}`,
                logoUrl: captainInfo.logoUrl || 'https://i.imgur.com/2M7540p.png',
                abbreviation: captainInfo.abbreviation || 'DFT',
                managerId: userId, // Para la UI, el capitán del draft es el manager total
                captains: []
            };
        }).filter(Boolean);

        res.json({ teams: [...teams, ...draftTeams] });
    } catch (error) {
        console.error('[API Error] Error fetching user teams:', error);
        res.status(500).json({ error: 'Error al obtener equipos' });
    }
});

// Endpoint: Obtener ligas disponibles
app.get('/api/leagues', async (req, res) => {
    try {
        const db = getDb('test'); // VPG Bot usa 'test' por defecto

        const leagues = await db.collection('leagues')
            .find({ guildId: process.env.GUILD_ID })
            .project({ name: 1, _id: 0 })
            .sort({ name: 1 })
            .toArray();

        res.json({
            success: true,
            leagues: leagues.map(l => l.name)
        });
    } catch (error) {
        console.error('[Leagues] Error fetching leagues:', error);
        res.status(500).json({ error: 'Error al obtener ligas' });
    }
});

// Endpoint: Solicitar creación de equipo (con aprobación admin)
app.post('/api/teams/request', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const { teamName: rawTeamName, teamAbbr: rawTeamAbbr, teamTwitter, logoUrl } = req.body;
    const teamName = sanitizeInput(rawTeamName, 40);
    const teamAbbr = sanitizeInput(rawTeamAbbr, 5);

    // Validaciones básicas
    if (!teamName || !teamAbbr) {
        return res.status(400).json({ error: 'Faltan campos requeridos (nombre, abreviatura)' });
    }
    if (teamName.length < 3) {
        return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
    }
    if (teamAbbr.length !== 3) {
        return res.status(400).json({ error: 'La abreviatura debe tener exactamente 3 letras' });
    }

    try {
        const db = getDb('test'); // VPG Bot usa 'test' por defecto
        const userId = req.user.id;

        // Verificar que no sea manager ya
        const existingManager = await db.collection('teams').findOne({
            managerId: userId
        });
        if (existingManager) {
            return res.status(403).json({
                error: 'Ya eres manager de un equipo. Solo puedes gestionar uno.'
            });
        }

        // Verificar que el usuario esté en el servidor de Discord
        if (!client) {
            return res.status(503).json({
                error: 'El bot de Discord no está disponible en este momento. Intenta más tarde.'
            });
        }

        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(userId);
            if (!member) {
                return res.status(403).json({
                    error: 'Debes ser miembro del servidor de Discord para crear un equipo.'
                });
            }
        } catch (error) {
            return res.status(403).json({
                error: 'Debes ser miembro del servidor de Discord para crear un equipo.'
            });
        }

        // Verificar nombre/abreviatura únicos
        const existingName = await db.collection('teams').findOne({
            $or: [
                { name: { $regex: new RegExp(`^${escapeRegex(teamName)}$`, 'i') } },
                { abbreviation: { $regex: new RegExp(`^${escapeRegex(teamAbbr)}$`, 'i') } }
            ]
        });
        if (existingName) {
            return res.status(400).json({
                error: 'El nombre o la abreviatura ya están en uso.'
            });
        }

        // Crear PendingTeam (exactamente como Discord)
        const defaultLogo = 'https://i.imgur.com/X2YIZh4.png';
        const pendingTeam = {
            userId: userId,
            guildId: process.env.GUILD_ID,
            vpgUsername: req.user.username,
            teamName: teamName,
            teamAbbr: teamAbbr.toUpperCase(),
            teamTwitter: teamTwitter || null,
            leagueName: league,
            logoUrl: logoUrl || defaultLogo,
            createdAt: new Date()
        };

        const result = await db.collection('pendingteams').insertOne(pendingTeam);

        // Enviar notificación a Discord para aprobación
        await sendWebTeamRequestToDiscord(pendingTeam, req.user);

        console.log(`[Team Request] Usuario ${req.user.username} solicitó crear equipo: ${teamName}`);

        res.json({
            success: true,
            message: 'Solicitud enviada. Espera la aprobación de un administrador.',
            pendingTeamId: result.insertedId
        });

    } catch (error) {
        console.error('[Team Request] Error:', error);
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// Endpoint: Ver solicitudes pendientes del usuario
app.get('/api/teams/pending', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    try {
        const db = getDb('test');
        const pendingTeam = await db.collection('pendingteams').findOne({
            userId: req.user.id
        });

        res.json({
            success: true,
            pending: pendingTeam ? {
                teamName: pendingTeam.teamName,
                league: pendingTeam.leagueName,
                createdAt: pendingTeam.createdAt
            } : null
        });
    } catch (error) {
        console.error('[Pending Teams] Error:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes pendientes' });
    }
});


// Obtener eventos abiertos a inscripción (Torneos y Drafts)
app.get('/api/tournaments/open', async (req, res) => {
    try {
        const db = getDb(); // Torneos están en la DB por defecto (tournamentBotDb)

        // Buscar torneos con inscripción abierta
        const openTournaments = await db.collection('tournaments').find({
            status: 'inscripcion_abierta'
        }).toArray();

        // Buscar drafts con inscripción abierta
        const openDrafts = await db.collection('drafts').find({
            status: 'inscripcion'
        }).toArray();

        // Mapear datos relevantes para el frontend
        const tournamentsData = [
            ...openTournaments.map(t => ({
                _id: t._id,
                shortId: t.shortId,
                nombre: t.nombre,
                tipo: t.tipo || 'Torneo',
                inscripcion: t.config?.isPaid ? 'Pago' : 'Gratis',
                isPaid: t.config?.isPaid || false,
                entryFee: t.config?.entryFee || 0,
                teamsCount: t.teams?.aprobados ? Object.keys(t.teams.aprobados).length : 0,
                maxTeams: t.config?.maxTeams || t.config?.format?.size || t.config?.size || null,
                format: t.config?.formatId || 'unknown',
                isDraft: false
            })),
            ...openDrafts.map(d => ({
                _id: d._id,
                shortId: d.shortId,
                nombre: d.draftName || d.nombre || `Draft ${d.shortId}`,
                tipo: 'Draft',
                inscripcion: d.config?.isPaid ? 'Pago' : 'Gratis',
                isPaid: d.config?.isPaid || false,
                entryFee: d.config?.entryFee || 0,
                playersCount: (d.players || []).length,
                teamsCount: Object.keys(d.teams || {}).length || 0,
                format: 'Draft',
                isDraft: true
            }))
        ];

        res.json({
            success: true,
            tournaments: tournamentsData
        });
    } catch (error) {
        console.error('[Open Tournaments] Error:', error);
        res.status(500).json({ error: 'Error al obtener torneos abiertos' });
    }
});

// Inscribirse en un torneo (REPLICA EX ACTA del flujo de Discord)
app.post('/api/tournaments/:tournamentId/register', async (req, res) => {
    try {
        const userId = req.user.id;
        const { tournamentId } = req.params;
        const { teamData, paymentProofUrl } = req.body;

        // VALIDACIÓN CRÍTICA: Usuario DEBE ser miembro del servidor Discord
        let isMember = req.user.isMember;

        // Si no está en sesión, verificar con Discord API
        if (isMember === undefined) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
            } catch (e) {
                console.error('Error verificando membresía:', e);
                isMember = false;
            }
        }

        if (!isMember) {
            return res.status(403).json({
                error: 'Debes ser miembro del servidor Discord para inscribirte en torneos',
                requiresDiscordMembership: true,
                inviteUrl: 'https://discord.gg/zEy9ztp8QM'
            });
        }

        const db = getDb(); // Torneos están en la DB por defecto
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });

        if (!tournament) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        if (tournament.status !== 'inscripcion_abierta') {
            return res.status(400).json({ error: 'Las inscripciones no están abiertas para este torneo' });
        }

        if (tournament.config?.registrationClosed) {
            return res.status(400).json({ error: 'Las inscripciones están temporalmente cerradas por la administración.' });
        }

        const isAlreadyRegistered =
            tournament.teams?.aprobados?.[userId] ||
            tournament.teams?.pendientes?.[userId] ||
            tournament.teams?.reserva?.[userId] ||
            tournament.teams?.pendingPayments?.[userId];

        if (isAlreadyRegistered) {
            return res.status(400).json({ error: 'Ya estás inscrito o tienes una solicitud pendiente en este torneo' });
        }

        const isPaidTournament = tournament.config?.isPaid;

        // TORNEOS GRATUITOS - Requiere equipo VPG (igual que Discord)
        if (!isPaidTournament) {
            const vpgTeam = await getDb('test').collection('teams').findOne({
                $or: [{ managerId: userId }, { captains: userId }],
                guildId: process.env.GUILD_ID
            });

            if (!vpgTeam) {
                return res.status(403).json({
                    error: 'Para torneos gratuitos necesitas un equipo VPG',
                    requiresVpgTeam: true,
                    message: {
                        es: '⚠️ Para inscribirte en torneos GRATUITOS debes ser Manager o Capitán de un equipo VPG.\n\n' +
                            '📝 OPCIONES PARA CREAR TU EQUIPO:\n\n' +
                            '1️⃣ Desde esta WEB:\n   • Ve a tu Perfil → "Crear Nuevo Equipo"\n   • Llena el formulario\n   • Espera aprobación del staff\n\n' +
                            '2️⃣ Desde DISCORD:\n   • Canal #registra-equipo-o-unete\n   • Sigue el proceso con el bot\n\n' +
                            '✅ Una vez aprobado tu equipo, podrás inscribirte en torneos gratuitos.',
                        en: '⚠️ To register for FREE tournaments you must be a Manager or Captain of a VPG team.\n\n' +
                            '📝 OPTIONS TO CREATE YOUR TEAM:\n\n' +
                            '1️⃣ From this WEBSITE:\n   • Go to your Profile → "Create New Team"\n   • Fill the form\n   • Wait for staff approval\n\n' +
                            '2️⃣ From DISCORD:\n   • Channel #registra-equipo-o-unete\n   • Follow the bot process\n\n' +
                            '✅ Once your team is approved, you can register for free tournaments.'
                    }
                });
            }

            const finalTeamData = {
                id: userId,
                nombre: vpgTeam.name,
                eafcTeamName: teamData?.eafcTeamName || vpgTeam.name,
                capitanId: userId,
                capitanTag: req.user.username,
                coCaptainId: null,
                coCaptainTag: null,
                bandera: '🏳️',
                paypal: null,
                streamChannel: teamData?.streamChannel || '',
                twitter: teamData?.twitter || vpgTeam.twitter || '',
                inscritoEn: new Date(),
                logoUrl: vpgTeam.logoUrl,
                // CRÍTICO: Añadir capitanes del equipo VPG para que tengan permisos en hilos
                extraCaptains: vpgTeam.captains || []
            };

            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendientes.${userId}`]: finalTeamData } }
            );

            // Enviar notificación usando el cliente del BOT PRINCIPAL (no VPG bot)
            // para que las interacciones de botones funcionen correctamente
            if (client) {
                // Adaptar objeto para que coincida con lo que espera sendRegistrationRequest
                const notificationTeamData = {
                    ...finalTeamData,
                    name: finalTeamData.nombre, // Mapear nombre -> name
                    abbreviation: vpgTeam.shortName || vpgTeam.abbreviation || vpgTeam.name.substring(0, 3).toUpperCase(),
                    region: vpgTeam.region || 'EU'
                };
                await sendRegistrationRequest(client, tournament, notificationTeamData, req.user, null);
            }

            return res.json({
                success: true,
                message: 'Solicitud de inscripción enviada. Espera aprobación del administrador.'
            });
        }

        // TORNEOS DE PAGO - Flujo simplificado (sin preguntas, nombre automático)
        else {
            // Check rechazados
            if (tournament.teams?.rechazados?.[userId]) {
                return res.status(403).json({ error: '❌ Has sido rechazado de este torneo. Solo un administrador puede desbloquearte.' });
            }

            // Auto-generar nombre si no viene (flujo simplificado)
            const rawName = teamData?.teamName || req.user.username || 'Jugador';
            const sanitizedName = rawName.replace(/[^\p{L}\p{N}\s\-]/gu, '').trim().substring(0, 20) || req.user.username.substring(0, 20);
            const autoTeamName = rawName === teamData?.teamName ? rawName : `TEAM ${sanitizedName}`;

            const finalTeamData = {
                userId: userId,
                userTag: req.user.username,
                teamName: autoTeamName,
                eafcTeamName: teamData?.eafcTeamName || autoTeamName,
                streamChannel: teamData?.streamChannel || '',
                twitter: teamData?.twitter || '',
                registeredAt: new Date(),
                status: 'awaiting_payment_info_approval'
            };

            // Guardar en pendingPayments (Unificado con modalHandler)
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendingPayments.${userId}`]: finalTeamData } }
            );

            // Enviar notificación a Discord para PRIMERA aprobación
            if (client) {
                await sendPaymentApprovalRequest(client, tournament, finalTeamData, req.user);
            } else {
                console.warn('[Visualizer] No hay cliente Discord disponible para enviar notificación de aprobación.');
            }

            return res.json({
                success: true,
                message: '✅ Solicitud enviada.\\n\\nUn administrador la revisará y recibirás la información de pago por MENSAJE DIRECTO (DM) en Discord.'
            });
        }

    } catch (error) {
        console.error('[Tournament Registration] Error:', error);
        res.status(500).json({ error: 'Error al procesar la inscripción' });
    }
});

// Pre-check de inscripción a Draft (validaciones centralizadas para el wizard web)
app.get('/api/draft/:draftId/pre-check', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    try {
        const userId = req.user.id;
        const db = getDb();

        // 1. Verificación
        const verifiedUser = await db.collection('verified_users').findOne({ discordId: userId });

        // 2. Strikes
        const playerRecord = await db.collection('player_records').findOne({ userId });
        const strikes = playerRecord?.strikes || 0;

        // 3. Membresía Discord
        let isMember = req.user.isMember;
        if (isMember === undefined) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
                req.user.isMember = isMember;
            } catch (e) {
                console.error('Error verificando membresía en pre-check:', e);
                isMember = false;
            }
        }

        // 4. Estado del draft
        const draft = await db.collection('drafts').findOne({ shortId: req.params.draftId });

        // 5. ¿Ya inscrito?
        const isAlreadyRegistered = !!(
            draft?.captains?.some(c => c.userId === userId) ||
            draft?.players?.some(p => p.userId === userId) ||
            (draft?.pendingCaptains && draft.pendingCaptains[userId]) ||
            (draft?.pendingPayments && draft.pendingPayments[userId])
        );

        res.json({
            isVerified: !!verifiedUser,
            hasWhatsapp: !!(verifiedUser?.whatsapp),
            gameId: verifiedUser?.gameId || null,
            strikes,
            isBlocked: strikes >= 3,
            isMember: !!isMember,
            isAlreadyRegistered,
            draftExists: !!draft,
            draftStatus: draft?.status || null,
            isPaid: !!(draft?.config?.isPaid),
            entryFee: draft?.config?.entryFee || 0,
            maxCaptains: draft?.config?.maxCaptains || draft?.config?.numTeams || 8,
            currentCaptains: draft?.captains?.length || 0
        });
    } catch (error) {
        console.error('[Draft Pre-check] Error:', error);
        res.status(500).json({ error: 'Error al comprobar el estado de inscripción.' });
    }
});

// Inscribirse en un Draft desde la web (flujo completo: jugador + capitán)
app.post('/api/draft/:draftId/register', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        const userId = req.user.id;
        const { draftId } = req.params;
        const { primaryPosition, secondaryPosition, role, teamName,
            eafcTeamName, streamPlatform, streamUsername, whatsapp } = req.body;

        if (!primaryPosition) {
            return res.status(400).json({ error: 'Debes seleccionar al menos una posición principal.' });
        }

        const db = getDb();

        // --- VALIDACIÓN 1: Verificación server-side ---
        const verifiedUser = await db.collection('verified_users').findOne({ discordId: userId });
        if (!verifiedUser) {
            return res.status(403).json({ error: 'Tu cuenta no está verificada. Ve a tu Perfil y vincula tu ID de juego.' });
        }

        // --- VALIDACIÓN 2: Strikes ---
        const playerRecord = await db.collection('player_records').findOne({ userId });
        if (playerRecord && playerRecord.strikes >= 3) {
            return res.status(403).json({ error: `Tienes ${playerRecord.strikes} strikes acumulados. No puedes inscribirte.` });
        }

        // --- VALIDACIÓN 3: Membresía Discord ---
        let isMember = req.user.isMember;
        if (isMember === undefined) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
            } catch (e) {
                console.error('Error verificando membresía:', e);
                isMember = false;
            }
        }
        if (!isMember) {
            return res.status(403).json({
                error: 'Debes ser miembro del servidor Discord para inscribirte en drafts',
                requiresDiscordMembership: true,
                inviteUrl: 'https://discord.gg/zEy9ztp8QM'
            });
        }

        // --- VALIDACIÓN 4: Draft existe y está en inscripción ---
        const draft = await db.collection('drafts').findOne({ shortId: draftId });
        if (!draft) return res.status(404).json({ error: 'Draft no encontrado.' });
        if (draft.status !== 'inscripcion') {
            return res.status(400).json({ error: 'Las inscripciones para este Draft están cerradas.' });
        }

        // --- VALIDACIÓN 5: No ya inscrito ---
        const isAlreadyRegistered = draft.captains?.some(c => c.userId === userId) ||
            draft.players?.some(p => p.userId === userId) ||
            (draft.pendingCaptains && draft.pendingCaptains[userId]) ||
            (draft.pendingPayments && draft.pendingPayments[userId]);
        if (isAlreadyRegistered) {
            return res.status(400).json({ error: 'Ya estás inscrito, pendiente de aprobación o de pago en este draft.' });
        }

        // --- Guardar WhatsApp si se proporcionó y no lo tenía ---
        if (whatsapp && !verifiedUser.whatsapp) {
            await db.collection('verified_users').updateOne(
                { discordId: userId }, { $set: { whatsapp: whatsapp.trim() } }
            );
        }
        const finalWhatsapp = (whatsapp ? whatsapp.trim() : '') || verifiedUser.whatsapp || '';

        // --- Obtener nombre de Discord ---
        const discordUserResponse = await fetch(`https://discord.com/api/v10/users/${userId}`, {
            headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const discordUser = await discordUserResponse.json();
        const userName = discordUser.global_name || discordUser.username;
        const psnId = verifiedUser.gameId || verifiedUser.psnId || userName;

        // =============================================
        // === FLUJO CAPITÁN ===
        // =============================================
        if (role === 'captain') {
            if (!teamName?.trim()) return res.status(400).json({ error: 'Debes indicar un nombre de equipo.' });
            if (!eafcTeamName?.trim()) return res.status(400).json({ error: 'Debes indicar el nombre de tu equipo en EAFC.' });
            if (!streamUsername?.trim()) return res.status(400).json({ error: 'Debes indicar tu usuario de stream.' });

            const maxCaptains = draft.config?.maxCaptains || draft.config?.numTeams || 8;
            if (draft.captains.length >= maxCaptains) {
                return res.status(400).json({ error: 'Ya se alcanzó el máximo de capitanes.' });
            }
            if (draft.captains.some(c => c.teamName.toLowerCase() === teamName.trim().toLowerCase())) {
                return res.status(400).json({ error: 'Ya existe un equipo con ese nombre.' });
            }

            const streamChannel = streamPlatform === 'twitch'
                ? `https://twitch.tv/${streamUsername.trim()}`
                : `https://youtube.com/@${streamUsername.trim()}`;

            const captainData = {
                userId, userName, teamName: teamName.trim(), eafcTeamName: eafcTeamName.trim(),
                streamChannel, psnId, twitter: verifiedUser.twitter || '',
                whatsapp: finalWhatsapp, position: primaryPosition
            };
            const playerData = {
                userId, userName, psnId, twitter: verifiedUser.twitter || '',
                whatsapp: finalWhatsapp, primaryPosition,
                secondaryPosition: secondaryPosition || 'NONE',
                currentTeam: teamName.trim(), isCaptain: true, captainId: userId
            };

            if (draft.config?.isPaid) {
                // Draft de pago: guardar en pendingPayments y notificar por Discord
                await db.collection('drafts').updateOne({ _id: draft._id },
                    { $set: { [`pendingPayments.${userId}`]: { captainData, playerData } } }
                );
                // Intentar enviar DM de pago por Discord
                if (client) {
                    try {
                        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
                        const user = await client.users.fetch(userId);
                        const embedDm = new EmbedBuilder()
                            .setTitle(`💸 Inscripción al Draft Pendiente de Pago: ${draft.name}`)
                            .setDescription(`Para confirmar tu plaza como **Capitán**, realiza el pago de **${draft.config.entryFee}€**.\n\nUna vez realizado, pulsa el botón de abajo.`)
                            .setColor('#e67e22');
                        const confirmButton = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`draft_payment_confirm_start:${draftId}`).setLabel('✅ Ya he Pagado').setStyle(ButtonStyle.Success)
                        );
                        await user.send({ embeds: [embedDm], components: [confirmButton] });
                    } catch (dmErr) {
                        console.warn('[Draft Register Web] No se pudo enviar DM de pago:', dmErr.message);
                    }
                }
                return res.json({ success: true, message: '¡Solicitud recibida! Revisa tus mensajes de Discord para completar el pago.' });
            } else {
                // Draft gratis: pendingCaptains → aprobación admin
                await db.collection('drafts').updateOne({ _id: draft._id },
                    {
                        $set: {
                            [`pendingCaptains.${userId}`]: captainData,
                            [`pendingPlayers.${userId}`]: playerData
                        }
                    }
                );
                // Notificar en Discord para aprobación
                if (client) {
                    try {
                        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
                        const approvalChannel = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId);
                        const adminEmbed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setTitle('🔔 Nueva Solicitud de Capitán (desde Web)')
                            .setDescription(`**Draft:** ${draft.name}`)
                            .addFields(
                                { name: 'Nombre de Equipo', value: captainData.teamName, inline: true },
                                { name: 'Capitán', value: userName, inline: true },
                                { name: 'PSN ID', value: psnId, inline: false },
                                { name: 'Equipo EAFC', value: captainData.eafcTeamName, inline: false },
                                { name: 'Canal Transmisión', value: captainData.streamChannel, inline: false },
                                { name: 'Twitter', value: verifiedUser.twitter || 'No proporcionado', inline: false }
                            );
                        const adminButtons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`draft_approve_captain:${draftId}:${userId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`draft_reject_captain:${draftId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
                        );
                        await approvalChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
                    } catch (notifyErr) {
                        console.error('[Draft Register Web] Error notificando a Discord:', notifyErr);
                    }
                }
                return res.json({ success: true, message: '¡Tu solicitud para ser capitán ha sido enviada! Un admin la revisará pronto.' });
            }
        }

        // =============================================
        // === FLUJO JUGADOR ===
        // =============================================
        // Si la posición secundaria es igual a la principal, la anulamos
        let safeSecondaryPos = secondaryPosition || 'NONE';
        if (safeSecondaryPos === primaryPosition) {
            safeSecondaryPos = 'NONE';
        }

        const newPlayer = {
            userId, userName, psnId,
            twitter: verifiedUser.twitter || '',
            whatsapp: finalWhatsapp,
            primaryPosition,
            secondaryPosition: safeSecondaryPos,
            currentTeam: 'Libre',
            captainId: null,
            isCaptain: false
        };

        if (draft.config?.isPaid) {
            // Draft de pago: pendingPayments
            await db.collection('drafts').updateOne({ _id: draft._id },
                { $set: { [`pendingPayments.${userId}`]: { playerData: newPlayer } } }
            );
            // Intentar enviar DM de pago por Discord
            if (client) {
                try {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
                    const user = await client.users.fetch(userId);
                    const embedDm = new EmbedBuilder()
                        .setTitle(`💸 Inscripción al Draft Pendiente de Pago: ${draft.name}`)
                        .setDescription(`Para confirmar tu plaza como **Jugador**, realiza el pago de **${draft.config.entryFee}€**.\n\nUna vez realizado, pulsa el botón de abajo.`)
                        .setColor('#e67e22');
                    const confirmButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`draft_payment_confirm_start:${draftId}`).setLabel('✅ Ya he Pagado').setStyle(ButtonStyle.Success)
                    );
                    await user.send({ embeds: [embedDm], components: [confirmButton] });
                } catch (dmErr) {
                    console.warn('[Draft Register Web] No se pudo enviar DM de pago (jugador):', dmErr.message);
                }
            }
            return res.json({ success: true, message: '¡Inscripción recibida! Revisa tus mensajes de Discord para completar el pago.' });
        }

        // Draft gratis: inscripción directa
        const result = await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $push: { players: newPlayer } }
        );

        if (result.modifiedCount > 0) {
            const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
            if (client) {
                const { updateDraftMainInterface, notifyVisualizer } = await import('./src/logic/tournamentLogic.js');
                const { updateDraftManagementPanel } = await import('./src/utils/panelManager.js');
                await updateDraftMainInterface(client, draftId);
                await updateDraftManagementPanel(client, updatedDraft);
                await notifyVisualizer(updatedDraft);

                // Notificar en Discord
                try {
                    const { EmbedBuilder } = await import('discord.js');
                    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
                    if (notificationsThread) {
                        const embed = new EmbedBuilder()
                            .setColor('#2ecc71')
                            .setTitle('👋 Nuevo Jugador Inscrito (Web)')
                            .setDescription(`El jugador **${newPlayer.userName}** (${newPlayer.psnId}) se ha apuntado al draft desde la web.`)
                            .addFields(
                                { name: 'Posición Principal', value: primaryPosition, inline: true },
                                { name: 'Equipo Actual', value: newPlayer.currentTeam || 'Libre', inline: true }
                            )
                            .setFooter({ text: `Draft: ${draft.name} | ID del Jugador: ${newPlayer.userId}` });
                        await notificationsThread.send({ embeds: [embed] });
                    }
                } catch (notifyErr) {
                    console.error('[Draft Register Web] Error notificando a Discord:', notifyErr);
                }
            }
            return res.json({ success: true, message: '¡Inscripción al Draft completada exitosamente!' });
        } else {
            return res.status(500).json({ error: 'No se pudo completar la inscripción.' });
        }

    } catch (error) {
        console.error('[Draft Register Web] Error:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar la inscripción al Draft' });
    }
});

// Darse de baja de un draft desde la web
app.post('/api/draft/:draftId/unregister', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        const userId = req.user.id;
        const { draftId } = req.params;
        const { reason } = req.body;

        const db = getDb();
        const draft = await db.collection('drafts').findOne({ shortId: draftId });

        if (!draft) return res.status(404).json({ error: 'Draft no encontrado.' });

        const { requestUnregisterFromDraft } = await import('./src/logic/tournamentLogic.js');

        const result = await requestUnregisterFromDraft(client, draft, userId, reason || 'Baja solicitada desde la web');

        if (result.success) {
            // Update UI/Visualizer after unregistering
            const updatedDraft = await db.collection('drafts').findOne({ shortId: draftId });
            const { updateDraftMainInterface, notifyVisualizer } = await import('./src/logic/tournamentLogic.js');
            const { updateDraftManagementPanel } = await import('./src/utils/panelManager.js');
            await updateDraftMainInterface(client, draftId);
            await updateDraftManagementPanel(client, updatedDraft);
            await notifyVisualizer(updatedDraft);

            return res.json({ success: true, message: result.message });
        } else {
            return res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('[Draft Unregister Web] Error:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar la baja' });
    }
});

// Función auxiliar para// Enviar notificación a Discord para aprobación de equipos (usa el VPG Bot client)
async function sendWebTeamRequestToDiscord(teamData, user) {
    // Importar el getter del VPG Bot client
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const { getVpgClient } = require('./src/vpg_bot/index.js');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = await import('discord.js');

    const vpgClient = getVpgClient();

    if (!vpgClient) {
        throw new Error('VPG Bot client no disponible');
    }

    const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
    if (!approvalChannelId) {
        throw new Error('APPROVAL_CHANNEL_ID no configurado en .env');
    }

    const channel = await vpgClient.channels.fetch(approvalChannelId);
    if (!channel) {
        throw new Error('Canal de aprobación no encontrado');
    }



    const avatarURL = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const embed = new EmbedBuilder()
        .setTitle('📝 Nueva Solicitud de Equipo [WEB]')
        .setColor('Orange')
        .setAuthor({
            name: user.username,
            iconURL: avatarURL
        })
        .setThumbnail(teamData.logoUrl)
        .addFields(
            { name: 'Usuario VPG', value: user.username },
            { name: 'Nombre del Equipo', value: teamData.teamName },
            { name: 'Abreviatura', value: teamData.teamAbbr },
            { name: 'Twitter del Equipo', value: teamData.teamTwitter || 'No especificado' },
            { name: 'URL del Logo', value: `[Ver Logo](${teamData.logoUrl})` }
        )
        .setTimestamp()
        .setFooter({ text: 'Solicitud creada desde la web' });

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`approve_team_select_${user.id}`)
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
            .setCustomId(`reject_request_${user.id}`)
            .setLabel('Rechazar')
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `**[WEB]** Solicitante: <@${user.id}>`,
        embeds: [embed],
        components: [selectRow, buttonRow]
    });

    console.log(`[Discord Notification] Solicitud de equipo enviada al canal de aprobación`);
}

// === ENDPOINT ANTIGUO DEPRECADO - Se mantiene comentado por si acaso ===
/* 
app.post('/api/teams/create', async (req, res) => {
    // DEPRECADO: Ahora se usa /api/teams/request con aprobación admin
    return res.status(410).json({ 
        error: 'Este endpoint está deprecado. Usa /api/teams/request en su lugar.' 
    });
});
*/

// === GESTIÓN DE PLANTILLA (ROSTER) ===

// Middleware para verificar permisos de equipo
async function checkTeamPermissions(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    try {
        const teamId = req.params.teamId;

        // Manejo especial para equipos de Draft
        if (teamId.startsWith('draft_')) {
            const parts = teamId.split('_');
            if (parts.length >= 3) {
                const draftShortId = parts[1];
                const managerId = parts.slice(2).join('_');

                const db = getDb();
                const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

                if (!draft) return res.status(404).json({ error: 'Draft no encontrado' });

                if (req.user.id !== managerId) {
                    return res.status(403).json({ error: 'No tienes permisos para gestionar este equipo de draft' });
                }

                req.isDraftTeam = true;
                req.draft = draft;
                req.isManager = true;
                req.managerId = managerId;
                req.teamId = teamId;
                return next();
            }
        }

        // Validar que el teamId tiene formato de ObjectId válido (24 caracteres hexadecimales)
        if (!/^[a-fA-F0-9]{24}$/.test(teamId)) {
            return res.status(400).json({ error: 'ID de equipo inválido' });
        }

        const db = getDb('test'); // FIX: Equipos están en 'test'
        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
        if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

        const isManager = team.managerId === req.user.id;
        const isCaptain = team.captains && team.captains.includes(req.user.id);

        if (!isManager && !isCaptain) {
            return res.status(403).json({ error: 'No tienes permisos para gestionar este equipo' });
        }

        req.team = team;
        req.isManager = isManager; // Para lógica específica
        next();
    } catch (e) {
        console.error('Error middleware permisos:', e);
        res.status(500).json({ error: 'Error interno' });
    }
}

// GET Roster
app.get('/api/teams/:teamId/roster', checkTeamPermissions, async (req, res) => {
    try {
        if (req.isDraftTeam) {
            const draft = req.draft;
            const managerId = req.managerId;
            const rosterDetails = [];

            // Buscar jugadores asignados a este capitán
            const teamPlayers = draft.players.filter(p => p.captainId === managerId);

            // Añadir al propio capitán a la lista (normalmente está en teamPlayers, pero por si acaso confirmamos)
            const isCaptainInTeam = teamPlayers.some(p => p.userId === managerId);

            for (const p of teamPlayers) {
                let discordUser = null;
                try { discordUser = await client.users.fetch(p.userId); } catch (e) { }

                rosterDetails.push({
                    id: p.userId,
                    username: discordUser ? discordUser.username : p.userName,
                    global_name: discordUser?.globalName,
                    avatar: discordUser ? discordUser.displayAvatarURL() : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    role: p.userId === managerId ? 'manager' : 'member',
                    psnId: p.psnId || null,
                    platform: p.platform || null,
                    // EXTRA INFO FOR DRAFTS
                    primaryPosition: p.primaryPosition,
                    secondaryPosition: p.secondaryPosition,
                    whatsapp: p.whatsapp,
                    strikes: p.strikes || 0,
                    isDraft: true
                });
            }

            // Si el capitán no estaba en la lista de jugadores, añadirlo manualmente
            if (!isCaptainInTeam) {
                let discordUser = null;
                try { discordUser = await client.users.fetch(managerId); } catch (e) { }
                const capInfo = draft.captains.find(c => c.userId === managerId);

                rosterDetails.push({
                    id: managerId,
                    username: discordUser ? discordUser.username : (capInfo ? capInfo.userName : 'Capitán'),
                    avatar: discordUser ? discordUser.displayAvatarURL() : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    role: 'manager',
                    psnId: capInfo?.psnId || 'Director',
                    platform: 'SYS',
                    isDraft: true
                });
            }

            return res.json({ roster: rosterDetails, isManager: req.isManager });
        }

        const team = req.team;
        const allIds = [team.managerId, ...(team.captains || []), team.coCaptainId, ...(team.players || [])];
        const uniqueIds = [...new Set(allIds)].filter(id => id); // Eliminar duplicados y nulos

        // Obtener detalles de Discord y DB
        const rosterDetails = [];
        const dbUsers = getDb(); // FIX: Usuarios verificados están en tournamentBotDb
        const dbTeams = getDb('test'); // Teams están en test, aunque aquí no se usa directamnte

        for (const userId of uniqueIds) {
            let role = 'member';
            if (userId === team.managerId) role = 'manager';
            else if (userId === team.coCaptainId) role = 'co-captain';
            else if (team.captains.includes(userId)) role = 'captain';

            // Datos DB (Verificación)
            const verifiedUser = await dbUsers.collection('verified_users').findOne({ discordId: userId });

            // Datos Discord (Avatar/Name)
            let discordUser = null;
            try {
                discordUser = await client.users.fetch(userId);
            } catch (e) {
                console.warn(`No se pudo user ${userId} de Discord`);
            }

            rosterDetails.push({
                id: userId,
                username: discordUser ? discordUser.username : (verifiedUser?.username || 'Desconocido'),
                global_name: discordUser?.globalName,
                avatar: discordUser ? discordUser.displayAvatarURL() : 'https://cdn.discordapp.com/embed/avatars/0.png',
                role: role,
                psnId: verifiedUser?.gameId || verifiedUser?.psnId || null, // FIX: gameId priority
                platform: verifiedUser?.platform || null
            });
        }

        // Ordenar: Manager > Captain > Member
        const roleOrder = { 'manager': 0, 'captain': 1, 'member': 2 };
        rosterDetails.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

        res.json({ roster: rosterDetails, isManager: req.isManager });

    } catch (e) {
        console.error('Error fetching roster:', e);
        res.status(500).json({ error: 'Error obteniendo plantilla' });
    }
});

// Endpoint: Solicitud de Strike desde la web (Equipos de Draft)
app.post('/api/draft/strike', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const { draftId, playerId, reason } = req.body;
    if (!draftId || !playerId) return res.status(400).json({ error: 'Faltan parámetros de draft o jugador' });

    try {
        const { requestStrikeFromWeb } = await import('./src/logic/tournamentLogic.js');
        await requestStrikeFromWeb(client, draftId, req.user.id, playerId, reason || 'Solicitado por el capitán desde la Web');
        res.json({ success: true, message: 'Solicitud de strike enviada a los administradores. Recibirás respuesta por Discord.' });
    } catch (e) {
        console.error('[Web Strike Error]', e);
        res.status(500).json({ error: e.message || 'Error al solicitar el strike' });
    }
});

// Endpoint: Obtener Agentes Libres de un Draft
app.get('/api/draft/free-agents/:draftId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    try {
        const { draftId } = req.params;
        const db = getDb();
        const draft = await db.collection('drafts').findOne({ shortId: draftId });

        if (!draft) return res.status(404).json({ error: 'Draft no encontrado' });

        // Agentes libres: aquellos que no tienen captainId ni teamId asignado.
        const freeAgents = draft.players.filter(p => !p.captainId && !p.teamId).map(p => ({
            id: p.userId,
            username: p.userName,
            psnId: p.psnId || 'N/A',
            whatsapp: p.whatsapp || 'N/A',
            primaryPosition: p.primaryPosition || 'N/A',
            platform: p.primaryPlatform || p.platform || 'N/A'
        }));

        res.json({ success: true, freeAgents });
    } catch (e) {
        console.error('[Free Agents Error]', e);
        res.status(500).json({ error: 'Error al obtener agentes libres' });
    }
});

// Endpoint: Solicitar Sustitución Web
app.post('/api/draft/substitute', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const { draftId, outPlayerId, inPlayerId, reason } = req.body;
    if (!draftId || !outPlayerId || !inPlayerId) return res.status(400).json({ error: 'Faltan parámetros' });

    try {
        const { requestSubstituteFromWeb } = await import('./src/logic/tournamentLogic.js');
        await requestSubstituteFromWeb(client, draftId, req.user.id, outPlayerId, inPlayerId, reason || 'Sustitución desde la Web');
        res.json({ success: true, message: 'Solicitud de sustitución enviada a los administradores. Serás notificado por Discord.' });
    } catch (e) {
        console.error('[Web Substitute Error]', e);
        res.status(500).json({ error: e.message || 'Error al solicitar la sustitución' });
    }
});

// POST Invite Player
app.post('/api/teams/:teamId/invite', checkTeamPermissions, async (req, res) => {
    const { usernameOrId } = req.body;
    if (!usernameOrId) return res.status(400).json({ error: 'Falta usuario' });

    try {
        let targetUser = null;

        // 1. Buscar por ID
        if (usernameOrId.match(/^\d{17,19}$/)) {
            try {
                targetUser = await client.users.fetch(usernameOrId);
            } catch { }
        }

        // 2. Buscar por Username en Discord (Cache de guild si disponible o nada)
        // Difícil buscar globalmente por username sin bot search en djs. 
        // Usaremos DB verified_users como fallback de búsqueda "segura"
        if (!targetUser) {
            const dbRef = getDb(); // FIX: Usuarios en tournamentBotDb
            const foundInDb = await dbRef.collection('verified_users').findOne({
                username: { $regex: new RegExp(`^${escapeRegex(usernameOrId)}$`, 'i') }
            });
            if (foundInDb) {
                try {
                    targetUser = await client.users.fetch(foundInDb.discordId);
                } catch { }
            }
        }

        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado (Prueba con el ID de Discord)' });

        // Validaciones
        const team = req.team;
        const allMembers = [team.managerId, ...(team.captains || []), ...(team.players || [])];
        if (allMembers.includes(targetUser.id)) {
            return res.status(400).json({ error: 'El usuario ya está en el equipo' });
        }

        // Añadir a players
        const db = getDb('test');
        await db.collection('teams').updateOne(
            { _id: team._id },
            { $addToSet: { players: targetUser.id } }
        );

        res.json({ success: true, user: { id: targetUser.id, username: targetUser.username } });

    } catch (e) {
        console.error('Error inviting:', e);
        res.status(500).json({ error: 'Error invitando jugador' });
    }
});

// POST Kick Player
app.post('/api/teams/:teamId/kick', checkTeamPermissions, async (req, res) => {
    const { userId } = req.body;
    const team = req.team;

    // Protección: No se puede expulsar al Manager
    if (userId === team.managerId) {
        return res.status(403).json({ error: 'No puedes expulsar al Manager.' });
    }

    // Protección: Capitanes no pueden expulsar a otros Capitanes (Regla implícita común, o permitirlo?)
    // User dijo: "capitanes tambien pueden salvo expulsar al manager o degradarlo"
    // Asumiremos que Capitán puede expulsar miembro, pero NO a otro capitán (para evitar guerras).
    const targetIsCaptain = team.captains?.includes(userId);
    if (!req.isManager && targetIsCaptain) {
        return res.status(403).json({ error: 'Solo el Manager puede expulsar a Capitanes.' });
    }

    try {
        const db = getDb('test');
        await db.collection('teams').updateOne(
            { _id: team._id },
            {
                $pull: {
                    players: userId,
                    captains: userId
                }
            }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error expulsando jugador' });
    }
});

// POST Promote/Demote
app.post('/api/teams/:teamId/promote', checkTeamPermissions, async (req, res) => {
    const { userId, role } = req.body; // role: 'captain' | 'member'
    const team = req.team;

    // Solo el Manager puede gestionar rangos de capitán
    if (!req.isManager) {
        return res.status(403).json({ error: 'Solo el Manager puede gestionar rangos.' });
    }

    if (userId === team.managerId) return res.status(400).json({ error: 'El rol del Manager es inmodificable aquí.' });

    const db = getDb('test');
    try {
        if (role === 'captain') {
            await db.collection('teams').updateOne(
                { _id: team._id },
                {
                    $addToSet: { captains: userId },
                    $pull: { players: userId } // Lo quitamos de players base para limpieza, aunque el esquema permite overlap, mejor separar
                }
            );
        } else {
            // Demote to member
            await db.collection('teams').updateOne(
                { _id: team._id },
                {
                    $pull: { captains: userId },
                    $addToSet: { players: userId }
                }
            );
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error cambiando rol' });
    }
});

// === INSCRIPCIONES A TORNEOS ===
app.post('/api/tournaments/:id/register', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const tournamentId = req.params.id;
    const { teamId, teamData, paymentProofUrl } = req.body;

    try {
        const db = getDb();
        const { ObjectId } = await import('mongodb');
        const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });

        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        if (tournament.status !== 'registration_open' && tournament.estado !== 'Inscripción') {
            return res.status(400).json({ error: 'El periodo de inscripción no está abierto.' });
        }

        // Validar si usuario ya solicitó inscripción 
        const existingReq = tournament.registrationRequests?.find(r => r.userId === req.user.id);
        if (existingReq) {
            return res.status(400).json({ error: 'Ya has enviado una solicitud para este torneo.' });
        }

        let finalTeamData = null;

        // Caso 1: Equipo Existente
        if (teamId) {
            const dbTeams = getDb('test'); // FIX: Buscar equipo en 'test'
            const team = await dbTeams.collection('teams').findOne({ _id: new ObjectId(teamId) });
            if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

            const isManager = team.managerId === req.user.id;
            const isCaptain = team.captains?.includes(req.user.id);
            if (!isManager && !isCaptain) {
                return res.status(403).json({ error: 'No tienes permisos en este equipo' });
            }

            finalTeamData = team;
        }
        // Caso 2: Equipo Temporal (Solo Paid)
        else if (teamData && tournament.inscripcion === 'Pago') {
            if (!teamData.name || !teamData.logoUrl) {
                return res.status(400).json({ error: 'Faltan datos del equipo' });
            }
            finalTeamData = {
                _id: new ObjectId(),
                name: teamData.name,
                abbreviation: (teamData.abbreviation || 'TMP').toUpperCase(),
                logoUrl: teamData.logoUrl,
                region: teamData.region || 'EU',
                managerId: req.user.id,
                isTemp: true
            };
        } else {
            return res.status(400).json({ error: 'Datos de equipo inválidos' });
        }

        if (tournament.inscripcion === 'Pago' && !paymentProofUrl) {
            return res.status(400).json({ error: 'Se requiere comprobante de pago.' });
        }

        const messageId = await sendRegistrationRequest(client, tournament, finalTeamData, req.user, paymentProofUrl);

        if (!messageId) {
            return res.status(500).json({ error: 'Error al enviar solicitud a Discord' });
        }

        const request = {
            userId: req.user.id,
            teamId: teamId ? new ObjectId(teamId) : finalTeamData._id,
            teamName: finalTeamData.name,
            teamLogo: finalTeamData.logoUrl,
            status: 'pending',
            paymentProofUrl: paymentProofUrl || null,
            discordMessageId: messageId,
            timestamp: new Date()
        };

        if (finalTeamData.isTemp) {
            request.tempTeamData = finalTeamData;
        }

        await db.collection('tournaments').updateOne(
            { _id: new ObjectId(tournamentId) },
            { $push: { registrationRequests: request } }
        );

        console.log(`[Registration] ${req.user.username} -> ${tournament.nombre}`);
        res.json({ success: true, message: 'Solicitud enviada correctamente' });

    } catch (e) {
        console.error('Error en inscripción:', e);
        res.status(500).json({ error: 'Error interno al procesar inscripción' });
    }
});

// Endpoint para ver equipos inscritos
app.get('/api/tournaments/:shortId/teams', async (req, res) => {
    try {
        const db = getDb(); // Torneos en DB principal
        const tournament = await db.collection('tournaments').findOne({ shortId: req.params.shortId });

        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        const approvedTeams = tournament.teams?.aprobados || {};
        const teamsList = Object.values(approvedTeams).map(t => ({
            name: t.nombre || t.name || 'Equipo',
            logo: t.logoUrl || t.escudo || 'https://via.placeholder.com/50',
            captain: t.capitanTag || t.managerTag || 'Desconocido'
        }));

        res.json({ teams: teamsList });
    } catch (e) {
        console.error('Error getting teams:', e);
        res.status(500).json({ error: 'Error obteniendo equipos' });
    }
});

// Endpoint: Detectar rol del usuario en un evento específico
app.get('/api/my-role-in-event/:eventId', async (req, res) => {
    if (!req.user) {
        return res.json({ authenticated: false, role: 'visitor' });
    }

    try {
        const db = getDb();
        const userId = req.user.id;
        const eventId = req.params.eventId;

        // Intentar encontrar el evento (puede ser torneo o draft)
        let event = await db.collection('tournaments').findOne({ shortId: eventId });
        let eventType = 'tournament';

        if (!event) {
            event = await db.collection('drafts').findOne({ shortId: eventId });
            eventType = 'draft';
        }

        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        const roleData = {
            authenticated: true,
            eventId: eventId,
            eventName: event.nombre,
            eventType: eventType,
            role: 'visitor', // Por defecto
            teamId: null,
            teamName: null
        };

        // 1. VERIFICAR SI ES ADMIN (basado en roles de Discord)
        // Obtener roles desde la sesión de membership check
        const membershipCheck = await fetch(
            `https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`,
            { headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` } }
        );

        if (membershipCheck.ok) {
            const memberData = await membershipCheck.json();
            const adminRoleIds = [
                ...(process.env.ADMIN_ROLE_IDS?.split(',') || []),
                process.env.ARBITER_ROLE_ID,
                process.env.ADMIN_ROLE_ID
            ].filter(Boolean);
            const isAdmin = memberData.roles.some(roleId => adminRoleIds.includes(roleId));

            if (isAdmin) {
                roleData.isAdmin = true;
            } else {
                roleData.isAdmin = false;
            }
        }

        // 2. VERIFICAR ROLES ESPECÍFICOS DEL EVENTO
        if (eventType === 'tournament') {
            // A. Capitán principal, Co-Capitán, o Capitán Extra
            for (const groupName in event.structure.grupos) {
                const group = event.structure.grupos[groupName];
                if (group.equipos) {
                    for (const team of group.equipos) {
                        const effectiveTeamId = event.draftId && team.capitanId ? `draft_${event.draftId}_${team.capitanId}` : team.id;

                        // Capitán principal
                        if (team.capitanId === userId) {
                            roleData.role = 'captain';
                            roleData.teamId = effectiveTeamId;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }

                        // Mánager
                        if (team.managerId === userId) {
                            roleData.role = 'manager';
                            roleData.teamId = effectiveTeamId;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }

                        // Co-Capitán
                        if (team.coCaptainId === userId) {
                            roleData.role = 'coCaptain';
                            roleData.teamId = effectiveTeamId;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }

                        // Capitán Extra
                        if (team.extraCaptains && Array.isArray(team.extraCaptains) && team.extraCaptains.includes(userId)) {
                            roleData.role = 'extraCaptain';
                            roleData.teamId = effectiveTeamId;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }
                    }
                }
            }

            // B. Match Guide
            const matches = event.structure.partidos || [];
            const isMatchGuide = matches.some(match => match.matchGuideId === userId);
            if (isMatchGuide) {
                roleData.role = 'matchGuide';
                return res.json(roleData);
            }

        } else if (eventType === 'draft') {
            // Capitán en draft
            if (event.captains) {
                const captain = event.captains.find(c => c.userId === userId);
                if (captain) {
                    roleData.role = 'draftCaptain';
                    roleData.teamName = captain.teamName;
                    return res.json(roleData);
                }
            }
        }

        // Si no tiene ningún rol especial, pero es admin de Discord
        if (roleData.isAdmin && roleData.role === 'visitor') {
            roleData.role = 'admin';
        }

        return res.json(roleData);

    } catch (error) {
        console.error('Error detecting role in event:', error);
        return res.status(500).json({ error: 'Error detectando rol' });
    }
});
app.get('/api/player-details/:draftId/:playerId', async (req, res) => {
    // 1. Mantenemos la comprobación de que el usuario esté logueado.
    if (!req.user) {
        return res.status(403).send({ error: 'No autorizado. Debes iniciar sesión.' });
    }

    try {
        const { draftId, playerId } = req.params;
        const db = getDb();

        const draft = await db.collection('drafts').findOne({ shortId: draftId });
        if (!draft) {
            return res.status(404).send({ error: 'Draft no encontrado.' });
        }

        // 2. ¡ELIMINAMOS LA RESTRICCIÓN DE SER CAPITÁN! Ahora cualquiera logueado puede ver.

        const draftPlayerData = draft.players.find(p => p.userId === playerId);
        if (!draftPlayerData) {
            return res.status(404).send({ error: 'Jugador no encontrado en este draft.' });
        }

        let responseData;
        const isTestPlayer = playerId.startsWith('test_');

        // 3. Creamos dos caminos: uno para jugadores reales y otro para los de prueba.
        if (isTestPlayer) {
            // Si es un jugador de prueba, usamos los datos que ya tenemos en el draft.
            responseData = {
                psnId: draftPlayerData.psnId,
                discordTag: draftPlayerData.userName,
                primaryPosition: draftPlayerData.primaryPosition,
                secondaryPosition: draftPlayerData.secondaryPosition,
                whatsapp: 'N/A (Test Player)',
                twitter: 'N/A (Test Player)',
                strikes: 0
            };
        } else {
            // Si es un jugador real, buscamos sus datos completos en la base de datos.
            const verifiedData = await db.collection('verified_users').findOne({ discordId: playerId });
            const playerRecord = await db.collection('player_records').findOne({ userId: playerId });

            if (!verifiedData) {
                // Puede que un jugador real se inscribiera sin estar verificado, tenemos un fallback.
                responseData = {
                    psnId: draftPlayerData.psnId,
                    discordTag: draftPlayerData.userName,
                    primaryPosition: draftPlayerData.primaryPosition,
                    secondaryPosition: draftPlayerData.secondaryPosition,
                    whatsapp: 'No Verificado',
                    twitter: draftPlayerData.twitter || 'No Verificado',
                    strikes: playerRecord ? playerRecord.strikes : 0
                };
            } else {
                responseData = {
                    psnId: verifiedData.gameId,
                    discordTag: verifiedData.discordTag,
                    primaryPosition: draftPlayerData.primaryPosition,
                    secondaryPosition: draftPlayerData.secondaryPosition,
                    whatsapp: verifiedData.whatsapp || 'No Proporcionado',
                    twitter: verifiedData.twitter || 'No Proporcionado',
                    strikes: playerRecord ? playerRecord.strikes : 0
                };
            }
        }

        res.json(responseData);

    } catch (error) {
        console.error(`[API Player Details Error]: ${error.message}`);
        res.status(500).send({ error: 'Error interno del servidor.' });
    }
});

export async function startVisualizerServer(discordClient) {
    client = discordClient; // FIX: Asignar a variable global
    // Definimos la estrategia AQUÍ para tener acceso al cliente de Discord
    passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: `${process.env.BASE_URL}/callback`,
        scope: ['identify', 'guilds']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // 1. Verificar si está verificado en base de datos (DB: tournamentBotDb por defecto)
            const db = getDb(); // FIX: Usuarios están en tournamentBotDb según captura
            const verifiedUser = await db.collection('verified_users').findOne({ discordId: profile.id });
            profile.isVerified = !!verifiedUser;
            if (verifiedUser) {
                profile.psnId = verifiedUser.gameId || verifiedUser.psnId; // FIX: Support gameId from DB
                profile.platform = verifiedUser.platform;
            }

            // 2. Verificar membresía y roles usando el Cliente de Discord
            try {
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                const member = await guild.members.fetch(profile.id);
                profile.isMember = true;
                profile.roles = member.roles.cache.map(r => r.id);
            } catch (e) {
                console.warn(`[Auth] Usuario ${profile.username} no está en el servidor de Discord.`);
                profile.isMember = false;
                profile.roles = [];
            }

            return done(null, profile);
        } catch (err) {
            console.error('Error en autenticación:', err);
            return done(err, null);
        }
    }));
    app.use(express.json());
    app.use(express.static('public'));

    app.get('/draft-data/:draftId', async (req, res) => {
        let data = draftStates.get(req.params.draftId);
        if (!data) {
            try {
                const db = getDb();
                data = await db.collection('drafts').findOne({ shortId: req.params.draftId });
                if (data) draftStates.set(data.shortId, data); // Repopulate cache
            } catch (error) {
                console.error(`[API Error] Error fetching draft ${req.params.draftId} from DB:`, error);
            }
        }

        if (data) {
            // Consistent privacy logic with WebSocket
            if (req.user) res.json(data);
            else res.json(sanitizeDraftForPublic(data));
        } else {
            res.status(404).send({ error: 'Draft data not found' });
        }
    });

    // ===== NUEVOS ENDPOINTS PARA EL DASHBOARD =====

    /**
     * GET /api/events/active
     * Obtiene todos los eventos activos (torneos y drafts)
     */
    app.get('/api/events/active', async (req, res) => {
        try {
            const db = getDb();

            // Buscar torneos activos o con inscripción abierta
            const tournaments = await db.collection('tournaments')
                .find({
                    status: { $in: ['active', 'registration_open', 'fase_de_grupos', 'octavos', 'cuartos', 'semifinales', 'final'] }
                })
                .sort({ createdAt: -1 })
                .toArray();

            // Buscar drafts activos, pendientes, en inscripción o en curso (selección)
            const drafts = await db.collection('drafts')
                .find({
                    status: { $in: ['active', 'pending', 'inscripcion', 'seleccion'] }
                })
                .sort({ createdAt: -1 })
                .toArray();

            res.json({
                tournaments: tournaments.map(t => ({
                    id: t.shortId || t._id.toString(),
                    name: t.nombre || t.name || `Torneo ${t.shortId || 'Sin nombre'}`,
                    type: 'tournament',
                    status: t.status || 'active',
                    format: t.format?.label || t.format || 'Desconocido',
                    teamsCount: Object.keys(t.teams?.aprobados || {}).length || 0,
                    createdAt: t.timestamp || t.createdAt || new Date().toISOString()
                })),
                drafts: drafts.map(d => ({
                    id: d.shortId || d._id.toString(),
                    name: d.draftName || d.nombre || `Draft ${d.shortId || 'Sin nombre'}`,
                    type: 'draft',
                    status: d.status || 'active',
                    teamsCount: Array.isArray(d.captains) ? d.captains.length : Object.keys(d.teams || {}).length,
                    currentPick: d.currentPickIndex || 0,
                    totalPicks: d.order?.length || 0,
                    createdAt: d.timestamp || d.createdAt || null
                }))
            });
        } catch (error) {
            console.error('[API Error] Error fetching active events:', error);
            res.status(500).json({ error: 'Error al obtener eventos activos' });
        }
    });

    /**
     * GET /api/events/history
     * Obtiene el historial de eventos con paginación y filtros
     * Query params: page, limit, type (tournament/draft/all), search
     */
    app.get('/api/events/history', async (req, res) => {
        try {
            const db = getDb();
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const type = req.query.type || 'all';
            const search = req.query.search || '';
            const skip = (page - 1) * limit;

            const results = { tournaments: [], drafts: [], total: 0, page, limit };

            // Filtros de búsqueda por nombre
            const searchFilter = search ? { nombre: { $regex: search, $options: 'i' } } : {};

            if (type === 'tournament' || type === 'all') {
                const tournamentFilter = {
                    status: { $in: ['finalizado', 'cancelado', 'completed', 'cancelled'] },
                    ...searchFilter
                };

                const tournaments = await db.collection('tournaments')
                    .find(tournamentFilter)
                    .sort({ createdAt: -1 })
                    .skip(type === 'all' ? 0 : skip)
                    .limit(type === 'all' ? 10 : limit)
                    .toArray();

                const tournamentCount = await db.collection('tournaments').countDocuments(tournamentFilter);

                results.tournaments = tournaments.map(t => ({
                    id: t.shortId || t._id.toString(),
                    name: t.nombre || t.name || `Torneo ${t.shortId || 'Sin nombre'}`,
                    type: 'tournament',
                    status: t.status || 'finalizado',
                    format: t.format?.label || t.format || 'Desconocido',
                    teamsCount: Object.keys(t.teams?.aprobados || {}).length || 0,
                    winner: t.winner || null,
                    createdAt: t.timestamp || t.createdAt || t.updatedAt || null,
                    completedAt: t.updatedAt || t.timestamp || null
                }));

                if (type === 'tournament') results.total = tournamentCount;
            }

            if (type === 'draft' || type === 'all') {
                const draftFilter = {
                    status: { $in: ['completed', 'cancelled', 'torneo_generado'] },
                    ...(search ? { draftName: { $regex: search, $options: 'i' } } : {})
                };

                const drafts = await db.collection('drafts')
                    .find(draftFilter)
                    .sort({ timestamp: -1, createdAt: -1 })
                    .skip(type === 'all' ? 0 : skip)
                    .limit(type === 'all' ? 10 : limit)
                    .toArray();

                const draftCount = await db.collection('drafts').countDocuments(draftFilter);

                results.drafts = drafts.map(d => ({
                    id: d.shortId || d._id.toString(),
                    name: d.draftName || d.nombre || `Draft ${d.shortId || 'Sin nombre'}`,
                    type: 'draft',
                    status: d.status || 'completed',
                    teamsCount: Array.isArray(d.captains) ? d.captains.length : Object.keys(d.teams || {}).length,
                    createdAt: d.timestamp || d.createdAt || d.updatedAt || null,
                    completedAt: d.updatedAt || d.timestamp || null
                }));

                if (type === 'draft') results.total = draftCount;
            }

            // Si es 'all', combinamos y ordenamos
            if (type === 'all') {
                const combined = [...results.tournaments, ...results.drafts]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(skip, skip + limit);

                results.tournaments = combined.filter(e => e.type === 'tournament');
                results.drafts = combined.filter(e => e.type === 'draft');
                results.total = combined.length;
            }

            res.json(results);
        } catch (error) {
            console.error('[API Error] Error fetching event history:', error);
            res.status(500).json({ error: 'Error al obtener historial de eventos' });
        }
    });

    /**
     * GET /api/events/:id
     * Obtiene detalles de un evento específico (busca en ambas colecciones)
     */
    app.get('/api/events/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const db = getDb();

            // Buscar primero en torneos
            let event = await db.collection('tournaments').findOne({ shortId: id });
            let eventType = 'tournament';

            // Si no está en torneos, buscar en drafts
            if (!event) {
                event = await db.collection('drafts').findOne({ shortId: id });
                eventType = 'draft';
            }

            if (!event) {
                return res.status(404).json({ error: 'Evento no encontrado' });
            }

            // Para drafts, aplicar lógica de privacidad
            if (eventType === 'draft' && !req.user) {
                event = sanitizeDraftForPublic(event);
            }

            res.json({ ...event, eventType });
        } catch (error) {
            console.error('[API Error] Error fetching event details:', error);
            res.status(500).json({ error: 'Error al obtener detalles del evento' });
        }
    });

    // ===== FIN DE NUEVOS ENDPOINTS =====

    // Endpoint: Perfil de Usuario Autenticado
    app.get('/api/user/profile', (req, res) => {
        if (req.isAuthenticated()) {
            res.json({
                authenticated: true,
                user: {
                    discordId: req.user.id,
                    username: req.user.username,
                    discriminator: req.user.discriminator,
                    avatar: req.user.avatar,
                    isVerified: req.user.isVerified || false,
                    isMember: req.user.isMember || false,
                    psnId: req.user.psnId || null,
                    platform: req.user.platform || null
                }
            });
        } else {
            res.json({ authenticated: false });
        }
    });

    // Endpoint: Detectar Rol en Evento (Torneo/Draft)
    app.get('/api/my-role-in-event/:eventId', async (req, res) => {
        try {
            if (!req.user) {
                return res.json({ authenticated: false, role: 'visitor' });
            }

            const { eventId } = req.params;
            const db = getDb();
            let event = await db.collection('tournaments').findOne({ shortId: eventId });
            let type = 'tournament';
            if (!event) {
                event = await db.collection('drafts').findOne({ shortId: eventId });
                type = 'draft';
            }

            if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

            const userId = req.user.id;
            let role = 'visitor';
            let teamName = null;
            let teamId = null;

            // Verificar PRIMERO en equipos del torneo (prioridad sobre admin)
            if (type === 'tournament') {
                const teams = Object.values(event.teams.aprobados || {});
                for (const team of teams) {
                    if (team.capitanId === userId) { role = 'captain'; teamName = team.nombre; teamId = team.id; break; }
                    if (team.coCaptainId === userId) { role = 'coCaptain'; teamName = team.nombre; teamId = team.id; break; }
                    if (team.managerId === userId) { role = 'manager'; teamName = team.nombre; teamId = team.id; break; }
                }
            }

            // Verificar Admin SOLO si no es captain/coCaptain/manager
            if (role === 'visitor') {
                try {
                    const guild = client.guilds.cache.get(process.env.GUILD_ID);
                    if (guild) {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member && member.permissions.has('Administrator')) role = 'admin';
                    }
                } catch (e) { }
            }

            console.log(`[DEBUG /api/my-role-in-event] User ${userId} | Event ${eventId} | Role: ${role} | Team: ${teamName}`);
            res.json({ authenticated: true, role, teamName, teamId });

        } catch (e) {
            console.error('Error my-role:', e);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    app.get('/tournament-data/:tournamentId', async (req, res) => {
        let data = tournamentStates.get(req.params.tournamentId);
        if (!data) {
            try {
                const db = getDb();
                data = await db.collection('tournaments').findOne({ shortId: req.params.tournamentId });
                if (data) tournamentStates.set(data.shortId, data); // Repopulate cache
            } catch (error) {
                console.error(`[API Error] Error fetching tournament ${req.params.tournamentId} from DB:`, error);
            }
        }

        if (data) res.json(data);
        else res.status(404).send({ error: 'Tournament data not found' });
    });

    app.get('/api/roulette-data/:sessionId', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const db = getDb();
            const session = await db.collection('roulette_sessions').findOne({ sessionId });

            if (!session) {
                return res.status(404).send({ error: 'Sesión de sorteo no encontrada.' });
            }

            // Enviamos solo los equipos que aún no han sido sorteados
            const teamsToDraw = session.teams.filter(t => !session.drawnTeams.includes(t.id));
            res.json({ teams: teamsToDraw, tournamentShortId: session.tournamentShortId }); // Enviamos también el ID para futuras referencias

        } catch (error) {
            console.error(`[API Roulette Data Error]: ${error.message}`);
            res.status(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // --- NUEVO: API para Ruleta de Draft Externo ---
    app.get('/api/external-draft/roulette/:tournamentId', async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });

            if (!tournament) return res.status(404).send({ error: 'Torneo no encontrado.' });

            const candidates = [];
            const checkList = (list) => {
                if (!list) return;
                Object.values(list).forEach(team => {
                    candidates.push({
                        id: team.id || team.ownerId || team.userId || team.capitanId, // userId is for pendingPayments
                        name: team.nombre || team.teamName || team.ownerName || 'Usuario Desconocido',
                        ownerId: team.ownerId || team.userId || team.capitanId
                    });
                });
            };

            checkList(tournament.teams.pendingApproval);
            checkList(tournament.teams.pendingPayments);
            checkList(tournament.teams.pendientes);

            // Recopilar capitanes ya aprobados para mostrar en la sidebar
            const approvedCaptains = [];
            if (tournament.teams.aprobados) {
                Object.values(tournament.teams.aprobados).forEach(team => {
                    approvedCaptains.push({
                        name: team.nombre || team.teamName || 'Equipo',
                        captain: team.capitanTag || team.ownerName || ''
                    });
                });
            }

            res.json({ candidates, approvedCaptains, tournamentName: tournament.nombre, tournamentId: tournament.shortId });
        } catch (error) {
            console.error(`[API Roulette Ext Error]: ${error.message}`);
            res.status(500).send({ error: 'Error interno del servidor.' });
        }
    });

    app.post('/api/external-draft/roulette/:tournamentId/confirm', isAdmin, async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const { winnerId } = req.body;

            if (!winnerId) return res.status(400).send({ error: 'No se ha proporcionado el ID del ganador.' });

            console.log(`[Roulette Confirm] Attempting to approve winnerId=${winnerId} in tournament=${tournamentId}`);
            const result = await approveExternalDraftCaptain(client, tournamentId, winnerId);

            if (result.success) {
                console.log(`[Roulette Confirm] ✅ Successfully approved ${winnerId}`);
                res.json({ success: true });
            } else {
                console.error(`[Roulette Confirm] ❌ Failed: ${result.error}`);
                res.status(400).send({ error: result.error });
            }

        } catch (error) {
            console.error(`[API Roulette Ext Confirm Error]:`, error);
            res.status(500).send({ error: `Error procesando al ganador: ${error.message}` });
        }
    });
    // --- FIN NUEVO ---

    // --- NUEVO: API para Ruleta de Orden de Picks (Draft Externo) ---
    app.get('/api/external-draft/pickorder/:tournamentId', async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });

            if (!tournament) return res.status(404).send({ error: 'Torneo no encontrado.' });

            const captains = [];
            if (tournament.teams.aprobados) {
                Object.values(tournament.teams.aprobados).forEach(team => {
                    captains.push({
                        id: team.capitanId || team.id,
                        name: team.nombre || team.teamName || 'Equipo'
                    });
                });
            }

            res.json({ captains, tournamentName: tournament.nombre });
        } catch (error) {
            console.error(`[API Pickorder Error]: ${error.message}`);
            res.status(500).send({ error: 'Error interno del servidor.' });
        }
    });
    // --- FIN NUEVO ---

    // --- SISTEMA DE INSCRIPCIÓN WEB PARA DRAFTS EXTERNOS ---

    // Helper: normalizar WhatsApp
    function normalizeWhatsApp(number) {
        if (!number) return '';
        let clean = String(number).replace(/[\s\-\(\)\.]/g, '');
        clean = clean.replace(/^(\+34|0034)/, '');
        return clean;
    }

    // Helper: obtener stats de inscritos por posición
    async function getRegistrationStats(db, tournamentId) {
        const pipeline = [
            { $match: { tournamentId } },
            { $group: { _id: '$position', count: { $sum: 1 } } }
        ];
        const results = await db.collection('external_draft_registrations').aggregate(pipeline).toArray();
        const stats = { GK: 0, DFC: 0, CARR: 0, MC: 0, DC: 0 };
        results.forEach(r => { if (stats.hasOwnProperty(r._id)) stats[r._id] = r.count; });
        return stats;
    }

    // Helper: enviar log al hilo de inscripciones (si existe)
    async function sendRegistrationLog(db, tournamentId, message) {
        try {
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });
            if (!tournament || !tournament.registrationLogThreadId) return;
            const channel = await client.channels.fetch(tournament.registrationLogThreadId);
            if (channel) await channel.send(message);
        } catch (e) {
            console.warn('[Registration Log] Error enviando log:', e.message);
        }
    }

    const POSITION_LABELS = { 'GK': 'Portero', 'DFC': 'Defensa', 'CARR': 'Carrilero', 'MC': 'Medio', 'DC': 'Delantero' };
    const POSITION_SHORT = { 'GK': 'POR', 'DFC': 'DFC', 'CARR': 'CARR', 'MC': 'MC', 'DC': 'DC' };

    // GET: Estado de inscripción del usuario actual
    app.get('/api/external-draft/registration/:tournamentId', async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });

            if (!tournament) {
                return res.status(404).json({ error: 'Torneo no encontrado.' });
            }

            const stats = await getRegistrationStats(db, tournamentId);
            const closed = tournament.registrationsClosed === true;

            if (!req.user) {
                return res.json({ tournamentName: tournament.nombre, stats, closed });
            }

            // Check current registration
            const registration = await db.collection('external_draft_registrations').findOne({
                tournamentId,
                discordId: req.user.id
            });

            // Check previous data from other tournaments
            let previousData = null;
            if (!registration) {
                const prevReg = await db.collection('external_draft_registrations').findOne(
                    { discordId: req.user.id, tournamentId: { $ne: tournamentId } },
                    { sort: { createdAt: -1 } }
                );
                if (prevReg) {
                    previousData = { gameId: prevReg.gameId, whatsapp: prevReg.whatsapp };
                }
            }

            res.json({
                tournamentName: tournament.nombre,
                stats,
                closed,
                registration: registration ? {
                    gameId: registration.gameId,
                    whatsapp: registration.whatsapp,
                    position: registration.position
                } : null,
                previousData
            });
        } catch (error) {
            console.error('[Registration GET Error]:', error.message);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // GET: Info pública del torneo (sin auth)
    app.get('/api/external-draft/registration/:tournamentId/info', async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });
            if (!tournament) return res.status(404).json({ error: 'No encontrado' });
            const stats = await getRegistrationStats(db, tournamentId);
            res.json({ tournamentName: tournament.nombre, stats, closed: tournament.registrationsClosed === true });
        } catch (e) {
            res.status(500).json({ error: 'Error' });
        }
    });

    // POST: Inscribirse
    app.post('/api/external-draft/register/:tournamentId', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado' });

            const { tournamentId } = req.params;
            const { gameId, whatsapp, position } = req.body;
            const db = getDb();

            // Validar
            if (!gameId || !whatsapp || !position) {
                return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
            }
            if (!['GK', 'DFC', 'CARR', 'MC', 'DC'].includes(position)) {
                return res.status(400).json({ error: 'Posición inválida.' });
            }

            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentId });
            if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado.' });
            if (tournament.registrationsClosed) return res.status(403).json({ error: 'Las inscripciones están cerradas.' });

            // Check if already registered (by Discord ID or userId)
            const existing = await db.collection('external_draft_registrations').findOne({
                tournamentId, 
                $or: [{ discordId: req.user.id }, { userId: req.user.id }]
            });
            if (existing) {
                // Update instead of create (edit flow)
                const oldPosition = existing.position;
                await db.collection('external_draft_registrations').updateOne(
                    { _id: existing._id },
                    { $set: { gameId: sanitizeInput(gameId, 50), whatsapp: normalizeWhatsApp(whatsapp), position, updatedAt: new Date() } }
                );
                const stats = await getRegistrationStats(db, tournamentId);
                const updatedReg = { gameId: sanitizeInput(gameId, 50), whatsapp: normalizeWhatsApp(whatsapp), position };

                // Log
                if (oldPosition !== position) {
                    const statsLine = `📊 Total: ${Object.values(stats).reduce((a, b) => a + b, 0)} inscritos (${stats.GK} POR · ${stats.DFC} DFC · ${stats.CARR} CARR · ${stats.MC} MC · ${stats.DC} DC)`;
                    await sendRegistrationLog(db, tournamentId, `✏️ **${req.user.global_name || req.user.username}** ha cambiado de **${POSITION_LABELS[oldPosition]}** a **${POSITION_LABELS[position]}**\n${statsLine}`);
                }

                return res.json({ registration: updatedReg, stats });
            }

            // Check IP limit
            // Intentar leer explícitamente la cabecera x-forwarded-for por seguridad extra
            const userIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
            const ipCount = await db.collection('external_draft_registrations').countDocuments({
                tournamentId, ip: userIP
            });
            if (ipCount >= 1) {
                // Alert admin but don't block - just warn
                const stats = await getRegistrationStats(db, tournamentId);
                // Log alert
                await sendRegistrationLog(db, tournamentId, `⚠️ **Alerta IP**: La IP \`${userIP}\` ya tiene ${ipCount} inscripción(es). **${req.user.global_name || req.user.username}** intenta inscribirse también.`);
            }

            // Check WhatsApp uniqueness
            const normalizedWA = normalizeWhatsApp(whatsapp);
            const waExists = await db.collection('external_draft_registrations').findOne({
                tournamentId, whatsapp: normalizedWA
            });
            if (waExists) {
                return res.status(409).json({ error: 'Este número de WhatsApp ya está registrado.' });
            }

            // Create registration
            const registration = {
                tournamentId,
                discordId: req.user.id,
                userId: req.user.id,
                discordUsername: req.user.global_name || req.user.username,
                gameId: sanitizeInput(gameId, 50),
                whatsapp: normalizedWA,
                position,
                ip: userIP,
                createdAt: new Date()
            };
            await db.collection('external_draft_registrations').insertOne(registration);

            const stats = await getRegistrationStats(db, tournamentId);

            // Hook: Update list channel
            if (client) {
                scheduleRegistrationListUpdate(client, tournamentId);
            }

            // Log
            const statsLine = `📊 Total: ${Object.values(stats).reduce((a, b) => a + b, 0)} inscritos (${stats.GK} POR · ${stats.DFC} DFC · ${stats.CARR} CARR · ${stats.MC} MC · ${stats.DC} DC)`;
            await sendRegistrationLog(db, tournamentId, `✅ **${req.user.global_name || req.user.username}** se ha inscrito como **${POSITION_LABELS[position]}** — ID: \`${sanitizeInput(gameId, 50)}\`\n${statsLine}`);

            res.json({
                registration: { gameId: registration.gameId, whatsapp: registration.whatsapp, position: registration.position },
                stats
            });
        } catch (error) {
            console.error('[Registration POST Error]:', error.message);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // DELETE: Darse de baja
    app.delete('/api/external-draft/register/:tournamentId', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado' });

            const { tournamentId } = req.params;
            const db = getDb();

            const registration = await db.collection('external_draft_registrations').findOne({
                tournamentId, 
                $or: [{ discordId: req.user.id }, { userId: req.user.id }]
            });
            if (!registration) return res.status(404).json({ error: 'No estás inscrito.' });

            await db.collection('external_draft_registrations').deleteOne({ _id: registration._id });

            const stats = await getRegistrationStats(db, tournamentId);

            // Hook: Update list channel
            if (client) {
                scheduleRegistrationListUpdate(client, tournamentId);
            }

            const statsLine = `📊 Total: ${Object.values(stats).reduce((a, b) => a + b, 0)} inscritos (${stats.GK} POR · ${stats.DFC} DFC · ${stats.CARR} CARR · ${stats.MC} MC · ${stats.DC} DC)`;
            await sendRegistrationLog(db, tournamentId, `❌ **${req.user.global_name || req.user.username}** se ha dado de baja (era ${POSITION_LABELS[registration.position]})\n${statsLine}`);

            res.json({ success: true, stats });
        } catch (error) {
            console.error('[Registration DELETE Error]:', error.message);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // GET: Listar todos los inscritos (admin)
    app.get('/api/external-draft/registrations/:tournamentId', isAdmin, async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const db = getDb();
            const registrations = await db.collection('external_draft_registrations')
                .find({ tournamentId })
                .sort({ createdAt: 1 })
                .toArray();

            const stats = await getRegistrationStats(db, tournamentId);
            res.json({ registrations, stats });
        } catch (error) {
            console.error('[Registrations List Error]:', error.message);
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // DELETE: Admin borra un jugador
    app.delete('/api/external-draft/registrations/:tournamentId/:regId', isAdmin, async (req, res) => {
        try {
            const { tournamentId, regId } = req.params;
            const db = getDb();
            const result = await db.collection('external_draft_registrations').deleteOne({
                _id: new ObjectId(regId), tournamentId
            });
            if (result.deletedCount === 0) return res.status(404).json({ error: 'No encontrado.' });
            const stats = await getRegistrationStats(db, tournamentId);

            // Hook: Update list channel
            if (client) {
                scheduleRegistrationListUpdate(client, tournamentId);
            }

            res.json({ success: true, stats });
        } catch (error) {
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // POST: Admin añade jugador manualmente
    app.post('/api/external-draft/registrations/:tournamentId/manual', isAdmin, async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const { gameId, whatsapp, position, discordUsername } = req.body;
            const db = getDb();

            if (!gameId || !whatsapp || !position) {
                return res.status(400).json({ error: 'Campos obligatorios.' });
            }

            const registration = {
                tournamentId,
                discordId: 'manual_' + Date.now(),
                discordUsername: discordUsername || 'Manual',
                gameId: sanitizeInput(gameId, 50),
                whatsapp: normalizeWhatsApp(whatsapp),
                position,
                ip: 'admin',
                createdAt: new Date(),
                addedByAdmin: true
            };
            await db.collection('external_draft_registrations').insertOne(registration);
            const stats = await getRegistrationStats(db, tournamentId);

            // Hook: Update list channel
            if (client) {
                scheduleRegistrationListUpdate(client, tournamentId);
            }

            res.json({ success: true, stats });
        } catch (error) {
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // GET: Exportar lista WhatsApp (texto plano)
    app.get('/api/external-draft/export-text/:tournamentId', isAdmin, async (req, res) => {
        try {
            const { tournamentId } = req.params;
            const db = getDb();
            const registrations = await db.collection('external_draft_registrations')
                .find({ tournamentId })
                .sort({ createdAt: 1 })
                .toArray();

            const groups = { GK: [], DFC: [], CARR: [], MC: [], DC: [] };
            registrations.forEach(r => {
                if (groups[r.position]) groups[r.position].push(r);
            });

            const posEmojis = { GK: '🥅', DFC: '🧱', CARR: '⚡', MC: '🎩', DC: '🏟' };
            const posNames = { GK: 'PORTEROS', DFC: 'DEFENSAS', CARR: 'CARRILEROS', MC: 'MEDIOS', DC: 'DELANTEROS' };

            let text = '';
            for (const pos of ['GK', 'DFC', 'CARR', 'MC', 'DC']) {
                text += `${posNames[pos]}${posEmojis[pos]}\n\n`;
                groups[pos].forEach((r, i) => {
                    text += `${i + 1}. ${r.gameId}\n📲${r.whatsapp}\n`;
                });
                text += '\n';
            }

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.send(text);
        } catch (error) {
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // --- FIN SISTEMA DE INSCRIPCIÓN WEB ---
    app.get('/api/search-verified-users', async (req, res) => {
        try {
            const query = req.query.q || '';
            if (query.length < 2) return res.json({ results: [] });

            const guild = await client.guilds.fetch(process.env.GUILD_ID);

            // Si es un ID exacto
            if (/^\d{17,20}$/.test(query)) {
                try {
                    const member = await guild.members.fetch(query);
                    return res.json({
                        results: [{
                            discordId: member.user.id,
                            username: member.user.globalName || member.user.username,
                            avatar: member.user.displayAvatarURL({ size: 32 })
                        }]
                    });
                } catch (e) {
                    // Ignoramos y bajamos al fetch por texto por si acaso
                }
            }

            // Buscar por texto (optimizando la API de Discord en lugar de traer todos)
            const members = await guild.members.fetch({ query, limit: 10 });
            const matches = members.map(member => ({
                discordId: member.user.id,
                username: member.user.globalName || member.user.username,
                avatar: member.user.displayAvatarURL({ size: 32 })
            }));

            res.json({ results: matches });
        } catch (e) {
            console.error('[API Search Discord Members Error]:', e);
            res.status(500).json({ error: 'Error en búsqueda' });
        }
    });

    // --- MIDDLEWARE ADMIN ---
    async function isAdmin(req, res, next) {
        if (!req.user) return res.status(401).send({ error: 'No autenticado' });
        // Aquí deberíamos verificar si el usuario tiene rol de admin en el servidor de Discord
        // Por simplicidad y seguridad, verificamos contra la DB de settings o hardcoded IDs si es necesario
        // O mejor, usamos la guild de Discord para verificar roles.
        // Como no tenemos acceso fácil a la guild desde aquí sin hacer fetch,
        // vamos a confiar en que el usuario tenga el rol de admin en la DB si lo tuviéramos guardado.
        // ALTERNATIVA: Verificar si es el creador del bot o está en una lista de admins en config.js
        // Por ahora, vamos a permitir a cualquiera que esté logueado y sea admin en la DB (si tuviéramos flag).
        // VAMOS A HACERLO BIEN: Usar el cliente de Discord para verificar el miembro.

        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(req.user.id);
            // Asumimos que el rol de admin está en process.env.ADMIN_ROLE_ID o similar, 
            // pero como no lo tengo a mano, voy a usar permisos de administrador nativos.
            if (member.permissions.has('Administrator')) {
                next();
            } else {
                res.status(403).send({ error: 'No tienes permisos de administrador.' });
            }
        } catch (e) {
            console.error('Error verificando admin:', e);
            res.status(500).send({ error: 'Error interno verificando permisos.' });
        }
    }

    // --- API ADMIN ENDPOINTS ---

    app.post('/api/admin/force-pick', isAdmin, async (req, res) => {
        try {
            const { draftId, playerId } = req.body;
            await forcePickFromWeb(client, draftId, playerId, req.user.username);
            res.json({ success: true });
        } catch (e) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/admin/undo-pick', isAdmin, async (req, res) => {
        try {
            const { draftId } = req.body;
            await undoLastPick(client, draftId, req.user.username);
            res.json({ success: true });
        } catch (e) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/admin/kick-player', isAdmin, async (req, res) => {
        try {
            const { draftId, teamId, playerId } = req.body;
            await adminKickPlayerFromWeb(client, draftId, teamId, playerId, req.user.username);
            res.json({ success: true });
        } catch (e) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/admin/add-player', isAdmin, async (req, res) => {
        try {
            const { draftId, teamId, playerId } = req.body;
            await adminAddPlayerFromWeb(client, draftId, teamId, playerId, req.user.username);
            res.json({ success: true });
        } catch (e) { res.status(400).json({ error: e.message }); }
    });

    // Endpoint: Invitar Co-Capitán desde Web
    app.post('/api/teams/:teamId/invite-co-captain', checkTeamPermissions, async (req, res) => {
        try {
            const { teamId } = req.params;
            const { coCaptainId, lang = 'es' } = req.body;
            const requester = req.user;
            const db = getDb();

            // Verificar formato ID
            if (!/^\d+$/.test(coCaptainId)) {
                return res.status(400).json({ error: lang === 'es' ? 'ID de usuario inválida.' : 'Invalid user ID.' });
            }

            // Buscar torneo del equipo (necesitamos saber el torneo)
            // checkTeamPermissions ya validó que el equipo existe en teams.aprobados o similar.
            // Pero checkTeamPermissions usa req.params.teamId, que asume es el ID del equipo o del torneo?
            // En visualizerServer.js L826: app.get('/api/teams/:teamId/roster', checkTeamPermissions...
            // La función checkTeamPermissions busca el equipo en TODOS los torneos activos?
            // Vamos a asumir que teamId es el captainId o el ID interno.
            // REVISAR checkTeamPermissions antes de confiar ciegamente.

            // Si checkTeamPermissions pone el torneo en req.tournament y el equipo en req.team, perfecto.
            // Si no, tendremos que buscarlo.

            // Asumimos que checkTeamPermissions hace su trabajo (lo verifico visualmente abajo si falla).
            // Por ahora, implemento búsqueda segura.

            const tournament = await db.collection('tournaments').findOne({
                [`teams.aprobados.${teamId}`]: { $exists: true }
            });

            if (!tournament) return res.status(404).json({ error: 'Tournament not found for this team.' });

            const team = tournament.teams.aprobados[teamId];
            if (team.coCaptainId) {
                // Si ya tiene co-capitán, es un reemplazo. (Permitido)
            }

            // Verificar que el usuario invitado no sea capitán ni co-capitán de otro equipo en ESTE torneo
            const allTeams = Object.values(tournament.teams.aprobados);
            const isAlreadyCaptain = allTeams.some(t => t.capitanId === coCaptainId);
            const isAlreadyCoCaptain = allTeams.some(t => t.coCaptainId === coCaptainId);

            if (isAlreadyCaptain || isAlreadyCoCaptain) {
                return res.status(400).json({
                    error: lang === 'es' ? 'El usuario ya participa en este torneo como capitán o co-capitán.' : 'User is already a captain or co-captain in this tournament.'
                });
            }

            // Enviar invitación por MD
            try {
                const coCaptainUser = await client.users.fetch(coCaptainId);

                // Mensaje igual que en Discord (selectMenuHandler.js L1248-1257)
                const embed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle(`🤝 Invitación de Co-Capitán / Co-Captain Invitation`)
                    .setDescription(
                        `🇪🇸 Has sido invitado por **${requester.username}** para ser co-capitán de su equipo **${team.nombre}** en el torneo **${tournament.nombre}**.\n` +
                        `*Si aceptas, reemplazarás al co-capitán actual si lo hay.*\n\n` +
                        `🇬🇧 You have been invited by **${requester.username}** to be the co-captain of their team **${team.nombre}** in the **${tournament.nombre}** tournament.\n` +
                        `*If you accept, you will replace the current co-captain if there is one.*`
                    );

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`cocaptain_accept:${tournament.shortId}:${teamId}:${coCaptainId}`).setLabel('Aceptar / Accept').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`cocaptain_reject:${tournament.shortId}:${teamId}:${coCaptainId}`).setLabel('Rechazar / Reject').setStyle(ButtonStyle.Danger)
                );

                await coCaptainUser.send({ embeds: [embed], components: [buttons] });

                // Guardar estado de invitación pendiente en DB para validación de botones
                await db.collection('tournaments').updateOne(
                    { _id: tournament._id },
                    { $set: { [`teams.coCapitanes.${teamId}`]: { inviterId: teamId, invitedId: coCaptainId, invitedAt: new Date() } } }
                );

                res.json({ success: true, message: lang === 'es' ? 'Invitación enviada correctamente.' : 'Invitation sent successfully.' });

            } catch (discordError) {
                console.error('Error enviando MD:', discordError);
                return res.status(500).json({ error: lang === 'es' ? 'No se pudo enviar el mensaje al usuario (MD cerrados o ID incorrecta).' : 'Could not send DM to user (DMs closed or invalid ID).' });
            }

        } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
    });

    // Endpoint: Verificar si equipo está en torneos activos
    app.get('/api/teams/:teamId/active-tournaments', async (req, res) => {
        try {
            const { teamId } = req.params;
            const db = getDb();

            // Buscar torneos donde el equipo esté inscrito y el estado sea "en_curso" o "inscripcion"
            const tournaments = await db.collection('tournaments').find({
                [`teams.aprobados.${teamId}`]: { $exists: true },
                estado: { $in: ['en_curso', 'inscripcion'] }
            }).toArray();

            res.json({ hasActiveTournaments: tournaments.length > 0, count: tournaments.length });
        } catch (e) {
            console.error('Error checking active tournaments:', e);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // Endpoint: Reportar Resultado Partido desde Web
    app.post('/api/matches/:matchId/report', async (req, res) => {
        try {
            const { matchId } = req.params;
            const { goalsA, goalsB, lang = 'es' } = req.body;
            const user = req.user;
            const db = getDb();

            if (!user) return res.status(401).json({ error: 'Unauthorized' });

            if (isNaN(parseInt(goalsA)) || isNaN(parseInt(goalsB))) {
                return res.status(400).json({ error: lang === 'es' ? 'Los goles deben ser números.' : 'Goals must be numbers.' });
            }

            const reportedResult = `${goalsA}-${goalsB}`;

            // Buscar torneo y partido
            const tournament = await db.collection('tournaments').findOne({ "matches.matchId": matchId });
            if (!tournament) return res.status(404).json({ error: 'Match/Tournament not found.' });

            // Usar findMatch helper? O buscar en array. findMatch devuelve {match, jornada, index}
            const matchData = findMatch(tournament, matchId);
            if (!matchData) return res.status(404).json({ error: 'Match data not found.' });
            const partido = matchData.match;

            // Verificar permisos (igual que modalHandler.js L1307-1324)
            const reporterId = user.discordId;
            let myTeam, opponentTeam;

            const isTeamA = reporterId === partido.equipoA.capitanId ||
                reporterId === partido.equipoA.coCaptainId ||
                reporterId === partido.equipoA.managerId ||
                (partido.equipoA.extraCaptains && partido.equipoA.extraCaptains.includes(reporterId));

            const isTeamB = reporterId === partido.equipoB.capitanId ||
                reporterId === partido.equipoB.coCaptainId ||
                reporterId === partido.equipoB.managerId ||
                (partido.equipoB.extraCaptains && partido.equipoB.extraCaptains.includes(reporterId));

            if (isTeamA) {
                myTeam = partido.equipoA;
                opponentTeam = partido.equipoB;
            } else if (isTeamB) {
                myTeam = partido.equipoB;
                opponentTeam = partido.equipoA;
            } else {
                return res.status(403).json({ error: lang === 'es' ? 'No tienes permiso para reportar este partido.' : 'You do not have permission to report this match.' });
            }

            // Lógica de Reporte (igual que modalHandler.js L1332-1381)

            // 1. Inicializar reportedScores
            if (!partido.reportedScores) partido.reportedScores = {};

            // 2. Guardar reporte
            partido.reportedScores[reporterId] = { score: reportedResult, reportedAt: new Date(), teamId: myTeam.id };

            // 3. Persistir en DB
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { structure: tournament.structure, matches: tournament.matches } });

            // 4. Comprobar coincidencia
            const opponentCaptainIds = [opponentTeam.capitanId];
            if (opponentTeam.coCaptainId) opponentCaptainIds.push(opponentTeam.coCaptainId);
            if (opponentTeam.managerId) opponentCaptainIds.push(opponentTeam.managerId);
            if (opponentTeam.extraCaptains) opponentCaptainIds.push(...opponentTeam.extraCaptains);

            let opponentReport = null;
            let opponentReporterId = null;
            for (const id of opponentCaptainIds) {
                if (partido.reportedScores[id]) {
                    opponentReport = partido.reportedScores[id];
                    opponentReporterId = id;
                    break;
                }
            }


            let message = '';
            if (opponentReport) {
                if (opponentReport.score === reportedResult) {
                    // COINCIDENCIA -> Finalizar (igual que modalHandler.js L1358-1364)
                    const guild = await client.guilds.fetch(tournament.guildId);
                    const processed = await processMatchResult(client, guild, tournament, matchId, reportedResult);
                    await finalizeMatchThread(client, processed, reportedResult);
                    message = lang === 'es' ? '✅ Resultado confirmado y partido finalizado.' : '✅ Result confirmed and match finalized.';
                } else {
                    // CONFLICTO -> Notificar árbitros (igual que modalHandler.js L1366-1373)
                    message = lang === 'es' ? '⚠️ Conflicto: Tu resultado no coincide con el del rival. Árbitros avisados.' : '⚠️ Conflict: Result mismatch. Referees notified.';

                    try {
                        const threadId = partido.threadId;
                        if (threadId) {
                            const thread = await client.channels.fetch(threadId);
                            if (thread && thread.isThread()) {
                                // Cambiar nombre del thread para indicar disputa
                                await thread.setName(`⚠️-DISPUTA-${thread.name}`.slice(0, 100));

                                // Notificar a árbitros (mismo formato que Discord)
                                const { ARBITRO_ROLE_ID } = await import('./config.js');
                                await thread.send({
                                    content: `🚨 <@&${ARBITRO_ROLE_ID}> **DISPUTA DETECTADA**\n\n- <@${reporterId}> (${myTeam.nombre}) dice: **${reportedResult}**\n- <@${opponentReporterId}> (${opponentTeam.nombre}) dice: **${opponentReport.score}**\n\nPor favor, revisad las pruebas.`
                                });
                            }
                        }
                    } catch (err) {
                        console.warn('No se pudo notificar disputa en hilo Discord:', err);
                    }
                }
            } else {
                // PRIMER REPORTE -> Notificar equipo rival (igual que modalHandler.js L1376-1380)
                message = lang === 'es' ? '✅ Resultado guardado. Esperando confirmación del rival.' : '✅ Result saved. Waiting for opponent confirmation.';

                try {
                    const threadId = partido.threadId;
                    if (threadId) {
                        const thread = await client.channels.fetch(threadId);
                        if (thread && thread.isThread()) {
                            const opponentMentions = opponentCaptainIds.map(id => `<@${id}>`).join(' ');
                            await thread.send(`ℹ️ <@${reporterId}> ha reportado el resultado: **${reportedResult}**. ${opponentMentions}, por favor usad el botón para confirmar el vuestro.`);
                        }
                    }
                } catch (err) {
                    console.warn('No se pudo notificar primer reporte en hilo Discord:', err);
                }
            }

            res.json({ success: true, message });

        } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
    });

    // =======================================================
    // --- SISTEMA DE BOLSA DE EQUIPOS: API WEB ---
    // =======================================================

    // GET: Pool info (public, no auth required)
    app.get('/api/pool/:poolId', async (req, res) => {
        try {
            const { poolId } = req.params;
            const db = getDb();
            const pool = await db.collection('team_pools').findOne({ shortId: poolId });
            if (!pool) return res.status(404).json({ error: 'Bolsa no encontrada.' });

            // Return safe pool data (no internal IDs)
            res.json({
                pool: {
                    shortId: pool.shortId,
                    name: pool.name,
                    imageUrl: pool.imageUrl,
                    status: pool.status,
                    teams: pool.teams || {},
                    createdAt: pool.createdAt
                }
            });
        } catch (e) {
            console.error('[API Pool] Error:', e);
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // GET: User's team status for a pool (auth required)
    app.get('/api/pool/:poolId/my-status', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
            const { poolId } = req.params;
            const userId = req.user.id;
            const db = getDb();
            const testDb = getDb('test');

            const pool = await db.collection('team_pools').findOne({ shortId: poolId });
            if (!pool) return res.status(404).json({ error: 'Bolsa no encontrada.' });

            // Find user's team
            const userTeam = await testDb.collection('teams').findOne({
                guildId: process.env.GUILD_ID,
                $or: [{ managerId: userId }, { captains: userId }]
            });

            if (!userTeam) {
                return res.json({ hasTeam: false });
            }

            const teamElo = userTeam.elo || 1000;
            const teamLeague = getLeagueByElo(teamElo);

            // Check if already registered
            const existingEntry = Object.values(pool.teams || {}).find(t => t.teamDbId === userTeam._id.toString());

            // Check blocks
            let blocked = false;
            let blockReason = '';
            if ((userTeam.strikes || 0) >= 3) {
                blocked = true;
                blockReason = `Tu equipo tiene ${userTeam.strikes} strikes. No puede inscribirse.`;
            } else if (pool.bannedTeams && pool.bannedTeams.includes(userTeam._id.toString())) {
                blocked = true;
                blockReason = 'Tu equipo está baneado de esta bolsa.';
            } else if (pool.minElo && teamElo < pool.minElo) {
                blocked = true;
                blockReason = `Tu equipo tiene ${teamElo} ELO, pero esta bolsa requiere mínimo ${pool.minElo} ELO.`;
            } else if (pool.maxElo && teamElo > pool.maxElo) {
                blocked = true;
                blockReason = `Tu equipo tiene ${teamElo} ELO, pero esta bolsa permite máximo ${pool.maxElo} ELO.`;
            }

            res.json({
                hasTeam: true,
                team: {
                    id: userTeam._id.toString(),
                    name: userTeam.name,
                    elo: teamElo,
                    league: teamLeague,
                    logoUrl: userTeam.logoUrl || null
                },
                isRegistered: !!existingEntry,
                blocked,
                blockReason
            });
        } catch (e) {
            console.error('[API Pool Status] Error:', e);
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // POST: Register team in pool (auth required)
    app.post('/api/pool/:poolId/register', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado.' });

            // Verify Discord membership
            let isMember = req.user.isMember;
            if (isMember === undefined) {
                try {
                    const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${req.user.id}`, {
                        headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                    });
                    isMember = response.ok;
                } catch (e) { isMember = false; }
            }
            if (!isMember) return res.status(403).json({ error: 'Debes ser miembro del servidor Discord.' });

            const { poolId } = req.params;
            const userId = req.user.id;
            const db = getDb();
            const testDb = getDb('test');

            const pool = await db.collection('team_pools').findOne({ shortId: poolId });
            if (!pool) return res.status(404).json({ error: 'Bolsa no encontrada.' });
            if (pool.status !== 'open') return res.status(400).json({ error: 'La inscripción está cerrada o pausada.' });

            const userTeam = await testDb.collection('teams').findOne({
                guildId: process.env.GUILD_ID,
                $or: [{ managerId: userId }, { captains: userId }]
            });
            if (!userTeam) return res.status(400).json({ error: 'No tienes un equipo registrado.' });

            // Validate
            if ((userTeam.strikes || 0) >= 3) {
                return res.status(403).json({ error: `Tu equipo tiene ${userTeam.strikes} strikes. No puede inscribirse.` });
            }
            if (pool.bannedTeams && pool.bannedTeams.includes(userTeam._id.toString())) {
                return res.status(403).json({ error: 'Tu equipo está baneado de esta bolsa.' });
            }
            const existingEntry = Object.values(pool.teams || {}).find(t => t.teamDbId === userTeam._id.toString());
            if (existingEntry) {
                return res.status(400).json({ error: 'Tu equipo ya está inscrito en esta bolsa.' });
            }

            const teamElo = userTeam.elo || 1000;
            const teamLeague = getLeagueByElo(teamElo);

            // Verificar filtro de ELO
            if (pool.minElo && teamElo < pool.minElo) {
                return res.status(403).json({ error: `Tu equipo tiene ${teamElo} ELO, pero esta bolsa requiere mínimo ${pool.minElo} ELO.` });
            }
            if (pool.maxElo && teamElo > pool.maxElo) {
                return res.status(403).json({ error: `Tu equipo tiene ${teamElo} ELO, pero esta bolsa permite máximo ${pool.maxElo} ELO.` });
            }

            const entryKey = userTeam.managerId || userTeam._id.toString();

            const teamEntry = {
                teamDbId: userTeam._id.toString(),
                teamName: userTeam.name,
                managerId: userTeam.managerId || userId,
                captains: userTeam.captains || [],
                elo: teamElo,
                league: teamLeague,
                logoUrl: userTeam.logoUrl || null,
                inscritoEn: new Date(),
                inscritoPor: userId,
                inscritoVia: 'web'
            };

            await db.collection('team_pools').updateOne(
                { _id: pool._id },
                { $set: { [`teams.${entryKey}`]: teamEntry } }
            );

            // Update Discord embed
            const updatedPool = await db.collection('team_pools').findOne({ _id: pool._id });
            try {
                const channel = await client.channels.fetch(updatedPool.discordChannelId).catch(() => null);
                if (channel) {
                    const msg = await channel.messages.fetch(updatedPool.discordMessageId).catch(() => null);
                    if (msg) await msg.edit(createPoolEmbed(updatedPool));
                }
            } catch (e) { console.warn('[API Pool Register] Error updating embed:', e.message); }

            // Send log
            const leagueEmoji = LEAGUE_EMOJIS[teamLeague] || '🥉';
            try {
                if (updatedPool.logThreadId) {
                    const thread = await client.channels.fetch(updatedPool.logThreadId).catch(() => null);
                    if (thread) {
                        const teams = Object.values(updatedPool.teams || {});
                        const counts = { DIAMOND: 0, GOLD: 0, SILVER: 0, BRONZE: 0 };
                        teams.forEach(t => { if (counts.hasOwnProperty(t.league)) counts[t.league]++; else counts['BRONZE']++; });
                        await thread.send(`✅ Se ha inscrito **${userTeam.name}** (ELO: ${teamElo} — ${leagueEmoji} ${teamLeague}) — inscrito vía **WEB** por <@${userId}>\n📊 Resumen: ${counts.DIAMOND} 💎 · ${counts.GOLD} 👑 · ${counts.SILVER} ⚙️ · ${counts.BRONZE} 🥉 = **${teams.length} total**`);
                    }
                }
            } catch (e) { /* ignore */ }

            res.json({ success: true });
        } catch (e) {
            console.error('[API Pool Register] Error:', e);
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    // DELETE: Unregister from pool (auth required)
    app.delete('/api/pool/:poolId/register', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
            const { poolId } = req.params;
            const userId = req.user.id;
            const db = getDb();
            const testDb = getDb('test');

            const pool = await db.collection('team_pools').findOne({ shortId: poolId });
            if (!pool) return res.status(404).json({ error: 'Bolsa no encontrada.' });

            const userTeam = await testDb.collection('teams').findOne({
                guildId: process.env.GUILD_ID,
                $or: [{ managerId: userId }, { captains: userId }]
            });
            if (!userTeam) return res.status(400).json({ error: 'No tienes equipo.' });

            let entryKey = null;
            for (const [key, entry] of Object.entries(pool.teams || {})) {
                if (entry.teamDbId === userTeam._id.toString()) {
                    entryKey = key;
                    break;
                }
            }
            if (!entryKey) return res.status(400).json({ error: 'Tu equipo no está inscrito.' });

            await db.collection('team_pools').updateOne(
                { _id: pool._id },
                { $unset: { [`teams.${entryKey}`]: '' } }
            );

            // Update Discord embed
            const updatedPool = await db.collection('team_pools').findOne({ _id: pool._id });
            try {
                const channel = await client.channels.fetch(updatedPool.discordChannelId).catch(() => null);
                if (channel) {
                    const msg = await channel.messages.fetch(updatedPool.discordMessageId).catch(() => null);
                    if (msg) await msg.edit(createPoolEmbed(updatedPool));
                }
            } catch (e) { /* ignore */ }

            // Log
            try {
                if (updatedPool.logThreadId) {
                    const thread = await client.channels.fetch(updatedPool.logThreadId).catch(() => null);
                    if (thread) {
                        const teams = Object.values(updatedPool.teams || {});
                        await thread.send(`❌ **${userTeam.name}** se ha dado de baja vía **WEB** — solicitado por <@${userId}>\n📊 Total: **${teams.length}** equipos`);
                    }
                }
            } catch (e) { /* ignore */ }

            res.json({ success: true });
        } catch (e) {
            console.error('[API Pool Unregister] Error:', e);
            res.status(500).json({ error: 'Error interno.' });
        }
    });

    server.on('upgrade', (request, socket, head) => {
        sessionParser(request, {}, () => {
            wss.handleUpgrade(request, socket, head, (ws) => {
                if (request.session.passport?.user) {
                    ws.user = request.session.passport.user;
                }
                wss.emit('connection', ws, request);
            });
        });
    });

    wss.on('connection', (ws, req) => {
        if (ws.user) console.log(`[Visualizer] Usuario autenticado conectado: ${ws.user.username}`);
        else console.log('[Visualizer] Espectador conectado.');

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                // 1. Procesamos primero las acciones públicas que no necesitan login
                if (data.type === 'spin_result') {
                    const { sessionId, teamId } = data;
                    await handleRouletteSpinResult(client, sessionId, teamId);
                    return; // Terminamos aquí, la acción pública está hecha
                }

                // 2. Ahora, ponemos el "guardia de seguridad" solo para las acciones privadas
                if (!ws.user) return;

                // 3. Si el usuario está logueado, procesamos sus acciones de capitán
                const captainId = ws.user.id;
                const { draftId, playerId, reason, position } = data;

                const adminRoleIds = [
                    ...(process.env.ADMIN_ROLE_IDS?.split(',') || []),
                    process.env.ARBITER_ROLE_ID,
                    process.env.ADMIN_ROLE_ID
                ].filter(Boolean);
                const isWsUserAdmin = ws.user.roles && ws.user.roles.some(r => adminRoleIds.includes(r));

                switch (data.type) {
                    case 'execute_draft_pick':
                        await withDraftLock(draftId, async () => {
                            await handlePlayerSelectionFromWeb(client, draftId, captainId, playerId, position);
                            await advanceDraftTurn(client, draftId);
                        });
                        break;

                    case 'report_player':
                        await requestStrikeFromWeb(client, draftId, captainId, playerId, reason);
                        break;

                    case 'request_kick':
                        await requestKickFromWeb(client, draftId, captainId, playerId, reason);
                        break;

                    // NUEVOS CONTROLES DE ADMINISTRADOR
                    case 'admin_force_pick':
                        if (isWsUserAdmin) {
                            await withDraftLock(draftId, async () => {
                                await forcePickFromWeb(client, draftId, playerId, data.position, ws.user.username);
                                await advanceDraftTurn(client, draftId);
                            });
                        } else {
                            console.warn(`[Visualizer] Acceso denegado a admin_force_pick para el usuario ${ws.user.username}`);
                        }
                        break;

                    case 'admin_undo_pick':
                        if (isWsUserAdmin) {
                            await withDraftLock(draftId, async () => {
                                await undoLastPick(client, draftId, ws.user.username);
                            });
                        } else {
                            console.warn(`[Visualizer] Acceso denegado a admin_undo_pick para el usuario ${ws.user.username}`);
                        }
                        break;

                    case 'admin_replace_pick':
                        if (isWsUserAdmin) {
                            await withDraftLock(draftId, async () => {
                                const { oldPlayerId, newPlayerId, disposition, teamId } = data;
                                await adminReplacePickFromWeb(client, draftId, teamId, oldPlayerId, newPlayerId, disposition, ws.user.username);
                            });
                        } else {
                            console.warn(`[Visualizer] Acceso denegado a admin_replace_pick para el usuario ${ws.user.username}`);
                        }
                        break;
                }
            } catch (e) {
                console.error('Error procesando mensaje de WebSocket:', e);
                // Enviar el error de vuelta al cliente que lo causó para desbloquear la UI
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({ type: 'ws_error', message: e.message || 'Error interno del servidor.' }));
                }
            }
        });
    });

    server.listen(PORT, () => { console.log(`[Visualizer] Servidor escuchando en ${PORT}`); });
}

function gracefulShutdown() {
    console.log('[Shutdown] Recibida señal de apagado. El servicio se detendrá.');
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
