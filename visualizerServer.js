// --- INICIO DEL ARCHIVO visualizerServer.js (VERSIÓN FINAL Y COMPLETA) ---

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
// IMPORTAMOS LAS NUEVAS FUNCIONES DE GESTIÓN
import { advanceDraftTurn, handlePlayerSelectionFromWeb, requestStrikeFromWeb, requestKickFromWeb, handleRouletteSpinResult, undoLastPick, forcePickFromWeb, adminKickPlayerFromWeb, adminAddPlayerFromWeb, sendRegistrationRequest, sendPaymentApprovalRequest, adminReplacePickFromWeb, approveExternalDraftCaptain } from './src/logic/tournamentLogic.js';
import { getDb } from './database.js';
import { fetchVpgSpainLeagues } from './src/utils/vpgCrawler.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ObjectId } from 'mongodb'; // FIX: Global import for ObjectId
import { processMatchResult, finalizeMatchThread, findMatch } from './src/logic/matchLogic.js';
import { getLeagueByElo, LEAGUE_EMOJIS } from './src/logic/eloLogic.js';
import { createPoolEmbed } from './src/utils/embeds.js';
import { scheduleRegistrationListUpdate } from './src/utils/registrationListManager.js';
import { rebuildStatus, syncFantasyWithVpg, generateRandomSquadForTeam, generateMarketFreeAgentsPool } from './src/utils/fantasyVpgSync.js';
import { getMadridTime } from './src/utils/timeHelper.js';

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

function getLeagueDivisionMultiplier(slug) {
    if (!slug) return 1.0;
    const s = slug.toLowerCase().trim();
    if (s === 'superliga-spain-a' || s === 'superliga-spain-b') {
        return 1.0; // 1ª División
    }
    if (s.includes('segunda')) {
        return 0.75; // 2ª División (-25%)
    }
    if (s.includes('tercera')) {
        return 0.55; // 3ª División (-45%)
    }
    if (s.includes('cuarta')) {
        return 0.40; // 4ª División (-60%)
    }
    if (s.includes('quinta')) {
        return 0.30; // 5ª División (-70%)
    }
    return 1.0; // default/fallback
}

export function calculatePlayerPointsAndPrice(p) {
    const stats = p.stats || {};
    const vpgPoints = stats.vpgPoints || 0;
    const matchesPlayed = stats.matchesPlayed || 0;
    
    let avgRating = 6.0;
    if (matchesPlayed > 0) {
        if (Array.isArray(stats.ratings) && stats.ratings.length > 0) {
            const sum = stats.ratings.reduce((acc, r) => acc + (parseFloat(r) || 0), 0);
            avgRating = sum / matchesPlayed;
        } else {
            avgRating = 6.0;
        }
    }

    // 1. Calcular precio (usar manualPrice si está definido, si no, dinámico)
    let price;
    const posUpper = (p.manualPosition || p.lastPosition || '').toUpperCase();
    const isGk = posUpper === 'POR' || posUpper === 'GK';

    if (p.manualPrice !== undefined && p.manualPrice !== null) {
        price = p.manualPrice;
    } else {
        price = 1000000;
        price += (stats.goals || 0) * 250000;
        price += (stats.assists || 0) * 200000;
        const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR', 'GK'].includes(posUpper);
        if (isDefOrGk) price += (stats.cleanSheets || 0) * 150000;
        
        // Ajustes por victorias/derrotas de equipo en el valor
        price += (stats.wins || 0) * 50000;
        price -= (stats.losses || 0) * 25000;

        if (avgRating > 6.0) price *= (1 + (avgRating - 6.0) * 0.5);

        // Doblar precio si es portero (x2)
        if (isGk) {
            price *= 2;
        }

        // Multiplicador de escala de presupuesto (factor x5.33333333)
        price *= 5.33333333;

        // Aplicar multiplicador por división/liga
        const divMult = getLeagueDivisionMultiplier(p.vpgLeagueSlug);
        price *= divMult;
    }

    // Límites y Redondeo
    const divMult = getLeagueDivisionMultiplier(p.vpgLeagueSlug);
    const minPrice = 2600000 * divMult;
    price = Math.min(80000000, Math.max(minPrice, price));
    price = Math.round(price / 50000) * 50000;


    // 2. Usar los puntos oficiales de VPG directamente
    let points = vpgPoints;

    return { price, points, avgRating };
}

export async function getActiveFantasyTeams(db, customLeagues = null) {
    let activeLeagues;
    if (Array.isArray(customLeagues) && customLeagues.length > 0) {
        activeLeagues = customLeagues;
    } else {
        let defaultLeagues = ["superliga-spain-a", "superliga-spain-b"];
        try {
            const allLeagues = await fetchVpgSpainLeagues();
            if (Array.isArray(allLeagues) && allLeagues.length > 0) {
                defaultLeagues = allLeagues.map(l => l.slug);
            }
        } catch (err) {
            console.error('[getActiveFantasyTeams] Error fetching all leagues for default list:', err);
        }
        activeLeagues = defaultLeagues;
        try {
            const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
            if (config && Array.isArray(config.slugs)) {
                activeLeagues = config.slugs;
            }
        } catch (e) {
            console.error('[getActiveFantasyTeams] Error reading fantasy_config:', e);
        }
    }

    const testDb = getDb('test');
    const dbTeams = await testDb.collection('teams').find({ vpgLeagueSlug: { $in: activeLeagues } }).toArray();
    
    const HARDCODED_A = [
        "GMK Villarreal CF eSports", "AD Ceuta eSports", "Suzaku esports", "Zenturions", 
        "Alpha Wolfs", "Tempus eSports", "90min FC", "LTK eSports", "Jam eSports", 
        "Cryzen Gaming", "Ventucorp eSports", "Banano eSports", "JS ELCANO", "CE Europa eSports"
    ];

    const HARDCODED_B = [
        "Oxygen Levante", "DriFt Esports", "Ceuta Guardians", "Cadiz Esports", 
        "Espartanos CF", "Transformers CF", "GUINEA PINK", "Shiva esports", 
        "RYUX CLAN", "FC Mayango", "Black Hawks", "Columbus Pacers", 
        "Bachateros FC", "FCP eSports"
    ];

    const teamNames = new Set();
    
    for (const t of dbTeams) {
        if (t.name) {
            teamNames.add(t.name.trim());
        }
    }

    if (activeLeagues.includes("superliga-spain-a")) {
        HARDCODED_A.forEach(name => teamNames.add(name));
    }
    if (activeLeagues.includes("superliga-spain-b")) {
        HARDCODED_B.forEach(name => teamNames.add(name));
    }

    const teamNamesArr = Array.from(teamNames);
    const regexes = teamNamesArr.map(name => new RegExp('^' + name.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i'));

    return {
        activeLeagues,
        teamNames: teamNamesArr,
        regexes
    };
}

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

// Registration form page (shareable via WhatsApp with dynamic promo image)
app.get('/inscripcion/:tournamentId', async (req, res) => {
    try {
        let html = fs.readFileSync(path.join('public', 'inscripcion.html'), 'utf8');
        const db = getDb(); // from tournamentBotDb
        const tournament = await db.collection('tournaments').findOne({ shortId: req.params.tournamentId });
        
        if (tournament && tournament.config && tournament.config.promoImage) {
            // Replace the generic og:image with the tournament's promo image
            html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${tournament.config.promoImage}">`);
        }
        res.send(html);
    } catch (e) {
        console.error('Error serving /inscripcion with promo image:', e);
        res.sendFile('inscripcion.html', { root: 'public' });
    }
});

// Pool registration page (shareable via WhatsApp with dynamic promo image)
app.get('/bolsa/:poolId', async (req, res) => {
    try {
        let html = fs.readFileSync(path.join('public', 'bolsa.html'), 'utf8');
        const db = getDb();
        const pool = await db.collection('pools').findOne({ shortId: req.params.poolId });
        
        if (pool && pool.imageUrl) {
            // Replace the generic og:image with the pool's custom image
            html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${pool.imageUrl}">`);
        }
        res.send(html);
    } catch (e) {
        console.error('Error serving /bolsa with promo image:', e);
        res.sendFile('bolsa.html', { root: 'public' });
    }
});

// Shared news page with dynamic Open Graph tags
app.get('/home.html', async (req, res) => {
    if (!req.query.news) {
        return res.sendFile('home.html', { root: 'public' });
    }
    try {
        let html = fs.readFileSync(path.join('public', 'home.html'), 'utf8');
        const newsId = req.query.news;
        // Validate ObjectId format (must be exactly 24 hex chars)
        if (!/^[0-9a-fA-F]{24}$/.test(newsId)) {
            return res.send(html);
        }
        const db = getDb();
        const news = await db.collection('news').findOne({ _id: new ObjectId(newsId) });
        if (news) {
            const title = `${news.title} — THE BLITZ`;
            const desc = news.body.substring(0, 160);
            const newsUrl = `${process.env.SITE_URL || 'https://t-blitz.com'}/home.html?news=${req.query.news}`;
            const safeTitle = title.replace(/"/g, '&quot;');
            const safeDesc = desc.replace(/"/g, '&quot;');

            // Determine the best image for og:image
            // og:image MUST be an actual image (JPG/PNG), NOT a video URL
            let ogImage = 'https://t-blitz.com/og-image.png'; // safe default
            let ogVideo = null;
            const mediaUrl = news.mediaUrl || '';
            const isVideo = mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i);

            if (news.coverUrl) {
                // Best case: dedicated cover image
                ogImage = news.coverUrl;
            } else if (isVideo && mediaUrl.includes('res.cloudinary.com')) {
                // Cloudinary video: auto-generate thumbnail with explicit transformation
                // Insert so_0 (first frame) transform and change extension to .jpg
                ogImage = mediaUrl
                    .replace('/upload/', '/upload/so_0,w_1200,h_630,c_fill,f_jpg,q_auto/')
                    .replace(/\.(mp4|webm|mov)(\?|$)/i, '.jpg$2');
            } else if (!isVideo && mediaUrl) {
                // Regular image
                ogImage = mediaUrl;
            }

            if (isVideo && mediaUrl) {
                ogVideo = mediaUrl;
            }

            // REPLACE existing generic OG tags with news-specific ones
            // (Discord/WhatsApp read the FIRST og:* tags they find, so we must replace, not append)
            html = html.replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${ogVideo ? 'video.other' : 'article'}">`);
            html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${newsUrl}">`);
            html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${safeTitle}">`);
            html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${safeDesc}">`);
            html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${ogImage}">`);
            html = html.replace(/<meta property="og:site_name" content="[^"]*">/, `<meta property="og:site_name" content="THE BLITZ">`);

            // Replace Twitter Card tags too
            html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${safeTitle}">`);
            html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${safeDesc}">`);
            html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${ogImage}">`);

            // Add og:video tags if the news has video content (inject before </head>)
            if (ogVideo) {
                const videoTags = `
    <meta property="og:video" content="${ogVideo}">
    <meta property="og:video:type" content="video/mp4">
    <meta name="twitter:card" content="summary_large_image">`;
                html = html.replace('</head>', videoTags + '\n</head>');
            }
        }
        res.send(html);
    } catch (e) {
        console.error('Error serving news OG:', e);
        res.sendFile('home.html', { root: 'public' });
    }
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
        const isAdmin = req.user.id === process.env.OWNER_DISCORD_ID;
        const isReferee = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
        const userWithAdmin = { ...req.user, isAdmin, isReferee };
        res.json(userWithAdmin);
    } else {
        res.json(null);
    }
});

function saveUserSession(req) {
    if (req.session && req.session.passport) {
        req.session.passport.user = req.user;
        req.session.passport = { ...req.session.passport, user: req.user };
        req.session.save(err => {
            if (err) console.error('[Session] Error saving session:', err);
        });
    }
}

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

// ===============================================
// === SETTINGS API (Video URLs) ===
// ===============================================
app.get('/api/settings/videos', async (req, res) => {
    try {
        const db = getDb();
        const settings = await db.collection('settings').find({ key: { $in: ['video_home', 'video_dash'] } }).toArray();
        const result = {};
        for (const s of settings) {
            result[s.key] = s.value;
        }
        res.json(result);
    } catch (e) {
        console.error('Error getting video settings:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.put('/api/admin/settings/videos', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const { video_home, video_dash } = req.body;
        const db = getDb();
        if (video_home) {
            await db.collection('settings').updateOne(
                { key: 'video_home' },
                { $set: { key: 'video_home', value: video_home, updatedAt: new Date() } },
                { upsert: true }
            );
        }
        if (video_dash) {
            await db.collection('settings').updateOne(
                { key: 'video_dash' },
                { $set: { key: 'video_dash', value: video_dash, updatedAt: new Date() } },
                { upsert: true }
            );
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Error updating video settings:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ===============================================
// === NEWS API (CRUD) ===
// ===============================================
// Public: get published news (non-archived)
app.get('/api/news', async (req, res) => {
    try {
        const db = getDb();
        const news = await db.collection('news')
            .find({ published: true, archived: { $ne: true } })
            .sort({ priority: 1, createdAt: -1 }) // priority: 1=featured first
            .limit(20)
            .toArray();
        
        // Sort by priority order: featured > important > regular
        const priorityOrder = { featured: 0, important: 1, regular: 2 };
        news.sort((a, b) => {
            const pa = priorityOrder[a.priority] ?? 2;
            const pb = priorityOrder[b.priority] ?? 2;
            if (pa !== pb) return pa - pb;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        res.json(news);
    } catch (e) {
        console.error('Error getting news:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Admin: get ALL news (including archived/unpublished)
app.get('/api/admin/news', async (req, res) => {
    const isOwner = req.user && req.user.id === process.env.OWNER_DISCORD_ID;
    const isRef = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
    if (!isOwner && !isRef) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const db = getDb();
        const news = await db.collection('news').find({}).sort({ createdAt: -1 }).toArray();
        res.json(news);
    } catch (e) {
        console.error('Error getting admin news:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Admin: create news
app.post('/api/admin/news', async (req, res) => {
    const isOwner = req.user && req.user.id === process.env.OWNER_DISCORD_ID;
    const isRef = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
    if (!isOwner && !isRef) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const { title, body, mediaUrl, coverUrl, priority } = req.body;
        if (!title || !body) return res.status(400).json({ error: 'Título y cuerpo requeridos' });

        const db = getDb();
        
        // Auto-detect media type
        let mediaType = null;
        if (mediaUrl) {
            if (/\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)) mediaType = 'video';
            else if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(mediaUrl)) mediaType = 'audio';
            else if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(mediaUrl)) mediaType = 'image';
            else mediaType = 'image';
        }

        // If new featured, demote existing featured to important
        if (priority === 'featured') {
            await db.collection('news').updateMany(
                { priority: 'featured', archived: { $ne: true } },
                { $set: { priority: 'important' } }
            );
        }

        const newsDoc = {
            title: sanitizeInput(title, 200),
            body: body.substring(0, 5000),
            mediaUrl: mediaUrl || null,
            coverUrl: coverUrl || null,
            mediaType,
            priority: ['featured', 'important', 'regular'].includes(priority) ? priority : 'regular',
            published: true,
            archived: false,
            author: 'THE BLITZ',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('news').insertOne(newsDoc);
        newsDoc._id = result.insertedId;

        // Auto-archive old news (keep max 15 non-archived)
        const allActive = await db.collection('news')
            .find({ archived: { $ne: true } })
            .sort({ createdAt: -1 })
            .skip(15)
            .toArray();
        if (allActive.length > 0) {
            const idsToArchive = allActive.map(n => n._id);
            await db.collection('news').updateMany(
                { _id: { $in: idsToArchive } },
                { $set: { archived: true } }
            );
        }

        res.json({ success: true, news: newsDoc });
    } catch (e) {
        console.error('Error creating news:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Admin: update news
app.put('/api/admin/news/:id', async (req, res) => {
    const isOwner = req.user && req.user.id === process.env.OWNER_DISCORD_ID;
    const isRef = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
    if (!isOwner && !isRef) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const { title, body, mediaUrl, coverUrl, priority, published, archived } = req.body;
        const db = getDb();

        let mediaType = null;
        if (mediaUrl) {
            if (/\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)) mediaType = 'video';
            else if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(mediaUrl)) mediaType = 'audio';
            else mediaType = 'image';
        }

        // If promoting to featured, demote existing
        if (priority === 'featured') {
            await db.collection('news').updateMany(
                { priority: 'featured', archived: { $ne: true }, _id: { $ne: new ObjectId(req.params.id) } },
                { $set: { priority: 'important' } }
            );
        }

        const updateFields = { updatedAt: new Date() };
        if (title !== undefined) updateFields.title = sanitizeInput(title, 200);
        if (body !== undefined) updateFields.body = body.substring(0, 5000);
        if (mediaUrl !== undefined) { updateFields.mediaUrl = mediaUrl || null; updateFields.mediaType = mediaType; }
        if (coverUrl !== undefined) updateFields.coverUrl = coverUrl || null;
        if (priority !== undefined) updateFields.priority = priority;
        if (published !== undefined) updateFields.published = published;
        if (archived !== undefined) updateFields.archived = archived;

        await db.collection('news').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateFields }
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Error updating news:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Admin: delete news permanently
app.delete('/api/admin/news/:id', async (req, res) => {
    const isOwner = req.user && req.user.id === process.env.OWNER_DISCORD_ID;
    const isRef = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
    if (!isOwner && !isRef) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const db = getDb();
        await db.collection('news').deleteOne({ _id: new ObjectId(req.params.id) });
        // Also delete comments
        await db.collection('news_comments').deleteMany({ newsId: req.params.id });
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting news:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ===== COMMENTS API =====
// Public: get comments for a news article
app.get('/api/news/:id/comments', async (req, res) => {
    try {
        const db = getDb();
        const comments = await db.collection('news_comments')
            .find({ newsId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        res.json(comments);
    } catch (e) {
        console.error('Error getting comments:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Authenticated: post a comment (must be logged in via Discord)
app.post('/api/news/:id/comments', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
    try {
        const { text } = req.body;
        if (!text || text.trim().length === 0) return res.status(400).json({ error: 'Comentario vacío' });

        const db = getDb();
        const comment = {
            newsId: req.params.id,
            userId: req.user.id,
            username: req.user.global_name || req.user.username,
            avatar: req.user.avatar
                ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png?size=64`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(req.user.id) % 5}.png`,
            text: text.trim().substring(0, 500),
            createdAt: new Date()
        };
        await db.collection('news_comments').insertOne(comment);
        res.json({ success: true, comment });
    } catch (e) {
        console.error('Error posting comment:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Admin: delete a comment
app.delete('/api/admin/comments/:id', async (req, res) => {
    if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const db = getDb();
        await db.collection('news_comments').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting comment:', e);
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

        let modified = false;
        // 1. Verificar estado de verificación en DB si no está en sesión
        if (req.user.isVerified === undefined) {
            const userDoc = await db.collection('verified_users').findOne({ discordId: userId });
            req.user.isVerified = !!userDoc;
            if (userDoc) {
                req.user.psnId = userDoc.psnId;
                req.user.platform = userDoc.platform;
            }
            modified = true;
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
                modified = true;
            } catch (e) { console.error('Error fetching member fallback:', e); }
        }

        if (modified) {
            saveUserSession(req);
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

        // Asignar rol en Discord
        if (client) {
            try {
                const guildId = process.env.GUILD_ID;
                if (guildId) {
                    const guild = await client.guilds.fetch(guildId).catch(() => null);
                    if (guild) {
                        const member = await guild.members.fetch(req.user.id).catch(() => null);
                        if (member) {
                            const { VERIFIED_ROLE_ID } = await import('./config.js');
                            const roleIdToAssign = process.env.VERIFIED_ROLE_ID || VERIFIED_ROLE_ID;
                            if (roleIdToAssign) {
                                const role = await guild.roles.fetch(roleIdToAssign).catch(() => null);
                                if (role) {
                                    await member.roles.add(role).catch(err => {
                                        console.error(`[Verify] Error al dar rol a ${req.user.username}:`, err.message);
                                    });
                                    console.log(`[Verify] Rol verificado (${role.name}) asignado a ${member.user.tag}`);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[Verify] Error al asignar rol en Discord:', err);
            }
        }

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

// Endpoint: Buscar Clubes en EA Sports (Proxy)
app.get('/api/ea/search', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const query = req.query.clubName;
    const rawPlatform = req.query.platform || 'common-gen5';
    if (!query) return res.status(400).json({ error: 'Falta el nombre del club' });

    // Normalize platform input from web form
    let platform = rawPlatform;
    if (rawPlatform === 'nueva') platform = 'common-gen5';
    else if (rawPlatform === 'antigua') platform = 'common-gen4';

    try {
        const eaRes = await fetch(`https://proclubs.ea.com/api/fc/allTimeLeaderboard/search?clubName=${encodeURIComponent(query)}&platform=${platform}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Origin': 'https://www.ea.com',
                'Referer': 'https://www.ea.com/'
            }
        });
        
        if (eaRes.status === 404) return res.json({ clubs: [] });
        if (!eaRes.ok) throw new Error(`EA API responded with status: ${eaRes.status}`);
        const data = await eaRes.json();

        // Normalize to { clubs: [...] } format
        const rawClubs = Array.isArray(data) ? data : Object.values(data || {});
        const clubs = rawClubs.slice(0, 25).map(c => ({
            clubId: c.clubId,
            clubName: c.clubName || (c.clubInfo && c.clubInfo.name) || c.name || 'Desconocido',
            platform: platform
        }));

        res.json({ clubs });
    } catch (e) {
        console.error('[EA Search Proxy] Error:', e.message);
        res.status(500).json({ error: 'Error al contactar con EA Sports' });
    }
});

// Endpoint: Solicitar creación de equipo (con aprobación admin)
app.post('/api/teams/request', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const { teamName: rawTeamName, teamAbbr: rawTeamAbbr, teamTwitter, logoUrl, league, eaClubId, eaPlatform } = req.body;
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
            eaClubId: eaClubId || null,
            eaPlatform: eaPlatform || 'common-gen5',
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
        let isMemberModified = false;

        // Si no está en sesión o está marcado como false, verificar con Discord API
        if (isMember !== true) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
                req.user.isMember = isMember;
                isMemberModified = true;
            } catch (e) {
                console.error('Error verificando membresía:', e);
                isMember = false;
            }
        }

        if (isMemberModified) {
            saveUserSession(req);
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
        let isMemberModified = false;
        if (isMember !== true) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
                req.user.isMember = isMember;
                isMemberModified = true;
            } catch (e) {
                console.error('Error verificando membresía en pre-check:', e);
                isMember = false;
            }
        }

        if (isMemberModified) {
            saveUserSession(req);
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
            eafcTeamName, eaClubId, eaPlatform, streamPlatform, streamUsername, whatsapp } = req.body;

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
        let isMemberModified = false;
        if (isMember !== true) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
                req.user.isMember = isMember;
                isMemberModified = true;
            } catch (e) {
                console.error('Error verificando membresía:', e);
                isMember = false;
            }
        }
        if (isMemberModified) {
            saveUserSession(req);
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
                eaClubId: eaClubId || null, eaPlatform: eaPlatform || 'common-gen5',
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

            const { getBotSettings } = await import('./database.js');
            const settings = await getBotSettings();
            if (settings.eaScannerEnabled && !team.eaClubId) {
                return res.status(403).json({ error: 'El sistema de estadísticas de EA Sports está activado. Debes vincular tu Club de EA desde la pestaña "Mi Equipo" y esperar aprobación antes de inscribirte.' });
            }

            finalTeamData = team;
        }
        // Caso 2: Equipo Temporal (Solo Paid)
        else if (teamData && tournament.inscripcion === 'Pago') {
            if (!teamData.name && !teamData.teamName) {
                return res.status(400).json({ error: 'Faltan datos del equipo (nombre)' });
            }
            finalTeamData = {
                _id: new ObjectId(),
                name: teamData.name || teamData.teamName || req.user.username, // Fallback if no name provided
                abbreviation: (teamData.abbreviation || 'TMP').toUpperCase(),
                logoUrl: teamData.logoUrl || 'https://i.imgur.com/2M7540p.png',
                region: teamData.region || 'EU',
                managerId: req.user.id,
                eaClubId: teamData.eaClubId || null,
                eafcTeamName: teamData.eafcTeamName || null,
                eaPlatform: teamData.eaPlatform || 'common-gen5',
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

// === PUBLIC APIs for Home Page ===
app.get('/api/platform-stats', async (req, res) => {
    try {
        const testDb = getDb('test');
        const tournamentDb = getDb();
        const [teamCount, tournamentCount] = await Promise.all([
            testDb.collection('teams').countDocuments(),
            tournamentDb.collection('tournaments').countDocuments({ status: 'finalizado' })
        ]);
        res.json({ teams: teamCount, tournaments: tournamentCount, players: teamCount * 5 });
    } catch (e) {
        console.error('Error loading platform stats:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/upcoming-events', async (req, res) => {
    try {
        const db = getDb();
        const pools = await db.collection('team_pools')
            .find({ status: 'open' })
            .project({ name: 1, shortId: 1, imageUrl: 1, createdAt: 1, minElo: 1, maxElo: 1, date: 1, teams: 1 })
            .sort({ createdAt: -1 }).limit(6).toArray();
            
        const formattedPools = pools.map(p => ({
            name: p.name,
            shortId: p.shortId,
            type: 'Bolsa de Equipos',
            status: 'inscripciones_abiertas',
            imageUrl: p.imageUrl,
            minElo: p.minElo || null,
            maxElo: p.maxElo || null,
            date: p.date || null,
            teamCount: Object.keys(p.teams || {}).length,
            createdAt: p.createdAt,
            isPool: true
        }));
            
        res.json(formattedPools);
    } catch (e) {
        console.error('Error loading upcoming events:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// === Active Events for Dashboard ===
app.get('/api/events/active', async (req, res) => {
    try {
        const db = getDb();
        const activeStatuses = ['activo', 'en_curso', 'inscripciones_abiertas', 'draft_activo', 'jugando'];

        const tournaments = await db.collection('tournaments')
            .find({ status: { $in: activeStatuses } })
            .project({ name: 1, shortId: 1, type: 1, status: 1, config: 1, createdAt: 1 })
            .sort({ createdAt: -1 }).toArray();

        const drafts = await db.collection('drafts')
            .find({ status: { $in: ['active', 'picking', 'inscripciones_abiertas'] } })
            .project({ name: 1, shortId: 1, status: 1, createdAt: 1, currentPickIndex: 1, teams: 1 })
            .sort({ createdAt: -1 }).toArray();

        const formattedTournaments = tournaments.map(t => ({
            id: t.shortId || t._id.toString(),
            name: t.name,
            type: 'tournament',
            status: t.status,
            teamsCount: t.config?.maxTeams || 0,
            createdAt: t.createdAt
        }));

        const formattedDrafts = drafts.map(d => ({
            id: 'draft-' + (d.shortId || d._id.toString()),
            name: d.name,
            type: 'draft',
            status: d.status === 'picking' ? 'active' : d.status,
            teamsCount: (d.teams || []).length,
            currentPick: d.currentPickIndex || 0,
            totalPicks: 0,
            createdAt: d.createdAt
        }));

        res.json({ tournaments: formattedTournaments, drafts: formattedDrafts });
    } catch (e) {
        console.error('Error loading active events:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// === Team Profile API ===
app.get('/api/teams/:id/profile', async (req, res) => {
    try {
        const testDb = getDb('test');
        const tournamentDb = getDb();
        const teamId = req.params.id;
        let queryId;
        try { queryId = new ObjectId(teamId); } catch(e) { queryId = teamId; }

        const team = await testDb.collection('teams').findOne(
            { $or: [{ _id: queryId }, { managerId: teamId }] },
            { projection: { name: 1, abbreviation: 1, logoUrl: 1, elo: 1, league: 1, managerId: 1, captains: 1, players: 1, historicalStats: 1, eloHistory: 1, eaClubInfo: 1 } }
        );
        if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

        // Fetch member names
        const memberIds = [team.managerId, ...(team.captains || []), ...(team.players || [])].filter(Boolean);
        const members = [];
        for (const mId of memberIds) {
            let userName = mId;
            const v = await tournamentDb.collection('verified_users').findOne({ discordId: mId });
            if (v && (v.discordTag || v.gameId)) {
                userName = v.discordTag || v.gameId;
            } else if (client) {
                try {
                    const discordUser = await client.users.fetch(mId);
                    userName = discordUser.username || mId;
                } catch(e) { }
            }
            members.push({
                id: mId,
                name: userName,
                role: mId === team.managerId ? 'Manager' : (team.captains || []).includes(mId) ? 'Capitán' : 'Jugador'
            });
        }

        res.json({ team, members });
    } catch (e) {
        console.error('Error loading team profile:', e);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// === 404 Catch-all moved inside startVisualizerServer ===

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

        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(req.user.id);
            const { ARBITRO_ROLE_ID } = await import('./config.js');
            const adminRoleId = process.env.ADMIN_ROLE_ID;

            if (
                member.permissions.has('Administrator') ||
                (adminRoleId && member.roles.cache.has(adminRoleId)) ||
                (ARBITRO_ROLE_ID && member.roles.cache.has(ARBITRO_ROLE_ID))
            ) {
                next();
            } else {
                res.status(403).send({ error: 'No tienes permisos de administrador o árbitro.' });
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

            // Check EA Scanner
            if (!blocked) {
                try {
                    const { getBotSettings } = await import('./database.js');
                    const settings = await getBotSettings();
                    if (settings.eaScannerEnabled && !userTeam.eaClubId) {
                        blocked = true;
                        blockReason = 'Debes vincular tu Club de EA Sports antes de inscribirte. Hazlo desde Discord con el botón "Vincular Club EA" en el panel de tu equipo.';
                    }
                } catch (e) {
                    console.error('[my-status] Error checking EA settings:', e);
                }
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



    // POST: Link EA club to user's team (auth required, needs approval)
    app.post('/api/ea/link', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
            const { clubId, clubName, platform } = req.body;
            if (!clubId || !platform) return res.status(400).json({ error: 'Datos incompletos.' });

            const testDb = getDb('test');
            const userTeam = await testDb.collection('teams').findOne({
                guildId: process.env.GUILD_ID,
                $or: [{ managerId: req.user.id }, { captains: req.user.id }]
            });

            if (!userTeam) return res.status(404).json({ error: 'No se encontró tu equipo.' });

            // Check if another team is already linked to this EA Club ID
            const existingEaLink = await testDb.collection('teams').findOne({ eaClubId: clubId, _id: { $ne: userTeam._id } });
            if (existingEaLink) {
                return res.status(400).json({ error: `Este club de EA ya está vinculado al equipo VPG "${existingEaLink.name}".` });
            }

            const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
            if (!approvalChannelId) return res.status(500).json({ error: 'Canal de aprobaciones no configurado.' });

            const { client } = await import('./index.js');
            const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
            if (!approvalChannel) return res.status(500).json({ error: 'No se pudo encontrar el canal de aprobaciones.' });

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

            const embed = new EmbedBuilder()
                .setTitle('Solicitud de Vinculación con EA Sports (Bolsa/Web)')
                .setColor('Yellow')
                .addFields(
                    { name: '👤 Solicitante', value: `<@${req.user.id}>`, inline: true },
                    { name: '🏟️ Equipo', value: `${userTeam.name}`, inline: true },
                    { name: '⚽ Club EA', value: `${clubName || 'Desconocido'} (ID: ${clubId})`, inline: false },
                    { name: '🖥️ Plataforma EA', value: `${platform}`, inline: true }
                )
                .setTimestamp();

            const safeClubName = (clubName || 'Desconocido').substring(0, 30);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_global_ealink_${userTeam._id.toString()}_${clubId}_${platform}_${safeClubName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_global_ealink_${req.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
            );

            await approvalChannel.send({ embeds: [embed], components: [row] });

            res.json({ success: true, message: `Solicitud enviada a los administradores para su revisión.` });
        } catch (e) {
            console.error('[API EA Link] Error:', e);
            res.status(500).json({ error: 'Error al solicitar vinculación.' });
        }
    });

    // POST: Register team in pool (auth required)
    app.post('/api/pool/:poolId/register', async (req, res) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'No autenticado.' });

            // Verify Discord membership
            let isMember = req.user.isMember;
            let isMemberModified = false;
            if (isMember !== true) {
                try {
                    const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${req.user.id}`, {
                        headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                    });
                    isMember = response.ok;
                    req.user.isMember = isMember;
                    isMemberModified = true;
                } catch (e) { isMember = false; }
            }
            if (isMemberModified) {
                saveUserSession(req);
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

            // Validate EA
            const { getBotSettings } = await import('./database.js');
            const settings = await getBotSettings();
            if (settings.eaScannerEnabled && !userTeam.eaClubId) {
                return res.status(403).json({ error: 'El sistema de estadísticas de EA Sports está activado. Debes vincular tu Club de EA desde la pestaña "Mi Equipo" y esperar aprobación antes de inscribirte.' });
            }

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

    // ===============================================
    // === VPG SYNC & ROSTER COMPARISON ENDPOINTS ===
    // ===============================================

    const VPG_HEADERS = {
        'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
        'Accept': 'application/json',
    };

    async function fetchFromVpg(path) {
        const [basePath, queryString] = path.split('?');
        const formattedBasePath = basePath.endsWith('/') ? basePath : basePath + '/';
        const url = `https://api.virtualprogaming.com/public/${formattedBasePath}${queryString ? '?' + queryString : ''}`;
        console.log(`[VPG Proxy] Fetching: ${url}`);
        const res = await fetch(url, { headers: VPG_HEADERS, redirect: 'follow' });
        if (!res.ok) {
            throw new Error(`VPG API error: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    }

    // Cache for user details to avoid rate limiting and speed up response times
    const userCache = new Map();
    const USER_CACHE_TTL = 1000 * 60 * 60; // 1 hour

    async function fetchUserDetail(username) {
        const cached = userCache.get(username.toLowerCase());
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }

        try {
            const data = await fetchFromVpg(`users/${username}/`);
            userCache.set(username.toLowerCase(), {
                data,
                expiry: Date.now() + USER_CACHE_TTL
            });
            return data;
        } catch (e) {
            console.error(`[VPG User Detail] Error fetching user ${username}:`, e.message);
            return null;
        }
    }

    const userContractsCache = new Map();
    const USER_CONTRACTS_CACHE_TTL = 1000 * 60 * 60; // 1 hour

    async function fetchUserContracts(username) {
        const cached = userContractsCache.get(username.toLowerCase());
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }

        try {
            const data = await fetchFromVpg(`users/${username}/contracts/`);
            const contracts = data && Array.isArray(data.value) ? data.value : [];
            userContractsCache.set(username.toLowerCase(), {
                data: contracts,
                expiry: Date.now() + USER_CONTRACTS_CACHE_TTL
            });
            return contracts;
        } catch (e) {
            console.error(`[VPG User Contracts] Error fetching contracts for ${username}:`, e.message);
            return [];
        }
    }

    function extractIdsFromBio(bio) {
        if (!bio) return [];
        const ids = [];
        const regexes = [
            /psn\s*(?:id)?\s*[:=-]\s*([a-z0-9_.-]+)/i,
            /ea\s*(?:id)?\s*[:=-]\s*([a-z0-9_.-]+)/i,
            /xbox\s*(?:id)?\s*[:=-]\s*([a-z0-9_.-]+)/i,
            /playstation\s*(?:network)?\s*(?:id)?\s*[:=-]\s*([a-z0-9_.-]+)/i,
            /origin\s*(?:id)?\s*[:=-]\s*([a-z0-9_.-]+)/i,
            /id\s*[:=-]\s*([a-z0-9_.-]+)/i
        ];
        for (const regex of regexes) {
            const match = bio.match(regex);
            if (match && match[1]) {
                const val = match[1].trim();
                if (val && val.length > 2) {
                    ids.push(val);
                }
            }
        }
        return ids;
    }

    app.get('/vpg.html', (req, res) => res.sendFile('vpg.html', { root: 'public' }));

    // List of leagues
    app.get('/api/vpg/leagues', async (req, res) => {
        try {
            const { fetchVpgSpainLeagues } = await import('./src/utils/vpgCrawler.js');
            const leagues = await fetchVpgSpainLeagues();
            res.json({ leagues });
        } catch (e) {
            console.error('[API VPG Leagues] Error:', e);
            res.status(500).json({ error: 'No se pudieron cargar las ligas de VPG.' });
        }
    });

    // League table
    app.get('/api/vpg/leagues/:leagueSlug/table', async (req, res) => {
        try {
            const { leagueSlug } = req.params;
            const data = await fetchFromVpg(`leagues/${leagueSlug}/table`);
            res.json(data);
        } catch (e) {
            console.error('[API VPG Table] Error:', e);
            res.status(500).json({ error: `Error al obtener la clasificación de la liga ${leagueSlug}` });
        }
    });

    // Cache for tables to avoid rate limiting and speed up scans
    const tableCache = new Map();
    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache

    // Search for team candidate across all divisions
    app.get('/api/vpg/search-candidate', async (req, res) => {
        try {
            const { name, abbr } = req.query;
            if (!name) return res.status(400).json({ error: 'Falta el nombre del equipo' });

            const cleanQueryName = cleanTeamName(name);
            const cleanQueryAbbr = abbr ? abbr.toLowerCase().trim() : '';

            // Fetch already linked VPG team slugs from the database to exclude them
            const testDb = getDb('test');
            const linkedTeams = await testDb.collection('teams').find({ vpgTeamSlug: { $exists: true, $ne: null, $ne: '' } }).toArray();
            const linkedSlugs = new Set(linkedTeams.map(t => (t.vpgTeamSlug || '').toLowerCase().trim()));

            const { fetchVpgSpainLeagues } = await import('./src/utils/vpgCrawler.js');
            const leagues = await fetchVpgSpainLeagues();

            const matches = [];

            // Scan all divisions in parallel using cached tables
            await Promise.all(leagues.map(async (league) => {
                try {
                    let tableData;
                    const cached = tableCache.get(league.slug);
                    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                        tableData = cached.data;
                    } else {
                        tableData = await fetchFromVpg(`leagues/${league.slug}/table`);
                        tableCache.set(league.slug, { data: tableData, timestamp: Date.now() });
                    }

                    const teams = Array.isArray(tableData) ? tableData : (tableData.data || tableData.results || []);
                    if (Array.isArray(teams)) {
                        teams.forEach((t, index) => {
                            const teamName = t.team_name || t.name;
                            const teamSlug = t.team_slug || t.slug;
                            const position = index + 1;
                            const logoId = t.logo_id || t.logo || t.team_logo;
                            
                            if (!teamName || !teamSlug) return;
                            if (linkedSlugs.has((teamSlug || '').toLowerCase().trim())) return;

                            const cleanVpgName = cleanTeamName(teamName);
                            let score = 0;

                            if (cleanVpgName === cleanQueryName) {
                                score = 100;
                            } else if (cleanVpgName.includes(cleanQueryName) || cleanQueryName.includes(cleanVpgName)) {
                                score = 80;
                            } else if (cleanQueryAbbr && (cleanVpgName.includes(cleanQueryAbbr) || teamName.toLowerCase().includes(cleanQueryAbbr))) {
                                score = 50;
                            }

                            if (score >= 50) {
                                matches.push({
                                    name: teamName,
                                    slug: teamSlug,
                                    position,
                                    logoId,
                                    leagueName: league.title,
                                    leagueSlug: league.slug,
                                    score
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.error(`[Search Candidate] Error scanning league ${league.slug}:`, e.message);
                }
            }));

            // Sort matches by highest score first
            matches.sort((a, b) => b.score - a.score);

            res.json({ matches });
        } catch (e) {
            console.error('[API Search Candidate] Error:', e);
            res.status(500).json({ error: 'Error al buscar candidatos.' });
        }
    });

    // Helper to clean team names
    function cleanTeamName(name) {
        if (!name || typeof name !== 'string') return '';
        return name.toLowerCase()
            .replace(/\besports\b/gi, '')
            .replace(/\besport\b/gi, '')
            .replace(/\bfc\b/gi, '')
            .replace(/\bclub\b/gi, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
    }

    // Team detail
    app.get('/api/vpg/teams/:teamSlug', async (req, res) => {
        try {
            const { teamSlug } = req.params;
            const data = await fetchFromVpg(`teams/${teamSlug}`);
            // Normalize logo
            const logoId = data.logo_id || data.logo;
            const logoUrl = logoId ? `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${logoId}/public` : null;
            res.json({ ...data, logoUrl });
        } catch (e) {
            console.error('[API VPG Team Details] Error:', e);
            res.status(500).json({ error: `Error al obtener detalles del equipo ${teamSlug}` });
        }
    });

    // Team active contracts (roster) - Filtered to Spanish national league community (483) or other community if not playing elsewhere
    app.get('/api/vpg/teams/:teamSlug/roster', async (req, res) => {
        try {
            const { teamSlug } = req.params;
            const data = await fetchFromVpg(`teams/${teamSlug}/contracts`);
            const rawContracts = Array.isArray(data) ? data : (data.data || data.results || []);
            const communityId = 483;

            const filteredContracts = [];
            await Promise.all(
                rawContracts.map(async (c) => {
                    if (c.community_id === communityId) {
                        filteredContracts.push(c);
                        return;
                    }
                    const userContracts = await fetchUserContracts(c.username);
                    const playsElsewhere = userContracts.some(uc => 
                        uc.status === 'active' && 
                        uc.community_id === communityId && 
                        uc.team_id !== c.team_id
                    );
                    if (!playsElsewhere) {
                        filteredContracts.push(c);
                    }
                })
            );
            res.json({ contracts: filteredContracts });
        } catch (e) {
            console.error('[API VPG Team Roster] Error:', e);
            res.status(500).json({ error: `Error al obtener la plantilla de VPG para ${teamSlug}` });
        }
    });

    // List local teams (from test.teams)
    app.get('/api/vpg/local-teams', async (req, res) => {
        try {
            const testDb = getDb('test');
            const teams = await testDb.collection('teams')
                .find({}, { projection: { name: 1, abbreviation: 1, logoUrl: 1, vpgTeamSlug: 1, vpgLeagueSlug: 1 } })
                .toArray();
            res.json({ teams });
        } catch (e) {
            console.error('[API VPG Local Teams] Error:', e);
            res.status(500).json({ error: 'Error al obtener los equipos locales.' });
        }
    });

    // Link team (includes auto-fetching and applying logo from VPG)
    app.post('/api/vpg/link', isOwner, async (req, res) => {
        try {
            const { localTeamId, vpgTeamSlug, vpgLeagueSlug } = req.body;
            if (!localTeamId) return res.status(400).json({ error: 'Falta localTeamId' });

            // Fetch team details from VPG to obtain the logoUrl automatically
            let logoUrl = null;
            if (vpgTeamSlug) {
                try {
                    const data = await fetchFromVpg(`teams/${vpgTeamSlug}`);
                    const logoId = data.logo_id || data.logo;
                    if (logoId) {
                        logoUrl = `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${logoId}/public`;
                    }
                } catch (logoErr) {
                    console.error(`[API VPG Link] No se pudo obtener el logo de VPG para el auto-mapeo:`, logoErr.message);
                }
            }

            const updateFields = { vpgTeamSlug, vpgLeagueSlug };
            if (logoUrl) {
                updateFields.logoUrl = logoUrl;
            }

            const testDb = getDb('test');
            await testDb.collection('teams').updateOne(
                { _id: new ObjectId(localTeamId) },
                { $set: updateFields }
            );
            res.json({ success: true, message: logoUrl ? 'Equipo y logo vinculados correctamente.' : 'Equipo vinculado correctamente.' });
        } catch (e) {
            console.error('[API VPG Link] Error:', e);
            res.status(500).json({ error: 'Error al vincular el equipo.' });
        }
    });

    // Unlink team
    app.post('/api/vpg/unlink', isOwner, async (req, res) => {
        try {
            const { localTeamId } = req.body;
            if (!localTeamId) return res.status(400).json({ error: 'Falta localTeamId' });

            const testDb = getDb('test');
            await testDb.collection('teams').updateOne(
                { _id: new ObjectId(localTeamId) },
                { $unset: { vpgTeamSlug: "", vpgLeagueSlug: "" } }
            );
            res.json({ success: true, message: 'Equipo desvinculado correctamente.' });
        } catch (e) {
            console.error('[API VPG Unlink] Error:', e);
            res.status(500).json({ error: 'Error al desvincular el equipo.' });
        }
    });

    // Apply VPG logo to local team
    app.post('/api/vpg/apply-logo', isOwner, async (req, res) => {
        try {
            const { localTeamId, logoUrl } = req.body;
            if (!localTeamId || !logoUrl) return res.status(400).json({ error: 'Falta localTeamId o logoUrl' });

            const testDb = getDb('test');
            await testDb.collection('teams').updateOne(
                { _id: new ObjectId(localTeamId) },
                { $set: { logoUrl } }
            );
            res.json({ success: true, message: 'Logo aplicado correctamente al equipo local.' });
        } catch (e) {
            console.error('[API VPG Apply Logo] Error:', e);
            res.status(500).json({ error: 'Error al aplicar el logo.' });
        }
    });

    // Comparison details between VPG roster and Local Roster
    app.get('/api/vpg/teams/:teamSlug/compare', async (req, res) => {
        try {
            const { teamSlug } = req.params;
            const { leagueSlug } = req.query;

            // 1. Fetch VPG contracts
            const vpgData = await fetchFromVpg(`teams/${teamSlug}/contracts`);
            let rawContracts = Array.isArray(vpgData) ? vpgData : (vpgData.data || vpgData.results || []);

            // Always restrict to Spanish National Leagues (community_id: 483)
            let communityId = 483;
            if (leagueSlug) {
                try {
                    const leagueData = await fetchFromVpg(`leagues/${leagueSlug}/`);
                    if (leagueData && leagueData.community_id) {
                        communityId = leagueData.community_id;
                    }
                } catch (err) {
                    console.error(`[API VPG Compare] Failed to fetch league ${leagueSlug} for filtering:`, err.message);
                }
            }

            // Filter contracts: keep target community (e.g. 483). For other communities (global 479, esports 701, etc.),
            // include them unless the user has an active contract in the target community with a different team.
            const filteredContracts = [];
            await Promise.all(
                rawContracts.map(async (c) => {
                    if (c.community_id === communityId) {
                        filteredContracts.push(c);
                        return;
                    }
                    // For any other community contract of our team, verify they don't play elsewhere in the target community
                    const userContracts = await fetchUserContracts(c.username);
                    const playsElsewhere = userContracts.some(uc => 
                        uc.status === 'active' && 
                        uc.community_id === communityId && 
                        uc.team_id !== c.team_id
                    );
                    if (!playsElsewhere) {
                        filteredContracts.push(c);
                    }
                })
            );
            
            // Retain original order for the matches
            let contracts = rawContracts.filter(c => filteredContracts.some(fc => fc.id === c.id));

            // 2. Fetch local team and VPG user profiles concurrently (using caching helper)
            const testDb = getDb('test');
            const localTeam = await testDb.collection('teams').findOne({ vpgTeamSlug: teamSlug });

            const vpgProfiles = await Promise.all(
                contracts.map(async (c) => {
                    const profile = await fetchUserDetail(c.username);
                    const bioIds = profile && profile.bio ? extractIdsFromBio(profile.bio) : [];
                    return {
                        username: c.username,
                        psn: profile ? profile.psn : null,
                        xbox: profile ? profile.xbox : null,
                        origin: profile ? profile.origin : null,
                        bioIds: bioIds
                    };
                })
            );

            const cleanStr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            const matchesPlayer = (c, lp, profile) => {
                const cleanUser = cleanStr(c.username);
                const cleanPsn = profile ? cleanStr(profile.psn) : '';
                const cleanXbox = profile ? cleanStr(profile.xbox) : '';
                const cleanOrigin = profile ? cleanStr(profile.origin) : '';
                const cleanBioIds = profile && profile.bioIds ? profile.bioIds.map(cleanStr) : [];

                return lp.gameIds.some(gid => {
                    const cleanGid = cleanStr(gid);
                    return cleanGid && (
                        cleanGid === cleanUser ||
                        cleanGid === cleanPsn ||
                        cleanGid === cleanXbox ||
                        cleanGid === cleanOrigin ||
                        cleanBioIds.includes(cleanGid)
                    );
                });
            };

            if (!localTeam) {
                // Not linked yet, but we can still return VPG contracts with matched=false
                const comparedContracts = contracts.map(c => {
                    const profile = vpgProfiles.find(p => p.username.toLowerCase() === c.username.toLowerCase());
                    return {
                        vpgUsername: c.username,
                        vpgUserId: c.user_id || c.id,
                        position: c.position,
                        avatarUrl: c.avatar ? `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${c.avatar}/smThumb` : null,
                        nationality: c.nationality,
                        matched: false,
                        vpgPsn: profile ? profile.psn : null,
                        vpgXbox: profile ? profile.xbox : null,
                        vpgOrigin: profile ? profile.origin : null,
                        vpgBioIds: profile ? profile.bioIds : []
                    };
                });
                return res.json({
                    isLinked: false,
                    vpgContracts: comparedContracts,
                    localPlayers: []
                });
            }

            // 3. Get local team players, captains, and manager
            const playerIds = new Set();
            if (localTeam.managerId) {
                playerIds.add(localTeam.managerId);
            }
            if (localTeam.captains && Array.isArray(localTeam.captains)) {
                localTeam.captains.forEach(id => {
                    if (id) playerIds.add(id);
                });
            }
            if (localTeam.capitanes && Array.isArray(localTeam.capitanes)) {
                localTeam.capitanes.forEach(id => {
                    if (id) playerIds.add(id);
                });
            }
            if (localTeam.players && Array.isArray(localTeam.players)) {
                localTeam.players.forEach(id => {
                    if (id) playerIds.add(id);
                });
            }
            const uniquePlayerIds = Array.from(playerIds);

            // 4. Fetch verified user documents
            const db = getDb();
            const verifiedUsers = await db.collection('verified_users').find({
                discordId: { $in: uniquePlayerIds }
            }).toArray();

            const verifiedMap = new Map(verifiedUsers.map(u => [u.discordId, u]));

            // 5. Enhance all players with Discord usernames/tags and verified console IDs
            const enhancedLocalPlayers = await Promise.all(uniquePlayerIds.map(async (discordId) => {
                const u = verifiedMap.get(discordId);
                const discUser = await client.users.fetch(discordId).catch(() => null);

                // Collect and deduplicate unique game IDs case-insensitively
                const gameIds = [];
                if (u) {
                    if (u.gameId) gameIds.push(u.gameId.trim());
                    if (u.psnId) gameIds.push(u.psnId.trim());
                    if (u.eaId) gameIds.push(u.eaId.trim());
                }

                const uniqueGameIds = [];
                const seenGameIds = new Set();
                for (const gid of gameIds) {
                    const clean = gid.toLowerCase();
                    if (!seenGameIds.has(clean)) {
                        seenGameIds.add(clean);
                        uniqueGameIds.push(gid);
                    }
                }

                return {
                    discordId: discordId,
                    discordTag: discUser ? discUser.username : (u ? u.discordTag : discordId),
                    gameIds: uniqueGameIds, // Keep array for backend matching
                    psnId: uniqueGameIds.length > 0 ? uniqueGameIds.join(' / ') : 'No verificado', // Format for UI display
                    isManager: discordId === localTeam.managerId,
                    isCaptain: (localTeam.captains && Array.isArray(localTeam.captains) && localTeam.captains.includes(discordId)) ||
                               (localTeam.capitanes && Array.isArray(localTeam.capitanes) && localTeam.capitanes.includes(discordId))
                };
            }));

            // 6. Match VPG contracts against local players using console IDs case/symbol-insensitively
            const comparedVpg = contracts.map(c => {
                const profile = vpgProfiles.find(p => p.username.toLowerCase() === c.username.toLowerCase());
                const match = enhancedLocalPlayers.find(lp => matchesPlayer(c, lp, profile));

                return {
                    vpgUsername: c.username,
                    vpgUserId: c.user_id || c.id,
                    position: c.position,
                    avatarUrl: c.avatar ? `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${c.avatar}/smThumb` : null,
                    nationality: c.nationality,
                    matched: !!match,
                    matchedDiscordId: match ? match.discordId : null,
                    matchedDiscordTag: match ? match.discordTag : null,
                    vpgPsn: profile ? profile.psn : null,
                    vpgXbox: profile ? profile.xbox : null,
                    vpgOrigin: profile ? profile.origin : null,
                    vpgBioIds: profile ? profile.bioIds : []
                };
            });

            // 7. Match local players against VPG contracts using console IDs case/symbol-insensitively
            const comparedLocal = enhancedLocalPlayers.map(lp => {
                const match = contracts.find(c => {
                    const profile = vpgProfiles.find(p => p.username.toLowerCase() === c.username.toLowerCase());
                    return matchesPlayer(c, lp, profile);
                });

                return {
                    discordId: lp.discordId,
                    discordTag: lp.discordTag,
                    psnId: lp.psnId,
                    isManager: lp.isManager,
                    isCaptain: lp.isCaptain,
                    matched: !!match,
                    matchedVpgUsername: match ? match.username : null
                };
            });

            res.json({
                isLinked: true,
                localTeamId: localTeam._id,
                localTeamName: localTeam.name,
                localTeamAbbr: localTeam.abbreviation,
                localTeamLogo: localTeam.logoUrl,
                vpgContracts: comparedVpg,
                localPlayers: comparedLocal
            });
        } catch (e) {
            console.error('[API VPG Compare] Error:', e);
            res.status(500).json({ error: 'Error al comparar plantillas.' });
        }
    });

    // Get team matches (calendar)
    app.get('/api/vpg/teams/:teamSlug/matches', async (req, res) => {
        try {
            const { teamSlug } = req.params;
            const { status } = req.query; // e.g. scheduled, complete
            const matchStatus = status || 'scheduled';

            const matchesData = await fetchFromVpg(`teams/${teamSlug}/matches?match_status=${matchStatus}`);
            const matches = Array.isArray(matchesData) ? matchesData : (matchesData.data || matchesData.results || []);
            res.json({ matches });
        } catch (e) {
            console.error('[API VPG Matches] Error:', e);
            res.status(500).json({ error: 'No se pudo cargar el calendario de partidos.' });
        }
    });

    // Auto-fetch official match dates from a first-division VPG team's calendar combined with DB historical dates
    app.get('/api/vpg/official-match-dates', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const db = getDb();

            // 1. Get all unique dates from our scanned_matches in MongoDB using aggregation
            // Subtract 14400 seconds (4 hours) so late night matches (00:00 - 04:00) are grouped with the previous day's VPG match night
            const dbDates = await db.collection('scanned_matches').aggregate([
                {
                    $project: {
                        dateStr: {
                            $dateToString: {
                                date: {
                                    $toDate: {
                                        $multiply: [
                                            { $subtract: [ { $toDouble: "$timestamp" }, 14400 ] },
                                            1000
                                        ]
                                    }
                                },
                                format: "%Y-%m-%d",
                                timezone: "Europe/Madrid"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$dateStr",
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { _id: 1 }
                }
            ]).toArray();

            const datesMap = new Map();
            for (const item of dbDates) {
                datesMap.set(item._id, {
                    dateStr: item._id,
                    count: item.count,
                    isOfficial: false
                });
            }

            // 2. Get Superliga table to find a team slug for VPG calendar dates
            let teamSlug = null;
            const defaultLeagues = ["superliga-spain-a", "superliga-spain-b"];
            let activeLeagues = defaultLeagues;
            try {
                const config = await getDb().collection('fantasy_config').findOne({ key: "active_leagues" });
                if (config && Array.isArray(config.slugs) && config.slugs.length > 0) {
                    activeLeagues = config.slugs;
                }
            } catch (e) {
                console.error('[official-match-dates] Error reading active leagues config:', e);
            }
            const superligaSlugs = [...activeLeagues, 'Esports-Premier-PS5', 'superliga-spain-a', 'superliga-spain-b'];
            for (const slug of superligaSlugs) {
                try {
                    const tableData = await fetchFromVpg(`leagues/${slug}/table`);
                    const teams = Array.isArray(tableData) ? tableData : (tableData.data || tableData.results || Object.values(tableData));
                    if (teams.length > 0 && teams[0].team_slug) {
                        teamSlug = teams[0].team_slug;
                        break;
                    }
                } catch (_) { /* try next */ }
            }

            if (teamSlug) {
                // 3. Fetch VPG calendar dates (recent + upcoming) to merge
                for (const status of ['complete', 'scheduled']) {
                    try {
                        let url = `teams/${teamSlug}/matches?match_status=${status}`;
                        let pageCount = 0;
                        const MAX_PAGES = 10; // Safety limit

                        while (url && pageCount < MAX_PAGES) {
                            pageCount++;
                            let data;
                            if (url.startsWith('http')) {
                                const directRes = await fetch(url, { headers: VPG_HEADERS, redirect: 'follow' });
                                if (!directRes.ok) break;
                                data = await directRes.json();
                            } else {
                                data = await fetchFromVpg(url);
                            }

                            const matches = Array.isArray(data) ? data : (data.results || data.data || []);
                            for (const m of matches) {
                                if (m.datetime) {
                                    const d = new Date(m.datetime);
                                    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' });
                                    const madridDate = formatter.format(d);
                                    
                                    if (datesMap.has(madridDate)) {
                                        datesMap.get(madridDate).isOfficial = true;
                                    } else {
                                        datesMap.set(madridDate, {
                                            dateStr: madridDate,
                                            count: 0,
                                            isOfficial: true
                                        });
                                    }
                                }
                            }

                            if (Array.isArray(data)) break;
                            url = data.next || null;
                        }
                    } catch (e) {
                        console.error(`[VPG Dates] Error fetching VPG ${status} matches:`, e.message);
                    }
                }
            }

            // Sort all dates chronologically
            const sortedDates = Array.from(datesMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));

            // 4. Also return the crawler time range (already configured)
            const { getBotSettings } = await import('./database.js');
            const settings = await getBotSettings();
            const timeRange = settings.crawlerTimeRange || { start: '21:00', end: '23:59' };

            res.json({
                teamSlug,
                dates: sortedDates,
                timeRange,
                total: sortedDates.length
            });
        } catch (e) {
            console.error('[API VPG Official Dates] Error:', e);
            res.status(500).json({ error: 'Error al obtener las fechas oficiales de VPG.' });
        }
    });

    // === VPN (Virtual Pro Network) API Routes ===
    const vpnLeagues = [
        { id: 2212, season: 6377, name: '1ª División', slug: '1-division' },
        { id: 2213, season: 6378, name: '2ª División', slug: '2-division' },
        { id: 2214, season: 6379, name: '3ª División A', slug: '3-division-a' },
        { id: 2215, season: 6380, name: '3ª División B', slug: '3-division-b' },
        { id: 2216, season: 6381, name: 'Regional A', slug: 'regional-a' },
        { id: 2217, season: 6382, name: 'Regional B', slug: 'regional-b' }
    ];

    const vpnTeamsCache = {
        data: null,
        timestamp: 0
    };
    const VPN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache

    async function fetchAllVpnTeams() {
        if (vpnTeamsCache.data && (Date.now() - vpnTeamsCache.timestamp < VPN_CACHE_TTL)) {
            return vpnTeamsCache.data;
        }
        
        let allTeams = [];
        let page = 1;
        let totalPages = 1;
        
        do {
            const url = `https://www.virtualpronetwork.com/api/competitions/52/teams?page=${page}`;
            console.log(`[VPN Crawler] Fetching page ${page}: ${url}`);
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Failed to fetch page ${page}: ${res.statusText}`);
            }
            const data = await res.json();
            
            if (data.rows && Array.isArray(data.rows)) {
                allTeams = allTeams.concat(data.rows);
            }
            
            totalPages = data.totalPages || Math.ceil((data.count || 0) / 10) || 1;
            page++;
        } while (page <= totalPages);
        
        vpnTeamsCache.data = allTeams;
        vpnTeamsCache.timestamp = Date.now();
        return allTeams;
    }

    // --- MIDDLEWARE OWNER ONLY ---
    function isOwner(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        if (req.user.id === process.env.OWNER_DISCORD_ID) {
            next();
        } else {
            res.status(403).json({ error: 'No tienes permisos de propietario.' });
        }
    }

    // --- MIDDLEWARE: Any authenticated user ---
    function isAuthenticated(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión con Discord.' });
        next();
    }

    // --- MIDDLEWARE: Fantasy enabled (granted to all authenticated users who are Discord members) ---
    async function isFantasyEnabled(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión con Discord.' });
        let isMember = req.user.isMember;
        let isMemberModified = false;
        if (isMember !== true) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${req.user.id}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
                req.user.isMember = isMember;
                isMemberModified = true;
            } catch (e) { isMember = false; }
        }
        if (isMemberModified) {
            saveUserSession(req);
        }
        if (!isMember) {
            return res.status(403).json({ error: 'Debes ser miembro del servidor Discord.' });
        }
        next();
    }

    // --- MIDDLEWARE: Fantasy Admin (owner and referees) ---
    function isFantasyAdmin(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        const isOwner = req.user.id === process.env.OWNER_DISCORD_ID;
        const adminRoleIds = [
            '1393505777443930183',
            process.env.ARBITER_ROLE_ID,
            process.env.ADMIN_ROLE_ID,
            ...(process.env.ADMIN_ROLE_IDS?.split(',') || [])
        ].filter(Boolean);
        const hasAdminRole = Array.isArray(req.user.roles) && req.user.roles.some(r => adminRoleIds.includes(r));
        if (isOwner || hasAdminRole) return next();
        return res.status(403).json({ error: 'Solo el administrador o los árbitros pueden realizar esta acción.' });
    }

    // --- MIDDLEWARE: Fantasy Owner (only owner) ---
    function isFantasyOwner(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        const isOwner = req.user.id === process.env.OWNER_DISCORD_ID;
        if (isOwner) return next();
        return res.status(403).json({ error: 'Solo el Owner del bot puede realizar esta acción.' });
    }

    // --- MIDDLEWARE: Can Admin a specific League (owner, referee, league creator, or helper) ---
    async function canAdminLeague(req, res, next) {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });
        const isAdmin = req.user.id === process.env.OWNER_DISCORD_ID;
        const isReferee = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
        if (isAdmin || isReferee) return next();
        // Check if user is the league creator or co-admin (helper)
        try {
            const db = getDb();
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });
            if (league && (league.createdBy === req.user.id || league.coAdmin === req.user.id)) return next();
        } catch (e) {
            console.error('[canAdminLeague] Error:', e);
        }
        return res.status(403).json({ error: 'No tienes permisos para administrar esta liga.' });
    }

    app.get('/vpn.html', (req, res) => {
        if (!req.user || req.user.id !== process.env.OWNER_DISCORD_ID) {
            return res.redirect('/home.html');
        }
        res.sendFile('vpn.html', { root: 'public' });
    });

    // List VPN leagues
    app.get('/api/vpn/leagues', async (req, res) => {
        try {
            res.json({ leagues: vpnLeagues });
        } catch (e) {
            console.error('[API VPN Leagues] Error:', e);
            res.status(500).json({ error: 'No se pudieron cargar las ligas de VPN.' });
        }
    });

    // Get league table & matches dictionary
    app.get('/api/vpn/leagues/:leagueId/table', async (req, res) => {
        try {
            const { leagueId } = req.params;
            let { season } = req.query;
            if (!season) {
                const l = vpnLeagues.find(x => x.id === parseInt(leagueId));
                season = l ? l.season : '';
            }
            const url = `https://www.virtualpronetwork.com/api/leagues/${leagueId}/table?season=${season}`;
            console.log(`[VPN Proxy] Fetching league ${leagueId} table with season ${season}: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`VPN API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            res.json(data);
        } catch (e) {
            console.error('[API VPN Table] Error:', e);
            res.status(500).json({ error: `Error al obtener la clasificación de la liga VPN ${leagueId}` });
        }
    });

    // Search candidate team
    app.get('/api/vpn/search-candidate', isOwner, async (req, res) => {
        try {
            const { name, abbr } = req.query;
            if (!name) return res.status(400).json({ error: 'Falta el nombre del equipo' });

            const cleanQueryName = cleanTeamName(name);
            const cleanQueryAbbr = abbr ? abbr.toLowerCase().trim() : '';

            // Fetch already linked VPN team IDs from the database to exclude them
            const testDb = getDb('test');
            const linkedTeams = await testDb.collection('teams').find({ vpnTeamId: { $exists: true, $ne: null } }).toArray();
            const linkedIds = new Set(linkedTeams.map(t => Number(t.vpnTeamId)));

            const allVpnRows = await fetchAllVpnTeams();
            const matches = [];

            allVpnRows.forEach(row => {
                const t = row.team;
                if (!t || !t.name || !t.id) return;
                
                const teamId = Number(t.id);
                if (linkedIds.has(teamId)) return;

                const cleanVpnName = cleanTeamName(t.name);
                let score = 0;

                if (cleanVpnName === cleanQueryName) {
                    score = 100;
                } else if (cleanVpnName.includes(cleanQueryName) || cleanQueryName.includes(cleanVpnName)) {
                    score = 80;
                } else if (cleanQueryAbbr && (cleanVpnName.includes(cleanQueryAbbr) || t.name.toLowerCase().includes(cleanQueryAbbr))) {
                    score = 50;
                }

                if (score >= 50) {
                    matches.push({
                        id: teamId,
                        name: t.name,
                        slug: t.url,
                        logoUrl: t.logoUrl,
                        score
                    });
                }
            });

            // Sort matches by highest score first
            matches.sort((a, b) => b.score - a.score);
            res.json({ matches });
        } catch (e) {
            console.error('[API VPN Search Candidate] Error:', e);
            res.status(500).json({ error: 'Error al buscar candidatos en VPN.' });
        }
    });

    // List local teams with their vpn integration fields
    app.get('/api/vpn/local-teams', isOwner, async (req, res) => {
        try {
            const testDb = getDb('test');
            const teams = await testDb.collection('teams')
                .find({}, { projection: { name: 1, abbreviation: 1, logoUrl: 1, vpnTeamId: 1, vpnTeamSlug: 1, vpnLeagueId: 1, vpnLeagueSlug: 1 } })
                .toArray();
            res.json({ teams });
        } catch (e) {
            console.error('[API VPN Local Teams] Error:', e);
            res.status(500).json({ error: 'Error al obtener los equipos locales.' });
        }
    });

    // Link a team to VPN
    app.post('/api/vpn/link', isOwner, async (req, res) => {
        try {
            const { localTeamId, vpnTeamId, vpnTeamSlug, vpnLeagueId, vpnLeagueSlug } = req.body;
            if (!localTeamId) return res.status(400).json({ error: 'Falta localTeamId' });

            const updateFields = { 
                vpnTeamId: vpnTeamId ? Number(vpnTeamId) : null, 
                vpnTeamSlug, 
                vpnLeagueId: vpnLeagueId ? Number(vpnLeagueId) : null, 
                vpnLeagueSlug 
            };

            const testDb = getDb('test');
            await testDb.collection('teams').updateOne(
                { _id: new ObjectId(localTeamId) },
                { $set: updateFields }
            );
            res.json({ success: true, message: 'Equipo vinculado correctamente con VPN.' });
        } catch (e) {
            console.error('[API VPN Link] Error:', e);
            res.status(500).json({ error: 'Error al vincular el equipo con VPN.' });
        }
    });

    // Unlink a team from VPN
    app.post('/api/vpn/unlink', isOwner, async (req, res) => {
        try {
            const { localTeamId } = req.body;
            if (!localTeamId) return res.status(400).json({ error: 'Falta localTeamId' });

            const testDb = getDb('test');
            await testDb.collection('teams').updateOne(
                { _id: new ObjectId(localTeamId) },
                { $unset: { vpnTeamId: "", vpnTeamSlug: "", vpnLeagueId: "", vpnLeagueSlug: "" } }
            );
            res.json({ success: true, message: 'Equipo desvinculado de VPN correctamente.' });
        } catch (e) {
            console.error('[API VPN Unlink] Error:', e);
            res.status(500).json({ error: 'Error al desvincular el equipo de VPN.' });
        }
    });

    // === VPG Fantasy League (Estilo Marca) ===

    // Serve private_pages static assets (CSS/JS) - requires authentication
    app.get('/private_pages/fantasy.css', (req, res) => {
        res.sendFile('fantasy.css', { root: 'private_pages' });
    });
    app.get('/private_pages/fantasy.js', (req, res) => {
        res.sendFile('fantasy.js', { root: 'private_pages' });
    });

    app.get('/fantasy', async (req, res) => {
        if (!req.user) return res.redirect('/login?returnTo=/fantasy');
        let isMember = req.user.isMember;
        let isMemberModified = false;
        if (isMember !== true) {
            try {
                const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${req.user.id}`, {
                    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` }
                });
                isMember = response.ok;
                req.user.isMember = isMember;
                isMemberModified = true;
            } catch (e) { isMember = false; }
        }
        if (isMemberModified) {
            saveUserSession(req);
        }
        if (!isMember) {
            return res.redirect('/dashboard.html?notMember=true');
        }
        res.sendFile('fantasy.html', { root: 'private_pages' });
    });

    // ========== FANTASY API: User Info ==========
    app.get('/api/fantasy/me', isAuthenticated, isFantasyEnabled, (req, res) => {
        const isOwner = req.user.id === process.env.OWNER_DISCORD_ID;
        const adminRoleIds = [
            '1393505777443930183',
            process.env.ARBITER_ROLE_ID,
            process.env.ADMIN_ROLE_ID,
            ...(process.env.ADMIN_ROLE_IDS?.split(',') || [])
        ].filter(Boolean);
        const hasAdminRole = Array.isArray(req.user.roles) && req.user.roles.some(r => adminRoleIds.includes(r));
        const isAdmin = isOwner || hasAdminRole;
        res.json({
            discordId: req.user.id,
            username: req.user.global_name || req.user.username,
            avatar: req.user.avatar,
            isAdmin: isAdmin,
            isOwner: isOwner
        });
    });

    // ========== FANTASY API: Config (Owner only) ==========
    app.get('/api/fantasy/admin/config/leagues', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const db = getDb();
            const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
            const allLeagues = await fetchVpgSpainLeagues();
            const activeLeagues = config && Array.isArray(config.slugs) ? config.slugs : allLeagues.map(l => l.slug);
            res.json({ activeLeagues, allLeagues });
        } catch (e) {
            console.error('[API Get Fantasy Leagues Config] Error:', e);
            res.status(500).json({ error: 'Error al obtener la configuración de ligas.' });
        }
    });

    app.post('/api/fantasy/admin/config/leagues', isAuthenticated, isFantasyOwner, async (req, res) => {
        try {
            const { activeLeagues } = req.body;
            if (!Array.isArray(activeLeagues)) {
                return res.status(400).json({ error: 'activeLeagues debe ser un array.' });
            }
            const db = getDb();
            await db.collection('fantasy_config').updateOne(
                { key: "active_leagues" },
                { $set: { slugs: activeLeagues.map(s => s.trim()) } },
                { upsert: true }
            );
            res.json({ success: true, message: 'Configuración guardada correctamente.', activeLeagues });
        } catch (e) {
            console.error('[API Post Fantasy Leagues Config] Error:', e);
            res.status(500).json({ error: 'Error al guardar la configuración de ligas.' });
        }
    });

    // Get allow-user-leagues config (accessible to all authenticated users)
    app.get('/api/fantasy/admin/config/allow-user-leagues', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const config = await db.collection('fantasy_config').findOne({ key: 'allow_user_league_creation' });
            res.json({ allowed: config ? !!config.value : false });
        } catch (e) {
            console.error('[API Get Allow User Leagues] Error:', e);
            res.status(500).json({ error: 'Error al obtener configuración.' });
        }
    });

    // Set allow-user-leagues config (admin only)
    app.post('/api/fantasy/admin/config/allow-user-leagues', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { allowed } = req.body;
            const db = getDb();
            await db.collection('fantasy_config').updateOne(
                { key: 'allow_user_league_creation' },
                { $set: { key: 'allow_user_league_creation', value: !!allowed } },
                { upsert: true }
            );
            res.json({ success: true, allowed: !!allowed, message: allowed ? 'Solicitudes de ligas habilitadas.' : 'Solicitudes de ligas deshabilitadas.' });
        } catch (e) {
            console.error('[API Post Allow User Leagues] Error:', e);
            res.status(500).json({ error: 'Error al guardar configuración.' });
        }
    });

    // Get lock-lineups config (accessible to all authenticated users)
    app.get('/api/fantasy/admin/config/lock-lineups', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const config = await db.collection('fantasy_config').findOne({ key: 'lock_lineups_active' });
            res.json({ locked: config ? !!config.value : true });
        } catch (e) {
            console.error('[API Get Lock Lineups] Error:', e);
            res.status(500).json({ error: 'Error al obtener configuración.' });
        }
    });

    // Set lock-lineups config (admin only)
    app.post('/api/fantasy/admin/config/lock-lineups', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { locked } = req.body;
            const db = getDb();
            await db.collection('fantasy_config').updateOne(
                { key: 'lock_lineups_active' },
                { $set: { key: 'lock_lineups_active', value: !!locked } },
                { upsert: true }
            );
            
            // Also sync it to schedules.lock.active
            const schedConfig = await db.collection('fantasy_config').findOne({ key: 'schedules' });
            if (schedConfig && schedConfig.lock) {
                await db.collection('fantasy_config').updateOne(
                    { key: 'schedules' },
                    { $set: { "lock.active": !!locked } }
                );
            }
            
            res.json({ success: true, locked: !!locked, message: locked ? 'Bloqueo de alineaciones habilitado.' : 'Bloqueo de alineaciones deshabilitado.' });
        } catch (e) {
            console.error('[API Post Lock Lineups] Error:', e);
            res.status(500).json({ error: 'Error al guardar configuración.' });
        }
    });

    // GET public schedules (accessible to anyone, for FAQ and web timers)
    app.get('/api/fantasy/public/schedules', async (req, res) => {
        try {
            const db = getDb();
            const schedules = await db.collection('fantasy_config').findOne({ key: 'schedules' });
            if (schedules) {
                res.json(schedules);
            } else {
                // Fallback structure
                res.json({
                    market: { active: true, days: [0,1,2,3,4,5,6], windows: ["18:00", "", ""] },
                    points: { active: true, days: [0,1,2,3,4,5,6], time: "18:00" },
                    lock: { active: true, days: [1,2,3,4], startTime: "21:30", durationHours: 4 }
                });
            }
        } catch (e) {
            console.error('[API Get Public Schedules] Error:', e);
            res.status(500).json({ error: 'Error al obtener horarios públicos.' });
        }
    });

    // GET authenticated schedules (accessible to all authenticated users)
    app.get('/api/fantasy/config/schedules', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const schedules = await db.collection('fantasy_config').findOne({ key: 'schedules' });
            if (schedules) {
                res.json(schedules);
            } else {
                res.json({
                    market: { active: true, days: [0,1,2,3,4,5,6], windows: ["18:00", "", ""] },
                    points: { active: true, days: [0,1,2,3,4,5,6], time: "18:00" },
                    lock: { active: true, days: [1,2,3,4], startTime: "21:30", durationHours: 4 }
                });
            }
        } catch (e) {
            console.error('[API Get Config Schedules] Error:', e);
            res.status(500).json({ error: 'Error al obtener horarios.' });
        }
    });

    // POST admin config schedules (admin only)
    app.post('/api/fantasy/admin/config/schedules', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { market, points, lock } = req.body;
            
            if (!market || typeof market.active !== 'boolean' || !Array.isArray(market.days)) {
                return res.status(400).json({ error: 'Estructura de mercado inválida.' });
            }
            const validWindows = (market.windows || []).filter(w => typeof w === 'string' && w.trim() !== '');
            for (const t of validWindows) {
                if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) {
                    return res.status(400).json({ error: `Formato de hora de ventana de mercado inválido: ${t}` });
                }
            }
            if (validWindows.length === 0) {
                return res.status(400).json({ error: 'Debes definir al menos una ventana horaria para el mercado.' });
            }
            if (validWindows.length > 3) {
                return res.status(400).json({ error: 'El mercado admite un máximo de 3 ventanas horarias.' });
            }
            
            if (!points || typeof points.active !== 'boolean' || !Array.isArray(points.days) || typeof points.time !== 'string') {
                return res.status(400).json({ error: 'Estructura de puntos de rendimiento inválida.' });
            }
            if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(points.time)) {
                return res.status(400).json({ error: 'Formato de hora de sincronización de puntos inválido.' });
            }
            
            if (!lock || typeof lock.active !== 'boolean' || !Array.isArray(lock.days) || typeof lock.startTime !== 'string' || isNaN(Number(lock.durationHours))) {
                return res.status(400).json({ error: 'Estructura de bloqueo de alineación inválida.' });
            }
            if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(lock.startTime)) {
                return res.status(400).json({ error: 'Formato de hora de inicio de bloqueo de alineación inválido.' });
            }
            const duration = Number(lock.durationHours);
            if (duration < 1 || duration > 24) {
                return res.status(400).json({ error: 'La duración del bloqueo de alineación debe estar entre 1 y 24 horas.' });
            }

            const db = getDb();
            const existing = await db.collection('fantasy_config').findOne({ key: 'schedules' }) || {};
            const oldMarket = existing.market || {};
            const oldPoints = existing.points || {};
            
            const newSchedule = {
                key: 'schedules',
                market: {
                    active: market.active,
                    days: market.days.map(Number).filter(d => d >= 0 && d <= 6),
                    windows: [
                        validWindows[0] || "",
                        validWindows[1] || "",
                        validWindows[2] || ""
                    ],
                    lastRun: oldMarket.lastRun || ""
                },
                points: {
                    active: points.active,
                    days: points.days.map(Number).filter(d => d >= 0 && d <= 6),
                    time: points.time,
                    lastRun: oldPoints.lastRun || ""
                },
                lock: {
                    active: lock.active,
                    days: lock.days.map(Number).filter(d => d >= 0 && d <= 6),
                    startTime: lock.startTime,
                    durationHours: duration
                }
            };
            
            await db.collection('fantasy_config').updateOne(
                { key: 'schedules' },
                { $set: newSchedule },
                { upsert: true }
            );
            
            // Sync with lock_lineups_active
            await db.collection('fantasy_config').updateOne(
                { key: 'lock_lineups_active' },
                { $set: { key: 'lock_lineups_active', value: lock.active } },
                { upsert: true }
            );

            res.json({ success: true, message: 'Horarios guardados y actualizados correctamente.', schedules: newSchedule });
        } catch (e) {
            console.error('[API Post Config Schedules] Error:', e);
            res.status(500).json({ error: 'Error al guardar horarios de automatización.' });
        }
    });

    // ========== FANTASY API: Leagues ==========

    // Get active VPG leagues config for users to choose during creation
    app.get('/api/fantasy/active-leagues', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
            const allLeagues = await fetchVpgSpainLeagues();
            const activeLeagues = config && Array.isArray(config.slugs) ? config.slugs : allLeagues.map(l => l.slug);
            res.json({ activeLeagues, allLeagues });
        } catch (e) {
            console.error('[API Get Active Leagues] Error:', e);
            res.status(500).json({ error: 'Error al obtener las ligas activas.' });
        }
    });

    // List all leagues
    app.get('/api/fantasy/leagues', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const discordId = req.user.id;
            const leagues = await db.collection('fantasy_leagues').find({ $or: [{ approved: true }, { approved: { $exists: false } }] }).sort({ createdAt: -1 }).toArray();
            // For each league, count participants and check current user status
            for (const league of leagues) {
                league.participantCount = await db.collection('fantasy_teams').countDocuments({ leagueId: league._id.toString() });
                
                const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId: league._id.toString() });
                if (userTeam) {
                    league.isJoined = true;
                    league.isApproved = !!userTeam.approved;
                } else {
                    league.isJoined = false;
                    league.isApproved = false;
                }
                
                // Allow league creators, co-admins, and global admins to view the password
                const isGlobalAdmin = discordId === process.env.OWNER_DISCORD_ID || (Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183'));
                const isLeagueAdmin = league.createdBy === discordId || league.coAdmin === discordId;
                if (!isGlobalAdmin && !isLeagueAdmin) {
                    delete league.password;
                }
            }
            res.json({ leagues });
        } catch (e) {
            console.error('[API Fantasy Leagues] Error:', e);
            res.status(500).json({ error: 'Error al obtener las ligas.' });
        }
    });

    // Get pending league requests (admin only)
    app.get('/api/fantasy/leagues/pending-leagues', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const db = getDb();
            const pending = await db.collection('fantasy_leagues').find({ approved: false }).sort({ createdAt: -1 }).toArray();
            pending.forEach(league => {
                delete league.password;
            });
            res.json({ pending });
        } catch (e) {
            console.error('[API Fantasy Pending Leagues] Error:', e);
            res.status(500).json({ error: 'Error al obtener ligas pendientes.' });
        }
    });

    // Approve a pending league (admin only)
    app.post('/api/fantasy/leagues/:id/approve-league', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const db = getDb();
            const leagueId = req.params.id;
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });

            await db.collection('fantasy_leagues').updateOne(
                { _id: new ObjectId(leagueId) },
                { $set: { approved: true } }
            );

            // Generate initial free agent pool upon approval
            league.approved = true;
            try {
                await generateMarketFreeAgentsPool(db, league);
            } catch (err) {
                console.error('[API Fantasy Approve League] Error generating free agents pool:', err);
            }

            // Notificar al creador por MD de Discord
            if (client && league.createdBy) {
                try {
                    const user = await client.users.fetch(league.createdBy);
                    if (user) {
                        await user.send(`🎉 ¡Buenas noticias! Tu solicitud para crear la liga **${league.name}** ha sido **aprobada** por un administrador. Ya puedes entrar y gestionarla en la web.`);
                    }
                } catch (dmErr) {
                    console.error('[Approve League DM] No se pudo enviar MD al creador:', dmErr.message);
                }
            }

            res.json({ success: true, message: 'Liga aprobada correctamente y mercado de agentes libres inicializado.' });
        } catch (e) {
            console.error('[API Fantasy Approve League] Error:', e);
            res.status(500).json({ error: 'Error al aprobar la liga.' });
        }
    });

    // Reject (delete) a pending league (admin only)
    app.delete('/api/fantasy/leagues/:id/reject-league', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const db = getDb();
            const leagueId = req.params.id;
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });

            await db.collection('fantasy_leagues').deleteOne({ _id: new ObjectId(leagueId) });

            // Notificar al creador por MD de Discord
            if (client && league && league.createdBy) {
                try {
                    const user = await client.users.fetch(league.createdBy);
                    if (user) {
                        await user.send(`❌ Tu solicitud para crear la liga **${league.name}** ha sido **rechazada** por un administrador.`);
                    }
                } catch (dmErr) {
                    console.error('[Reject League DM] No se pudo enviar MD al creador:', dmErr.message);
                }
            }

            res.json({ success: true, message: 'Solicitud de liga rechazada y eliminada.' });
        } catch (e) {
            console.error('[API Fantasy Reject League] Error:', e);
            res.status(500).json({ error: 'Error al rechazar la liga.' });
        }
    });

    // Create league (any authenticated user if allowed, admins always)
    app.post('/api/fantasy/leagues', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { name, maxParticipants, initialBudget, pointsMode, vpgLeagues, privacy, password } = req.body;
            if (!name || name.trim() === '') return res.status(400).json({ error: 'El nombre de la liga es obligatorio.' });
            
            const db = getDb();
            const isAdmin = req.user.id === process.env.OWNER_DISCORD_ID;
            const isReferee = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
            const isPrivileged = isAdmin || isReferee;

            // If not admin/referee, check if user league creation is allowed
            if (!isPrivileged) {
                const config = await db.collection('fantasy_config').findOne({ key: 'allow_user_league_creation' });
                if (!config || !config.value) {
                    return res.status(403).json({ error: 'La creación de ligas por usuarios no está habilitada actualmente.' });
                }
            }

            // Get active VPG leagues from global config
            const vpgConfig = await db.collection('fantasy_config').findOne({ key: 'active_leagues' });
            let globalActiveSlugs = [];
            if (vpgConfig && Array.isArray(vpgConfig.slugs)) {
                globalActiveSlugs = vpgConfig.slugs;
            } else {
                const allLeagues = await fetchVpgSpainLeagues();
                globalActiveSlugs = allLeagues.map(l => l.slug);
            }

            let selectedLeagues = [];
            if (vpgLeagues !== undefined) {
                if (!Array.isArray(vpgLeagues)) {
                    return res.status(400).json({ error: 'Las ligas VPG deben proporcionarse como un array.' });
                }
                if (vpgLeagues.length === 0) {
                    return res.status(400).json({ error: 'Debes seleccionar al menos una liga VPG.' });
                }
                // Filter to keep only those that are globally active
                selectedLeagues = vpgLeagues.filter(slug => globalActiveSlugs.includes(slug));
                if (selectedLeagues.length === 0) {
                    return res.status(400).json({ error: 'Ninguna de las ligas VPG seleccionadas es válida o está activa globalmente.' });
                }
            } else {
                // If not provided, fallback to all globally active ones
                selectedLeagues = globalActiveSlugs;
            }

            const modeSelected = pointsMode === 'zero' ? 'zero' : 'accumulated';
            let basePoints = {};
            if (modeSelected === 'zero') {
                const players = await db.collection('player_profiles').find({ "stats.vpgPoints": { $exists: true } }).toArray();
                for (const p of players) {
                    if (p.eaPlayerName) {
                        basePoints[p.eaPlayerName] = p.stats.vpgPoints || 0;
                    }
                }
            }

            let maxLimit = 14;
            if (selectedLeagues.length === 1) {
                maxLimit = 8;
            } else if (selectedLeagues.length >= 2) {
                maxLimit = 18;
            }
            const parsedMaxParticipants = parseInt(maxParticipants) || 14;
            if (parsedMaxParticipants < 2 || parsedMaxParticipants > maxLimit) {
                return res.status(400).json({ error: `El número de participantes debe estar entre 2 y ${maxLimit}.` });
            }

            const league = {
                name: name.trim(),
                createdBy: req.user.id,
                createdByUsername: req.user.global_name || req.user.username,
                status: 'open',
                marketOpen: true,
                maxParticipants: parsedMaxParticipants,
                maxSquadSize: 15,
                initialBudget: parseInt(initialBudget) || 100000000,
                pointsMode: modeSelected,
                basePoints,
                createdAt: new Date(),
                startedAt: null,
                endedAt: null,
                vpgLeagues: selectedLeagues,
                approved: isPrivileged, // admins: true, users: false
                privacy: privacy === 'private' ? 'private' : 'public',
                password: (privacy === 'private' && password) ? password.trim() : null
            };
            const result = await db.collection('fantasy_leagues').insertOne(league);
            league._id = result.insertedId;
            
            if (league.approved) {
                try {
                    await generateMarketFreeAgentsPool(db, league);
                } catch (err) {
                    console.error('[API Fantasy Create League] Error generating free agents pool:', err);
                }
            }
            
            const message = isPrivileged
                ? `Liga "${league.name}" creada y mercado de agentes libres inicializado.`
                : `Solicitud de liga "${league.name}" enviada. Un administrador debe aprobarla.`;
            
            // Delete password before returning league details to client
            const returnedLeague = { ...league };
            delete returnedLeague.password;
            
            res.json({ success: true, message, league: returnedLeague, needsApproval: !isPrivileged });
        } catch (e) {
            console.error('[API Fantasy Create League] Error:', e);
            res.status(500).json({ error: 'Error al crear la liga.' });
        }
    });

    // Update league (admin only)
    app.put('/api/fantasy/leagues/:id', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const { name, status, maxParticipants, allowClauses, clauseMultiplier, initialBudget, privacy, password } = req.body;
            const db = getDb();
            const updateFields = {};
            if (name) updateFields.name = name.trim();
            if (status) {
                updateFields.status = status;
                if (status === 'active') updateFields.startedAt = new Date();
                if (status === 'closed') updateFields.endedAt = new Date();
            }
            if (maxParticipants) {
                const parsedMax = parseInt(maxParticipants);
                const existingLeague = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });
                const currentVpgLeagues = req.body.vpgLeagues !== undefined ? (Array.isArray(req.body.vpgLeagues) ? req.body.vpgLeagues : []) : (existingLeague ? existingLeague.vpgLeagues : []);
                const maxLimit = (Array.isArray(currentVpgLeagues) ? currentVpgLeagues.length : 0) >= 2 ? 18 : 14;
                if (parsedMax < 2 || parsedMax > maxLimit) {
                    return res.status(400).json({ error: `El número de participantes debe estar entre 2 y ${maxLimit}.` });
                }
                updateFields.maxParticipants = parsedMax;
            }
            if (allowClauses !== undefined) updateFields.allowClauses = !!allowClauses;
            if (clauseMultiplier !== undefined) updateFields.clauseMultiplier = parseFloat(clauseMultiplier);
            if (initialBudget !== undefined) updateFields.initialBudget = parseInt(initialBudget);
            if (req.body.vpgLeagues !== undefined) {
                updateFields.vpgLeagues = Array.isArray(req.body.vpgLeagues) ? req.body.vpgLeagues : null;
            }
            if (privacy !== undefined) {
                updateFields.privacy = privacy === 'private' ? 'private' : 'public';
                if (updateFields.privacy === 'private') {
                    if (password && password.trim() !== '') {
                        updateFields.password = password.trim();
                    } else {
                        const existingLeague = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });
                        if (!existingLeague || (!existingLeague.password && (!password || password.trim() === ''))) {
                            return res.status(400).json({ error: 'Debes configurar una contraseña para una liga privada.' });
                        }
                    }
                } else {
                    updateFields.password = null;
                }
            }
            await db.collection('fantasy_leagues').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateFields });
            res.json({ success: true, message: 'Liga actualizada.' });
        } catch (e) {
            console.error('[API Fantasy Update League] Error:', e);
            res.status(500).json({ error: 'Error al actualizar la liga.' });
        }
    });

    // Delete league (admin only)
    app.delete('/api/fantasy/leagues/:id', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const leagueId = req.params.id;
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });

            const isAdmin = req.user.id === process.env.OWNER_DISCORD_ID;
            const isReferee = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
            if (!isAdmin && !isReferee && league.createdBy !== req.user.id) {
                return res.status(403).json({ error: 'No tienes permisos para eliminar esta liga (los ayudantes no pueden realizar esta acción).' });
            }

            await db.collection('fantasy_teams').deleteMany({ leagueId });
            await db.collection('fantasy_leagues').deleteOne({ _id: new ObjectId(leagueId) });
            res.json({ success: true, message: 'Liga y todos sus equipos eliminados.' });
        } catch (e) {
            console.error('[API Fantasy Delete League] Error:', e);
            res.status(500).json({ error: 'Error al eliminar la liga.' });
        }
    });

    // Toggle market open/close (admin only)
    app.post('/api/fantasy/leagues/:id/toggle-market', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            const newState = !league.marketOpen;
            await db.collection('fantasy_leagues').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { marketOpen: newState } });
            res.json({ success: true, message: `Mercado ${newState ? 'abierto' : 'cerrado'}.`, marketOpen: newState });
        } catch (e) {
            console.error('[API Fantasy Toggle Market] Error:', e);
            res.status(500).json({ error: 'Error al cambiar estado del mercado.' });
        }
    });

    // Toggle league status (admin only)
    app.post('/api/fantasy/leagues/:id/toggle-status', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            
            const newStatus = league.status === 'closed' ? 'active' : 'closed';
            await db.collection('fantasy_leagues').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: newStatus } });
            
            res.json({ 
                success: true, 
                message: `La liga ha sido ${newStatus === 'closed' ? 'finalizada' : 'reactivada'}.`, 
                status: newStatus 
            });
        } catch (e) {
            console.error('[API Fantasy Toggle Status] Error:', e);
            res.status(500).json({ error: 'Error al cambiar estado de la liga.' });
        }
    });

    // Toggle/assign co-admin helper role (creator, admin, referee only)
    app.post('/api/fantasy/leagues/:id/co-admin', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const leagueId = req.params.id;
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });

            // Ensure the user is creator, admin, or referee
            const isAdmin = req.user.id === process.env.OWNER_DISCORD_ID;
            const isReferee = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
            const isCreator = league.createdBy === req.user.id;

            if (!isAdmin && !isReferee && !isCreator) {
                return res.status(403).json({ error: 'Solo el creador de la liga, un administrador o un árbitro pueden gestionar el ayudante.' });
            }

            const { targetDiscordId } = req.body;
            if (!targetDiscordId) {
                return res.status(400).json({ error: 'Falta el ID del participante (targetDiscordId).' });
            }

            // Restrict setting creator as helper
            if (targetDiscordId === league.createdBy) {
                return res.status(400).json({ error: 'El creador de la liga no puede ser asignado como ayudante.' });
            }

            // Validate that the target is a participant of the league
            const team = await db.collection('fantasy_teams').findOne({ discordId: targetDiscordId, leagueId });
            if (!team) {
                return res.status(404).json({ error: 'El participante especificado no está inscrito en esta liga.' });
            }
            if (!team.approved) {
                return res.status(400).json({ error: 'El participante debe estar aprobado para ser asignado como ayudante.' });
            }

            const isRemoving = league.coAdmin === targetDiscordId;
            const newCoAdmin = isRemoving ? null : targetDiscordId;

            await db.collection('fantasy_leagues').updateOne(
                { _id: league._id },
                { $set: { coAdmin: newCoAdmin } }
            );

            res.json({
                success: true,
                message: isRemoving ? 'El participante ya no es ayudante.' : 'El participante ha sido asignado como ayudante.',
                coAdmin: newCoAdmin
            });
        } catch (e) {
            console.error('[API Fantasy Assign Co-Admin] Error:', e);
            res.status(500).json({ error: 'Error al cambiar el rol de ayudante.' });
        }
    });

    // Kick team from league (admin only)
    app.delete('/api/fantasy/leagues/:id/teams/:teamId', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(req.params.teamId), leagueId: req.params.id });
            if (!team) return res.status(404).json({ error: 'Equipo no encontrado.' });

            // Refund bids placed by other managers on this user's players
            const bidsToRefund = await db.collection('fantasy_market_bids').find({ 
                leagueId: req.params.id, 
                sellerDiscordId: team.discordId, 
                status: 'pending' 
            }).toArray();
            for (const b of bidsToRefund) {
                await db.collection('fantasy_teams').updateOne(
                    { discordId: b.bidderDiscordId, leagueId: req.params.id },
                    { $inc: { balance: Math.round(b.bidAmount) } }
                );
                console.log(`[KICK REFUND] Reembolsados ${b.bidAmount} € a ${b.bidderDiscordId} por expulsión del vendedor (${team.discordId}) para el jugador ${b.eaPlayerName}`);
            }

            const isApproved = !!team.approved;
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });

            await db.collection('fantasy_teams').deleteOne({ _id: team._id });

            // Clean up listings
            await db.collection('fantasy_market_listings').deleteMany({ leagueId: req.params.id, sellerDiscordId: team.discordId });

            // Clean up bids
            await db.collection('fantasy_market_bids').deleteMany({
                leagueId: req.params.id,
                $or: [
                    { bidderDiscordId: team.discordId },
                    { sellerDiscordId: team.discordId }
                ]
            });

            // Notificar al mánager por MD de Discord
            if (client && team.discordId) {
                try {
                    const user = await client.users.fetch(team.discordId);
                    if (user) {
                        const leagueName = league ? league.name : 'la liga';
                        if (isApproved) {
                            await user.send(`⚠️ Has sido **expulsado** de la liga **${leagueName}** y tu equipo **${team.teamName}** ha sido eliminado.`);
                        } else {
                            await user.send(`❌ Tu solicitud para unirte a la liga **${leagueName}** con el equipo **${team.teamName}** ha sido **rechazada**.`);
                        }
                    }
                } catch (dmErr) {
                    console.error('[Kick/Reject Team DM] No se pudo enviar MD al mánager:', dmErr.message);
                }
            }

            res.json({ success: true, message: 'Equipo expulsado y mercado limpiado correctamente.' });
        } catch (e) {
            console.error('[API Fantasy Kick Team] Error:', e);
            res.status(500).json({ error: 'Error al expulsar equipo.' });
        }
    });

    // Get all teams in a league (admin only)
    app.get('/api/fantasy/leagues/:id/teams', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const teams = await db.collection('fantasy_teams').find({ leagueId: req.params.id, approved: true }).sort({ points: -1 }).toArray();
            res.json({ teams });
        } catch (e) {
            console.error('[API Fantasy League Teams] Error:', e);
            res.status(500).json({ error: 'Error al obtener equipos.' });
        }
    });



    // Adjust team budget (admin only)
    app.post('/api/fantasy/leagues/:id/teams/:teamId/budget', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const { amount, action } = req.body;
            const numAmount = parseInt(amount);
            if (isNaN(numAmount)) {
                return res.status(400).json({ error: 'Monto no válido.' });
            }
            const db = getDb();
            const teamId = req.params.teamId;
            const leagueId = req.params.id;

            const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId), leagueId });
            if (!team) return res.status(404).json({ error: 'Equipo no encontrado.' });

            let newBalance;
            if (action === 'set') {
                newBalance = Math.round(numAmount);
            } else {
                newBalance = Math.round(team.balance + numAmount);
            }

            if (newBalance < 0) {
                return res.status(400).json({ error: 'El presupuesto resultante no puede ser negativo.' });
            }

            await db.collection('fantasy_teams').updateOne(
                { _id: new ObjectId(teamId) },
                { $set: { balance: newBalance } }
            );

            res.json({
                success: true,
                message: `Presupuesto de ${team.teamName} actualizado.`
            });
        } catch (e) {
            console.error('[API Adjust Budget] Error:', e);
            res.status(500).json({ error: 'Error al ajustar el presupuesto.' });
        }
    });

    // Add player to team manually (admin/referee only)
    app.post('/api/fantasy/leagues/:id/teams/:teamId/players/add', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const { playerName } = req.body;
            if (!playerName) {
                return res.status(400).json({ error: 'Nombre de jugador requerido.' });
            }
            const db = getDb();
            const leagueId = req.params.id;
            const teamId = req.params.teamId;

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });

            const targetTeam = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId), leagueId });
            if (!targetTeam) return res.status(404).json({ error: 'Equipo no encontrado.' });

            const player = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            if (!player) {
                return res.status(400).json({ error: 'Jugador no encontrado en la base de datos de perfiles.' });
            }

            const pName = player.eaPlayerName; // Use exact database case
            if (targetTeam.players && targetTeam.players.includes(pName)) {
                return res.status(400).json({ error: 'El jugador ya pertenece a este equipo.' });
            }

            // Check if player is already owned in this league
            const ownerTeam = await db.collection('fantasy_teams').findOne({ leagueId, players: pName });
            if (ownerTeam) {
                const ownerLineup = { ...ownerTeam.lineup };
                for (const pos in ownerLineup) {
                    if (Array.isArray(ownerLineup[pos])) {
                        ownerLineup[pos] = ownerLineup[pos].filter(p => p !== pName);
                    } else if (ownerLineup[pos] === pName) {
                        ownerLineup[pos] = null;
                    }
                }
                await db.collection('fantasy_teams').updateOne(
                    { _id: ownerTeam._id },
                    {
                        $pull: { players: pName },
                        $set: { lineup: ownerLineup },
                        $unset: {
                            [`clauses.${pName}`]: "",
                            [`clausesProtectedUntil.${pName}`]: ""
                        }
                    }
                );
                
                // Notify previous owner via Discord DM
                if (client && ownerTeam.discordId) {
                    try {
                        const user = await client.users.fetch(ownerTeam.discordId);
                        if (user) {
                            await user.send(`⚠️ **Modificación de Plantilla:** Un administrador o árbitro ha transferido al jugador **${pName}** fuera de tu equipo **${ownerTeam.teamName}** en la liga **${league.name}**.`);
                        }
                    } catch (dmErr) {
                        console.error('[Admin Transfer DM] No se pudo enviar MD al dueño anterior:', dmErr.message);
                    }
                }
            }

            // Calculate player's dynamic market price to set the initial clause
            const { price } = calculatePlayerPointsAndPrice(player);
            const clauseMultiplier = league.clauseMultiplier || 1.2;
            const initialClause = Math.round(price * clauseMultiplier);

            // Add player to target team
            await db.collection('fantasy_teams').updateOne(
                { _id: targetTeam._id },
                {
                    $push: { players: pName },
                    $set: {
                        [`clauses.${pName}`]: initialClause
                    }
                }
            );

            // Clean listings and pending bids
            await db.collection('fantasy_market_listings').deleteMany({ leagueId, eaPlayerName: pName });
            await refundPendingBidsForPlayer(db, leagueId, pName);

            console.log(`[ADMIN ACTION] ${req.user.username} añadió a ${pName} al equipo ${targetTeam.teamName} en liga ${league.name}`);

            res.json({
                success: true,
                message: `Jugador ${pName} añadido correctamente al equipo ${targetTeam.teamName}.`
            });
        } catch (e) {
            console.error('[API Admin Add Player] Error:', e);
            res.status(500).json({ error: 'Error al añadir el jugador.' });
        }
    });

    // Remove player from team manually (admin/referee only)
    app.post('/api/fantasy/leagues/:id/teams/:teamId/players/remove', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const { playerName } = req.body;
            if (!playerName) {
                return res.status(400).json({ error: 'Nombre de jugador requerido.' });
            }
            const db = getDb();
            const leagueId = req.params.id;
            const teamId = req.params.teamId;

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });

            const targetTeam = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId), leagueId });
            if (!targetTeam) return res.status(404).json({ error: 'Equipo no encontrado.' });

            // Case-insensitive search inside players array
            const exactPlayerName = targetTeam.players.find(p => p.toLowerCase() === playerName.toLowerCase());
            if (!exactPlayerName) {
                return res.status(400).json({ error: `El jugador ${playerName} no pertenece a este equipo.` });
            }

            const targetLineup = { ...targetTeam.lineup };
            for (const pos in targetLineup) {
                if (Array.isArray(targetLineup[pos])) {
                    targetLineup[pos] = targetLineup[pos].filter(p => p !== exactPlayerName);
                } else if (targetLineup[pos] === exactPlayerName) {
                    targetLineup[pos] = null;
                }
            }

            await db.collection('fantasy_teams').updateOne(
                { _id: targetTeam._id },
                {
                    $pull: { players: exactPlayerName },
                    $set: { lineup: targetLineup },
                    $unset: {
                        [`clauses.${exactPlayerName}`]: "",
                        [`clausesProtectedUntil.${exactPlayerName}`]: ""
                    }
                }
            );

            // Clean listings and pending bids
            await db.collection('fantasy_market_listings').deleteMany({ leagueId, eaPlayerName: exactPlayerName });
            await refundPendingBidsForPlayer(db, leagueId, exactPlayerName);

            // Notify owner via Discord DM
            if (client && targetTeam.discordId) {
                try {
                    const user = await client.users.fetch(targetTeam.discordId);
                    if (user) {
                        await user.send(`⚠️ **Modificación de Plantilla:** Un administrador o árbitro ha retirado al jugador **${exactPlayerName}** de tu equipo **${targetTeam.teamName}** en la liga **${league.name}**.`);
                    }
                } catch (dmErr) {
                    console.error('[Admin Remove DM] No se pudo enviar MD al dueño:', dmErr.message);
                }
            }

            console.log(`[ADMIN ACTION] ${req.user.username} retiró a ${exactPlayerName} del equipo ${targetTeam.teamName} en liga ${league.name}`);

            res.json({
                success: true,
                message: `Jugador ${exactPlayerName} retirado correctamente del equipo ${targetTeam.teamName}.`
            });
        } catch (e) {
            console.error('[API Admin Remove Player] Error:', e);
            res.status(500).json({ error: 'Error al retirar el jugador.' });
        }
    });

    // Recalculate all team points in a league (admin only)
    app.post('/api/fantasy/leagues/:id/recalculate', isAuthenticated, canAdminLeague, async (req, res) => {
        return res.status(400).json({ error: 'La recalculación completa no está soportada con el modelo de puntos acumulativos por alineación.' });
    });

    // Reset base points to current VPG points (admin only, ZERO points mode only)
    app.post('/api/fantasy/leagues/:id/reset-base-points', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.pointsMode !== 'zero') {
                return res.status(400).json({ error: 'El reseteo de puntos iniciales solo está disponible en ligas de modo ZERO.' });
            }

            const players = await db.collection('player_profiles').find({ "stats.vpgPoints": { $exists: true } }).toArray();
            const newBasePoints = {};
            for (const p of players) {
                if (p.eaPlayerName) {
                    newBasePoints[p.eaPlayerName] = p.stats.vpgPoints || 0;
                }
            }

            await db.collection('fantasy_leagues').updateOne(
                { _id: league._id },
                { $set: { basePoints: newBasePoints } }
            );

            // Now reset all teams' points to 0
            const teams = await db.collection('fantasy_teams').find({ leagueId: req.params.id }).toArray();
            let updated = 0;
            for (const team of teams) {
                await db.collection('fantasy_teams').updateOne({ _id: team._id }, { $set: { points: 0 } });
                updated++;
            }

            res.json({ success: true, message: `Puntos iniciales actualizados y puntos de ${updated} equipos restablecidos a 0.` });
        } catch (e) {
            console.error('[API Fantasy Reset Base Points] Error:', e);
            res.status(500).json({ error: 'Error al resetear los puntos iniciales.' });
        }
    });

    // Get all pending team requests in a league (admin only)
    app.get('/api/fantasy/leagues/:id/pending', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const db = getDb();
            const pending = await db.collection('fantasy_teams').find({ leagueId: req.params.id, approved: false }).toArray();
            res.json({ pending });
        } catch (e) {
            console.error('[API Fantasy Pending Requests] Error:', e);
            res.status(500).json({ error: 'Error al obtener solicitudes pendientes.' });
        }
    });

    // Approve a team request (admin only)
    app.post('/api/fantasy/leagues/:id/approve', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const { teamId } = req.body;
            if (!teamId) return res.status(400).json({ error: 'Falta teamId' });
            const db = getDb();

            // Obtener el equipo para saber el discordId y el nombre del equipo
            const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId), leagueId: req.params.id });
            if (!team) return res.status(404).json({ error: 'Equipo no encontrado.' });

            await db.collection('fantasy_teams').updateOne(
                { _id: new ObjectId(teamId), leagueId: req.params.id },
                { $set: { approved: true } }
            );
            try {
                await generateRandomSquadForTeam(db, req.params.id, teamId);
            } catch (err) {
                console.error('[API Fantasy Approve Request] Error generating random squad:', err);
            }

            // Obtener los datos de la liga para incluir el nombre en el MD
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(req.params.id) });

            // Notificar al mánager por MD de Discord
            if (client && team.discordId) {
                try {
                    const user = await client.users.fetch(team.discordId);
                    if (user) {
                        const leagueName = league ? league.name : 'la liga';
                        await user.send(`🎉 ¡Felicidades! Tu inscripción con el equipo **${team.teamName}** en la liga **${leagueName}** ha sido **aprobada**. Ya puedes entrar a ver tu plantilla y fichar en la web.`);
                    }
                } catch (dmErr) {
                    console.error('[Approve Team DM] No se pudo enviar MD al mánager:', dmErr.message);
                }
            }

            res.json({ success: true, message: 'Equipo aprobado e inscrito correctamente con su plantilla aleatoria asignada.' });
        } catch (e) {
            console.error('[API Fantasy Approve Request] Error:', e);
            res.status(500).json({ error: 'Error al aprobar equipo.' });
        }
    });

    // Check access to a league (public/private password, check if joined or admin)
    app.post('/api/fantasy/leagues/:id/access', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const discordId = req.user.id;
            const leagueId = req.params.id;
            const { password } = req.body;

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });

            // Check if user is already joined
            const team = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (team) {
                return res.json({ hasAccess: true, isJoined: true });
            }

            // Check if admin or referee
            const isAdmin = discordId === process.env.OWNER_DISCORD_ID;
            const isReferee = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
            if (isAdmin || isReferee) {
                return res.json({ hasAccess: true, isJoined: false });
            }

            // Check if public
            if (league.privacy !== 'private') {
                return res.json({ hasAccess: true, isJoined: false });
            }

            // If private, verify password
            if (!password || password.trim() !== league.password) {
                return res.status(401).json({ error: 'Contraseña de la liga incorrecta o no proporcionada.' });
            }

            res.json({ hasAccess: true, isJoined: false });
        } catch (e) {
            console.error('[API League Access] Error:', e);
            res.status(500).json({ error: 'Error al verificar acceso a la liga.' });
        }
    });

    // Join a league
    app.post('/api/fantasy/leagues/:id/join', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { teamName } = req.body;
            if (!teamName || teamName.trim() === '') return res.status(400).json({ error: 'Debes elegir un nombre para tu equipo.' });
            const db = getDb();
            const discordId = req.user.id;
            const leagueId = req.params.id;

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status !== 'open') return res.status(400).json({ error: 'Las inscripciones están cerradas para esta liga.' });

            // Check privacy and password (admin/referee bypass)
            const isAdminUser = discordId === process.env.OWNER_DISCORD_ID;
            const isRefereeUser = Array.isArray(req.user.roles) && req.user.roles.includes('1393505777443930183');
            if (league.privacy === 'private' && league.password) {
                if (!isAdminUser && !isRefereeUser) {
                    const { password } = req.body;
                    if (!password || password.trim() !== league.password) {
                        return res.status(401).json({ error: 'Contraseña de la liga incorrecta.' });
                    }
                }
            }

            // Check if already joined
            const existing = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (existing) return res.status(400).json({ error: 'Ya estás inscrito en esta liga.' });

            // Check max participants
            const count = await db.collection('fantasy_teams').countDocuments({ leagueId });
            if (count >= league.maxParticipants) return res.status(400).json({ error: 'La liga está llena.' });

            const isCreator = league.createdBy === discordId;
            const isAutoApproved = isAdminUser || isRefereeUser || isCreator;
            const team = {
                discordId,
                discordUsername: req.user.global_name || req.user.username,
                discordAvatar: req.user.avatar || null,
                leagueId,
                teamName: teamName.trim(),
                balance: league.initialBudget,
                players: [],
                clauses: {},
                lineup: { POR: null, DFC: [], MC: [], DC: [] },
                formation: '3-1-4-2',
                points: 0,
                approved: isAutoApproved, // Auto-approved if admin or referee
                joinedAt: new Date()
            };
            await db.collection('fantasy_teams').insertOne(team);
            if (isAutoApproved) {
                try {
                    await generateRandomSquadForTeam(db, leagueId, team._id);
                } catch (err) {
                    console.error('[API Fantasy Join] Error generating random squad:', err);
                }
            }
            res.json({ success: true, message: isAutoApproved ? `¡Te has unido a "${league.name}" y se te ha asignado tu plantilla inicial!` : `Solicitud de unión enviada para "${league.name}". Esperando aprobación del administrador.`, team });
        } catch (e) {
            console.error('[API Fantasy Join] Error:', e);
            res.status(500).json({ error: 'Error al unirse a la liga.' });
        }
    });

    // Leave League (user resigning/abandoning league)
    app.post('/api/fantasy/leagues/:id/leave', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const discordId = req.user.id;
            const leagueId = req.params.id;

            // Find the user's team
            const team = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!team) return res.status(404).json({ error: 'No tienes un equipo en esta liga.' });

            // Refund bids placed by other managers on this user's players
            const bidsToRefund = await db.collection('fantasy_market_bids').find({ 
                leagueId, 
                sellerDiscordId: discordId, 
                status: 'pending' 
            }).toArray();
            for (const b of bidsToRefund) {
                await db.collection('fantasy_teams').updateOne(
                    { discordId: b.bidderDiscordId, leagueId },
                    { $inc: { balance: Math.round(b.bidAmount) } }
                );
                console.log(`[LEAVE REFUND] Reembolsados ${b.bidAmount} € a ${b.bidderDiscordId} por abandono del vendedor (${discordId}) para el jugador ${b.eaPlayerName}`);
            }

            // Delete team
            await db.collection('fantasy_teams').deleteOne({ _id: team._id });

            // Clean up user's listings in this league
            await db.collection('fantasy_market_listings').deleteMany({ leagueId, sellerDiscordId: discordId });

            // Clean up bids placed by or sent to this user in this league
            await db.collection('fantasy_market_bids').deleteMany({
                leagueId,
                $or: [
                    { bidderDiscordId: discordId },
                    { sellerDiscordId: discordId }
                ]
            });

            res.json({ success: true, message: 'Has abandonado la liga correctamente.' });
        } catch (e) {
            console.error('[API Fantasy Leave] Error:', e);
            res.status(500).json({ error: 'Error al abandonar la liga.' });
        }
    });

    // Get leaderboard for a league (public within fantasy)
    app.get('/api/fantasy/leagues/:id/leaderboard', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const teams = await db.collection('fantasy_teams').find(
                { leagueId: req.params.id, approved: true },
                { projection: { discordId: 1, discordUsername: 1, discordAvatar: 1, teamName: 1, points: 1, players: 1, formation: 1, lineup: 1 } }
            ).sort({ points: -1 }).toArray();

            // Collect all unique starting 11 player names
            const allLineupPlayerNames = new Set();
            teams.forEach(t => {
                if (t.lineup) {
                    if (t.lineup.POR) allLineupPlayerNames.add(t.lineup.POR);
                    if (Array.isArray(t.lineup.DFC)) t.lineup.DFC.forEach(p => p && allLineupPlayerNames.add(p));
                    if (Array.isArray(t.lineup.MC)) t.lineup.MC.forEach(p => p && allLineupPlayerNames.add(p));
                    if (Array.isArray(t.lineup.DC)) t.lineup.DC.forEach(p => p && allLineupPlayerNames.add(p));
                }
            });

            // Fetch player profiles to calculate prices
            const playerNamesArray = Array.from(allLineupPlayerNames);
            const profiles = await db.collection('player_profiles').find(
                { eaPlayerName: { $in: playerNamesArray } }
            ).toArray();

            const priceMap = {};
            profiles.forEach(p => {
                const { price } = calculatePlayerPointsAndPrice(p);
                priceMap[p.eaPlayerName] = price || 0;
            });

            const leaderboard = teams.map((t, i) => {
                let lineupValue = 0;
                if (t.lineup) {
                    if (t.lineup.POR && priceMap[t.lineup.POR]) {
                        lineupValue += priceMap[t.lineup.POR];
                    }
                    if (Array.isArray(t.lineup.DFC)) {
                        t.lineup.DFC.forEach(p => {
                            if (p && priceMap[p]) lineupValue += priceMap[p];
                        });
                    }
                    if (Array.isArray(t.lineup.MC)) {
                        t.lineup.MC.forEach(p => {
                            if (p && priceMap[p]) lineupValue += priceMap[p];
                        });
                    }
                    if (Array.isArray(t.lineup.DC)) {
                        t.lineup.DC.forEach(p => {
                            if (p && priceMap[p]) lineupValue += priceMap[p];
                        });
                    }
                }

                return {
                    position: i + 1,
                    discordId: t.discordId,
                    discordUsername: t.discordUsername,
                    discordAvatar: t.discordAvatar,
                    teamName: t.teamName,
                    points: t.points,
                    playerCount: (t.players || []).length,
                    formation: t.formation,
                    lineupValue,
                    isMe: t.discordId === req.user.id
                };
            });

            res.json({ leaderboard });
        } catch (e) {
            console.error('[API Fantasy Leaderboard] Error:', e);
            res.status(500).json({ error: 'Error al obtener la clasificación.' });
        }
    });

    // Get my team in a league
    app.get('/api/fantasy/leagues/:id/my-team', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const discordId = req.user.id;
            const team = await db.collection('fantasy_teams').findOne({ discordId, leagueId: req.params.id });
            if (!team) return res.status(404).json({ error: 'No estás inscrito en esta liga.', notJoined: true });
            res.json(team);
        } catch (e) {
            console.error('[API Fantasy MyTeam] Error:', e);
            res.status(500).json({ error: 'Error al obtener tu equipo.' });
        }
    });

    // View another manager's team (read-only)
    app.get('/api/fantasy/leagues/:id/team/:discordId', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const team = await db.collection('fantasy_teams').findOne(
                { discordId: req.params.discordId, leagueId: req.params.id },
                { projection: { balance: 0 } }
            );
            if (!team) return res.status(404).json({ error: 'Equipo no encontrado.' });
            res.json(team);
        } catch (e) {
            console.error('[API Fantasy View Team] Error:', e);
            res.status(500).json({ error: 'Error al obtener el equipo.' });
        }
    });

    async function refundPendingBidsForPlayer(db, leagueId, eaPlayerName, excludeBidId = null) {
        const query = {
            leagueId,
            eaPlayerName: { $regex: new RegExp('^' + eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') },
            status: 'pending'
        };
        if (excludeBidId) {
            query._id = { $ne: new ObjectId(excludeBidId) };
        }
        const pendingBids = await db.collection('fantasy_market_bids').find(query).toArray();
        for (const b of pendingBids) {
            await db.collection('fantasy_teams').updateOne(
                { discordId: b.bidderDiscordId, leagueId },
                { $inc: { balance: Math.round(b.bidAmount) } }
            );
            await db.collection('fantasy_market_bids').updateOne(
                { _id: b._id },
                { $set: { status: 'rejected' } }
            );
            console.log(`[REFUND] Reembolsados ${b.bidAmount} € a ${b.bidderDiscordId} por puja rechazada en ${b.eaPlayerName}`);
        }
    }

    // Get available players (market)
    app.get('/api/fantasy/players', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const db = getDb();
            const { leagueId } = req.query;

            let customLeagues = null;
            let leagueDoc = null;
            if (leagueId) {
                leagueDoc = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
                if (leagueDoc && Array.isArray(leagueDoc.vpgLeagues) && leagueDoc.vpgLeagues.length > 0) {
                    customLeagues = leagueDoc.vpgLeagues;
                }
            }

            const { regexes, activeLeagues } = await getActiveFantasyTeams(db, customLeagues);
            const leaguesToQuery = customLeagues || activeLeagues;

            let extraPlayerNames = [];
            if (leagueId) {
                const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
                for (const team of teams) {
                    if (Array.isArray(team.players)) {
                        extraPlayerNames.push(...team.players);
                    }
                }
            }

            let playerQuery = { vpgLeagueSlug: { $in: leaguesToQuery } };
            if (extraPlayerNames.length > 0) {
                playerQuery = {
                    $or: [
                        { vpgLeagueSlug: { $in: leaguesToQuery } },
                        { eaPlayerName: { $in: extraPlayerNames } }
                    ]
                };
            }

            const rawPlayers = await db.collection('player_profiles').find(playerQuery).toArray();

            // Fetch team logos from test db
            const testDb = getDb('test');
            const teamsList = await testDb.collection('teams').find({}, { projection: { name: 1, logoUrl: 1 } }).toArray();
            const teamLogoMap = {};
            teamsList.forEach(t => {
                if (t.name) {
                    teamLogoMap[t.name.toLowerCase().trim()] = t.logoUrl || null;
                }
            });

            const ownerMap = {};
            const ownerDiscordIdMap = {};
            const clauseMap = {};
            const protectionMap = {};
            if (leagueId) {
                const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
                for (const team of teams) {
                    const clauses = team.clauses || {};
                    const protections = team.clausesProtectedUntil || {};
                    for (const pName of (team.players || [])) {
                        ownerMap[pName] = team.teamName;
                        ownerDiscordIdMap[pName] = team.discordId;
                        clauseMap[pName] = clauses[pName] || null;
                        protectionMap[pName] = protections[pName] || null;
                    }
                }
            }
            // Enrich with bidCount
            const bidCountMap = {};
            if (leagueId) {
                const pendingBids = await db.collection('fantasy_market_bids').find({ leagueId, status: 'pending' }).toArray();
                pendingBids.forEach(b => {
                    const nameLower = b.eaPlayerName.toLowerCase();
                    bidCountMap[nameLower] = (bidCountMap[nameLower] || 0) + 1;
                });
            }

            const processedPlayers = rawPlayers.map(p => {
                const { price, points: rawPoints, avgRating } = calculatePlayerPointsAndPrice(p);
                let points = rawPoints;
                let basePointsValue = 0;
                if (leagueDoc && leagueDoc.pointsMode === 'zero' && leagueDoc.basePoints) {
                    const playerNameLower = p.eaPlayerName.toLowerCase();
                    let base = 0;
                    if (leagueDoc.basePoints[p.eaPlayerName] !== undefined) {
                        base = leagueDoc.basePoints[p.eaPlayerName];
                    } else {
                        const foundKey = Object.keys(leagueDoc.basePoints).find(k => k.toLowerCase() === playerNameLower);
                        if (foundKey) {
                            base = leagueDoc.basePoints[foundKey];
                        }
                    }
                    points = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                    basePointsValue = base;
                }
                const displayClub = (p.lastClub && p.lastClub.toLowerCase() === 'black hawks') ? 'Thunder Gaming' : p.lastClub;
                const stats = p.stats || {};
                const nameLower = p.eaPlayerName.toLowerCase();

                return {
                    eaPlayerName: p.eaPlayerName,
                    lastClub: displayClub,
                    lastPosition: p.manualPosition || p.lastPosition || 'MC',
                    matchesPlayed: stats.matchesPlayed || 0,
                    goals: stats.goals || 0,
                    assists: stats.assists || 0,
                    avgRating: parseFloat(avgRating.toFixed(2)),
                    price,
                    points,
                    basePoints: basePointsValue,
                    owner: ownerMap[p.eaPlayerName] || null,
                    ownerDiscordId: ownerDiscordIdMap[p.eaPlayerName] || null,
                    clause: clauseMap[p.eaPlayerName] || null,
                    protectedUntil: protectionMap[p.eaPlayerName] || null,
                    bidCount: bidCountMap[nameLower] || 0,
                    clubLogo: (p.lastClub ? teamLogoMap[p.lastClub.toLowerCase().trim()] : null) || (displayClub ? teamLogoMap[displayClub.toLowerCase().trim()] : null) || null,
                    avatar: p.avatar || null,
                    nationality: p.nationality || p.user_nationality || null
                };
            });

            // Filter free agents that are not in marketFreeAgents
            let filteredPlayers = processedPlayers;
            if (leagueId) {
                const freeAgentsSet = new Set((leagueDoc && Array.isArray(leagueDoc.marketFreeAgents)) ? leagueDoc.marketFreeAgents.map(n => n.toLowerCase()) : []);
                filteredPlayers = processedPlayers.filter(p => {
                    const isOwned = ownerMap[p.eaPlayerName];
                    if (!isOwned) {
                        return freeAgentsSet.has(p.eaPlayerName.toLowerCase());
                    }
                    return true;
                });
            }

            res.json({ players: filteredPlayers });
        } catch (e) {
            console.error('[API Fantasy Players] Error:', e);
            res.status(500).json({ error: 'Error al obtener los jugadores.' });
        }
    });



    async function isLineupLocked() {
        const db = getDb();
        const config = await db.collection('fantasy_config').findOne({ key: 'lock_lineups_active' });
        const isLockEnabled = config ? !!config.value : true;
        if (!isLockEnabled) return false;

        const schedules = await db.collection('fantasy_config').findOne({ key: 'schedules' });
        const lockConfig = (schedules && schedules.lock) ? schedules.lock : {
            active: true,
            days: [1, 2, 3, 4],
            startTime: "21:30",
            durationHours: 4
        };

        if (!lockConfig.active) return false;

        const { day, hours, minutes } = getMadridTime();
        const totalMinutes = hours * 60 + minutes;

        const [startH, startM] = lockConfig.startTime.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const durationMin = Number(lockConfig.durationHours || 4) * 60;
        const days = lockConfig.days || [1, 2, 3, 4];

        // Case 1: Today is active, and time is within lock window starting today
        const diffToday = totalMinutes - startMin;
        if (days.includes(day) && diffToday >= 0 && diffToday < durationMin) {
            return true;
        }

        // Case 2: Yesterday was active, and time is within lock window starting yesterday (crossover midnight)
        const yesterday = (day === 0) ? 6 : day - 1;
        const diffYesterday = (totalMinutes + 1440) - startMin;
        if (days.includes(yesterday) && diffYesterday >= 0 && diffYesterday < durationMin) {
            return true;
        }

        return false;
    }

    function isPlayerInLineup(lineup, playerName) {
        if (!lineup || !playerName) return false;
        const nameLower = playerName.toLowerCase();
        if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
        if (Array.isArray(lineup.DFC) && lineup.DFC.some(p => p && p.toLowerCase() === nameLower)) return true;
        if (Array.isArray(lineup.MC) && lineup.MC.some(p => p && p.toLowerCase() === nameLower)) return true;
        if (Array.isArray(lineup.DC) && lineup.DC.some(p => p && p.toLowerCase() === nameLower)) return true;
        return false;
    }

    function isBuyoutLocked() {
        const { day, hours, minutes } = getMadridTime();
        if (day >= 1 && day <= 4) { // Monday to Thursday
            const totalMinutes = hours * 60 + minutes;
            // 18:30 is 1110 minutes. 23:59 is 1439 minutes.
            if (totalMinutes >= 1110 && totalMinutes <= 1439) {
                return true;
            }
        }
        return false;
    }

    // Buy a player (within a league)
    app.post('/api/fantasy/leagues/:id/buy', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { eaPlayerName } = req.body;
            if (!eaPlayerName) return res.status(400).json({ error: 'Falta eaPlayerName' });

            if (isBuyoutLocked()) {
                return res.status(400).json({ error: 'No se permiten clausulazos de lunes a jueves entre las 18:30 y las 23:59 (hora de Madrid).' });
            }

            const db = getDb();
            const discordId = req.user.id;
            const leagueId = req.params.id;

            const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!userTeam) return res.status(404).json({ error: 'No estás inscrito en esta liga.' });
            if (!userTeam.approved) return res.status(403).json({ error: 'Tu equipo está pendiente de aprobación por el administrador.' });

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada y no se permiten más fichajes.' });
            if (!league.marketOpen) return res.status(400).json({ error: 'El mercado está cerrado.' });

            if (userTeam.players.includes(eaPlayerName)) return res.status(400).json({ error: 'Ya tienes este jugador.' });

            const player = await db.collection('player_profiles').findOne({ eaPlayerName });
            if (!player) return res.status(404).json({ error: 'Jugador no encontrado.' });

            const { price } = calculatePlayerPointsAndPrice(player);

            // Check if player is owned by another team
            const ownerTeam = await db.collection('fantasy_teams').findOne({ leagueId, players: eaPlayerName });
            const clauseMultiplier = league.clauseMultiplier || 1.5;

            if (ownerTeam) {
                // Clausulazos must be enabled
                if (league.allowClauses === false) {
                    return res.status(400).json({ error: 'Este jugador ya pertenece a otro mánager y las cláusulas están desactivadas.' });
                }

                // Check if player is protected from clausulazo (2 days block)
                if (ownerTeam.clausesProtectedUntil && ownerTeam.clausesProtectedUntil[eaPlayerName]) {
                    const protectedUntil = new Date(ownerTeam.clausesProtectedUntil[eaPlayerName]);
                    if (protectedUntil > new Date()) {
                        const timeDiff = protectedUntil.getTime() - Date.now();
                        const days = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
                        const hours = Math.floor((timeDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        const mins = Math.max(1, Math.floor((timeDiff % (60 * 60 * 1000)) / (60 * 1000)));
                        let timeStr = '';
                        if (days > 0) timeStr += `${days}d `;
                        if (hours > 0 || days > 0) timeStr += `${hours}h `;
                        timeStr += `${mins}m`;
                        return res.status(400).json({ error: `Este jugador está protegido contra clausulazos durante ${timeStr} más.` });
                    }
                }

                // Determine clause value
                const ownerClauses = ownerTeam.clauses || {};
                const clauseAmount = ownerClauses[eaPlayerName] || Math.round(price * clauseMultiplier);

                if (userTeam.balance < clauseAmount) {
                    return res.status(400).json({ error: `Saldo insuficiente para clausulazo. Requiere ${clauseAmount.toLocaleString('es-ES')} €.` });
                }

                // --- Execute Clausulazo ---

                // 1. Remove player from owner, credit balance, unset clause, update lineup, unset protection
                const ownerLineup = { ...ownerTeam.lineup };
                for (const pos in ownerLineup) {
                    if (Array.isArray(ownerLineup[pos])) {
                        ownerLineup[pos] = ownerLineup[pos].filter(p => p !== eaPlayerName);
                    } else if (ownerLineup[pos] === eaPlayerName) {
                        ownerLineup[pos] = null;
                    }
                }

                await db.collection('fantasy_teams').updateOne(
                    { discordId: ownerTeam.discordId, leagueId },
                    {
                        $inc: { balance: clauseAmount },
                        $pull: { players: eaPlayerName },
                        $set: { lineup: ownerLineup },
                        $unset: { 
                            [`clauses.${eaPlayerName}`]: "",
                            [`clausesProtectedUntil.${eaPlayerName}`]: ""
                        }
                    }
                );

                // 2. Add player to buyer, deduct balance, set initial clause based on paid price and set 2-day protection
                const buyerInitialClause = Math.round(clauseAmount * clauseMultiplier);
                const protectedUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
                await db.collection('fantasy_teams').updateOne(
                    { discordId, leagueId },
                    {
                        $inc: { balance: -clauseAmount },
                        $push: { players: eaPlayerName },
                        $set: { 
                            [`clauses.${eaPlayerName}`]: buyerInitialClause,
                            [`clausesProtectedUntil.${eaPlayerName}`]: protectedUntil
                        }
                    }
                );

                // 3. Clean up listings and bids
                await db.collection('fantasy_market_listings').deleteMany({ leagueId, eaPlayerName });
                
                // Refund and reject all pending bids for this player
                await refundPendingBidsForPlayer(db, leagueId, eaPlayerName);

                // Check if lineup lock is active and the buyout is executed Mon-Thu (Madrid time)
                const config = await db.collection('fantasy_config').findOne({ key: 'lock_lineups_active' });
                const isLockEnabled = config ? !!config.value : true;
                const { day } = getMadridTime();
                const shouldDelayPoints = isLockEnabled && (day >= 1 && day <= 4);

                // Record the buyout (clausulazo) so point attribution is overridden in the next daily sync if needed
                await db.collection('fantasy_buyouts').insertOne({
                    leagueId,
                    eaPlayerName,
                    buyerDiscordId: discordId,
                    sellerDiscordId: ownerTeam.discordId,
                    timestamp: new Date(),
                    processed: !shouldDelayPoints,
                    wasStarter: isPlayerInLineup(ownerTeam.lineup, eaPlayerName)
                });

                // Notificar al dueño original por MD de Discord
                if (client && ownerTeam.discordId) {
                    try {
                        const user = await client.users.fetch(ownerTeam.discordId);
                        if (user) {
                            // Obtener el nombre del comprador
                            const buyerUser = await client.users.fetch(discordId).catch(() => null);
                            const buyerName = buyerUser ? buyerUser.tag : 'Otro mánager';
                            await user.send(`⚠️ **¡Clausulazo!** El mánager **${buyerName}** ha pagado la cláusula de rescisión de **${eaPlayerName}** por **${clauseAmount.toLocaleString('es-ES')} €**. El jugador ha sido transferido a su equipo en la liga **${league.name}**.`);
                        }
                    } catch (dmErr) {
                        console.error('[Clausulazo DM] No se pudo enviar MD al dueño original:', dmErr.message);
                    }
                }

                return res.json({
                    success: true,
                    message: `¡CLAUSULAZO! Has fichado a ${eaPlayerName} pagando su cláusula de rescisión de ${clauseAmount.toLocaleString('es-ES')} € al mánager del equipo ${ownerTeam.teamName}.`
                });

            } else {
                // Free agent buy is disabled, they must bid
                return res.status(400).json({ error: 'Los agentes libres no pueden comprarse de forma directa. Debes realizar una puja a ciegas por ellos.' });
            }
        } catch (e) {
            console.error('[API Fantasy Buy] Error:', e);
            res.status(500).json({ error: 'Error al comprar jugador.' });
        }
    });

    const FANTASY_FORMATIONS = {
        '4-4-2': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'DFC L' }, { label: 'DFC CL' }, { label: 'DFC CR' }, { label: 'DFC R' }],
            MC: [{ label: 'MC L' }, { label: 'MC CL' }, { label: 'MC CR' }, { label: 'MC R' }],
            DC: [{ label: 'DC L' }, { label: 'DC R' }]
        },
        '4-3-3': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'DFC L' }, { label: 'DFC CL' }, { label: 'DFC CR' }, { label: 'DFC R' }],
            MC: [{ label: 'MC L' }, { label: 'MC C' }, { label: 'MC R' }],
            DC: [{ label: 'EI' }, { label: 'DC' }, { label: 'ED' }]
        },
        '3-5-2': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }],
            MC: [{ label: 'MI' }, { label: 'MCD L' }, { label: 'MCO' }, { label: 'MCD R' }, { label: 'MD' }],
            DC: [{ label: 'DC L' }, { label: 'DC R' }]
        },
        '4-5-1': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'DFC L' }, { label: 'DFC CL' }, { label: 'DFC CR' }, { label: 'DFC R' }],
            MC: [{ label: 'MI' }, { label: 'MC L' }, { label: 'MCO' }, { label: 'MC R' }, { label: 'MD' }],
            DC: [{ label: 'DC' }]
        },
        '5-3-2': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'LI' }, { label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }, { label: 'LD' }],
            MC: [{ label: 'MC L' }, { label: 'MC C' }, { label: 'MC R' }],
            DC: [{ label: 'DC L' }, { label: 'DC R' }]
        },
        '3-1-4-2': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }],
            MC: [{ label: 'MCD' }, { label: 'MI' }, { label: 'MC L' }, { label: 'MC R' }, { label: 'MD' }],
            DC: [{ label: 'DC L' }, { label: 'DC R' }]
        },
        '3-4-3': {
            POR: [{ label: 'POR' }],
            DFC: [{ label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }],
            MC: [{ label: 'MI' }, { label: 'MC L' }, { label: 'MC R' }, { label: 'MD' }],
            DC: [{ label: 'EI' }, { label: 'DC' }, { label: 'ED' }]
        }
    };

    function isCentralDefender(pos) {
        return pos === 'DFC';
    }

    function isLateral(pos) {
        return ['LD', 'LI', 'LTD', 'LTI', 'CARR', 'CAD', 'CAI', 'DFD', 'DFI'].includes(pos);
    }

    function isMidfielder(pos) {
        return ['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(pos);
    }

    function isForward(pos) {
        return ['DC', 'ED', 'EI', 'MP'].includes(pos);
    }

    function isGoalkeeper(pos) {
        return ['POR', 'GK'].includes(pos);
    }

    function isPlayerEligibleForSlot(playerPosition, slotKey, formation, slotIndex) {
        if (!playerPosition || !slotKey || !formation) return false;
        const pos = playerPosition.toUpperCase();
        const slot = slotKey.toUpperCase();
        
        if (slot === 'POR') {
            return isGoalkeeper(pos);
        }
        
        if (slot === 'DFC') {
            if (!isCentralDefender(pos) && !isLateral(pos)) {
                return false;
            }
            if (['3-5-2', '3-1-4-2', '3-4-3'].includes(formation)) {
                return isCentralDefender(pos);
            }
            if (['4-4-2', '4-3-3', '4-5-1'].includes(formation)) {
                if (slotIndex === 1 || slotIndex === 2) {
                    return isCentralDefender(pos);
                }
                return isLateral(pos);
            }
            if (formation === '5-3-2') {
                if (slotIndex === 1 || slotIndex === 2 || slotIndex === 3) {
                    return isCentralDefender(pos);
                }
                return isLateral(pos);
            }
            return isCentralDefender(pos) || isLateral(pos);
        }
        
        const layout = FANTASY_FORMATIONS[formation];
        const slotConfig = layout?.[slotKey]?.[slotIndex];
        if (!slotConfig) return false;
        const label = slotConfig.label.toUpperCase();
        
        if (slot === 'MC') {
            if (label === 'MI' || label === 'MD') {
                return isLateral(pos) || ['MI', 'MD'].includes(pos);
            } else {
                return isMidfielder(pos);
            }
        }
        
        if (slot === 'DC') {
            if (label === 'EI' || label === 'ED') {
                return isLateral(pos) || isForward(pos);
            } else {
                return isForward(pos);
            }
        }
        
        return false;
    }

    // Save lineup (within a league)
    app.post('/api/fantasy/leagues/:id/lineup', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { lineup, formation } = req.body;
            if (!lineup || !formation) return res.status(400).json({ error: 'Faltan lineup o formation' });

            if (await isLineupLocked()) {
                return res.status(400).json({ error: 'No puedes modificar tu alineación de lunes a jueves entre las 21:30 y las 01:30 del día siguiente (hora de Madrid).' });
            }

            const db = getDb();
            const discordId = req.user.id;
            const leagueId = req.params.id;

            const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!userTeam) return res.status(404).json({ error: 'No estás inscrito en esta liga.' });
            if (!userTeam.approved) return res.status(403).json({ error: 'Tu equipo está pendiente de aprobación por el administrador.' });

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada y no se pueden cambiar las alineaciones.' });

            // Validate that all players in lineup are owned by user
            const owned = userTeam.players || [];
            
            // Check POR
            if (lineup.POR && !owned.includes(lineup.POR)) {
                return res.status(400).json({ error: `No posees al jugador ${lineup.POR}` });
            }
            // Check DFC
            if (lineup.DFC) {
                for (const player of lineup.DFC) {
                    if (player && !owned.includes(player)) {
                        return res.status(400).json({ error: `No posees al jugador ${player}` });
                    }
                }
            }
            // Check MC
            if (lineup.MC) {
                for (const player of lineup.MC) {
                    if (player && !owned.includes(player)) {
                        return res.status(400).json({ error: `No posees al jugador ${player}` });
                    }
                }
            }
            // Check DC
            if (lineup.DC) {
                for (const player of lineup.DC) {
                    if (player && !owned.includes(player)) {
                        return res.status(400).json({ error: `No posees al jugador ${player}` });
                    }
                }
            }

            // Validate positions eligibility
            const uniquePlayerNames = [];
            if (lineup.POR) uniquePlayerNames.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && uniquePlayerNames.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && uniquePlayerNames.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && uniquePlayerNames.push(p));

            const playerDocs = await db.collection('player_profiles').find({
                eaPlayerName: { $in: uniquePlayerNames }
            }).toArray();

            const playerPositionMap = {};
            for (const doc of playerDocs) {
                playerPositionMap[doc.eaPlayerName] = doc.manualPosition || doc.lastPosition || 'MC';
            }

            // Verify POR
            if (lineup.POR) {
                const pos = playerPositionMap[lineup.POR];
                if (!isPlayerEligibleForSlot(pos, 'POR', formation, 0)) {
                    return res.status(400).json({ error: `El jugador ${lineup.POR} (${pos}) no es apto para la posición POR.` });
                }
            }
            // Verify DFC
            if (Array.isArray(lineup.DFC)) {
                for (let idx = 0; idx < lineup.DFC.length; idx++) {
                    const player = lineup.DFC[idx];
                    if (player) {
                        const pos = playerPositionMap[player];
                        if (!isPlayerEligibleForSlot(pos, 'DFC', formation, idx)) {
                            return res.status(400).json({ error: `El jugador ${player} (${pos}) no es apto para la posición DFC en el índice ${idx} con la formación ${formation}.` });
                        }
                    }
                }
            }
            // Verify MC
            if (Array.isArray(lineup.MC)) {
                for (let idx = 0; idx < lineup.MC.length; idx++) {
                    const player = lineup.MC[idx];
                    if (player) {
                        const pos = playerPositionMap[player];
                        if (!isPlayerEligibleForSlot(pos, 'MC', formation, idx)) {
                            return res.status(400).json({ error: `El jugador ${player} (${pos}) no es apto para la posición MC en el índice ${idx} con la formación ${formation}.` });
                        }
                    }
                }
            }
            // Verify DC
            if (Array.isArray(lineup.DC)) {
                for (let idx = 0; idx < lineup.DC.length; idx++) {
                    const player = lineup.DC[idx];
                    if (player) {
                        const pos = playerPositionMap[player];
                        if (!isPlayerEligibleForSlot(pos, 'DC', formation, idx)) {
                            return res.status(400).json({ error: `El jugador ${player} (${pos}) no es apto para la posición DC en el índice ${idx} con la formación ${formation}.` });
                        }
                    }
                }
            }

            await db.collection('fantasy_teams').updateOne(
                { discordId, leagueId },
                { $set: { lineup, formation } }
            );

            res.json({ success: true, message: 'Alineación guardada correctamente.' });
        } catch (e) {
            console.error('[API Fantasy Save Lineup] Error:', e);
            res.status(500).json({ error: 'Error al guardar la alineación.' });
        }
    });

    // Sell a player (within a league)
    app.post('/api/fantasy/leagues/:id/sell', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { eaPlayerName } = req.body;
            if (!eaPlayerName) return res.status(400).json({ error: 'Falta eaPlayerName' });
            const db = getDb();
            const discordId = req.user.id;
            const leagueId = req.params.id;

            const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!userTeam) return res.status(404).json({ error: 'No estás inscrito en esta liga.' });
            if (!userTeam.approved) return res.status(403).json({ error: 'Tu equipo está pendiente de aprobación por el administrador.' });
            if (!userTeam.players.includes(eaPlayerName)) return res.status(400).json({ error: 'No tienes este jugador.' });

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada y no se permiten ventas.' });
            if (!league.marketOpen) return res.status(400).json({ error: 'El mercado está cerrado.' });

            const player = await db.collection('player_profiles').findOne({ eaPlayerName });
            if (!player) return res.status(404).json({ error: 'Jugador no encontrado.' });

            // Get market price using single source of truth
            const { price } = calculatePlayerPointsAndPrice(player);
            // 65% reimbursement penalty
            const saleReimbursement = Math.round(price * 0.65);

            // Remove from lineup too
            const newLineup = { ...userTeam.lineup };
            for (const pos in newLineup) {
                if (Array.isArray(newLineup[pos])) {
                    newLineup[pos] = newLineup[pos].filter(p => p !== eaPlayerName);
                } else if (newLineup[pos] === eaPlayerName) {
                    newLineup[pos] = null;
                }
            }

            // Update team: add balance, remove player from list, unset clause, save lineup, unset protection
            await db.collection('fantasy_teams').updateOne(
                { discordId, leagueId },
                { 
                    $inc: { balance: saleReimbursement }, 
                    $pull: { players: eaPlayerName }, 
                    $set: { lineup: newLineup },
                    $unset: { 
                        [`clauses.${eaPlayerName}`]: "",
                        [`clausesProtectedUntil.${eaPlayerName}`]: ""
                    }
                }
            );

            // Delete listings and bids
            await db.collection('fantasy_market_listings').deleteMany({ leagueId, sellerDiscordId: discordId, eaPlayerName });
            await db.collection('fantasy_market_bids').deleteMany({ leagueId, eaPlayerName, $or: [ { bidderDiscordId: discordId }, { sellerDiscordId: discordId } ] });

            res.json({ success: true, message: `Has vendido a ${eaPlayerName} por ${saleReimbursement.toLocaleString('es-ES')} € (65% de su valor de ${price.toLocaleString('es-ES')} €).` });
        } catch (e) {
            console.error('[API Fantasy Sell] Error:', e);
            res.status(500).json({ error: 'Error al vender jugador.' });
        }
    });

    // --- CLAUSE MANAGEMENT ---
    // Increase player release clause
    app.post('/api/fantasy/leagues/:id/players/:playerName/clause', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { id: leagueId, playerName: eaPlayerName } = req.params;
            const newClauseAmount = req.body.newClauseAmount || req.body.newClauseValue;
            if (!newClauseAmount || isNaN(newClauseAmount) || newClauseAmount <= 0) {
                return res.status(400).json({ error: 'Debes proporcionar un valor de cláusula válido mayor que cero.' });
            }
            const db = getDb();
            const discordId = req.user.id;

            const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!userTeam) return res.status(404).json({ error: 'No estás inscrito en esta liga.' });
            if (!userTeam.approved) return res.status(403).json({ error: 'Tu equipo está pendiente de aprobación.' });
            if (!userTeam.players.includes(eaPlayerName)) return res.status(400).json({ error: 'No posees a este jugador.' });

            const player = await db.collection('player_profiles').findOne({ eaPlayerName });
            if (!player) return res.status(404).json({ error: 'Jugador no encontrado.' });

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada y no se pueden modificar las cláusulas.' });

            const { price } = calculatePlayerPointsAndPrice(player);
            const clauseMultiplier = league.clauseMultiplier || 1.5;
            
            const currentClauses = userTeam.clauses || {};
            const currentClause = currentClauses[eaPlayerName] || Math.round(price * clauseMultiplier);

            if (newClauseAmount <= currentClause) {
                return res.status(400).json({ error: `La nueva cláusula debe ser superior a la actual (${currentClause.toLocaleString('es-ES')} €).` });
            }

            const cost = newClauseAmount - currentClause;
            if (userTeam.balance < cost) {
                return res.status(400).json({ error: `Saldo insuficiente. Subir la cláusula cuesta ${cost.toLocaleString('es-ES')} € y tu saldo es ${userTeam.balance.toLocaleString('es-ES')} €.` });
            }

            await db.collection('fantasy_teams').updateOne(
                { discordId, leagueId },
                {
                    $inc: { balance: -cost },
                    $set: { [`clauses.${eaPlayerName}`]: Math.round(newClauseAmount) }
                }
            );

            res.json({
                success: true,
                message: `Cláusula de ${eaPlayerName} subida a ${newClauseAmount.toLocaleString('es-ES')} € con un coste de ${cost.toLocaleString('es-ES')} €.`
            });
        } catch (e) {
            console.error('[API Fantasy Set Clause] Error:', e);
            res.status(500).json({ error: 'Error al cambiar la cláusula.' });
        }
    });

    // --- MARKET TRANSFER LIST ---
    // List player on transfer market
    app.post('/api/fantasy/leagues/:id/market/list', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const { eaPlayerName, askingPrice } = req.body;
            if (!eaPlayerName) return res.status(400).json({ error: 'Falta eaPlayerName' });
            if (askingPrice === undefined || isNaN(askingPrice) || askingPrice <= 0) {
                return res.status(400).json({ error: 'Precio de venta no válido.' });
            }
            const db = getDb();
            const discordId = req.user.id;

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada y no se pueden poner jugadores en el mercado.' });

            const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!userTeam) return res.status(404).json({ error: 'No estás inscrito en esta liga.' });
            if (!userTeam.players.includes(eaPlayerName)) return res.status(400).json({ error: 'No posees a este jugador.' });

            // Upsert listing
            await db.collection('fantasy_market_listings').updateOne(
                { leagueId, sellerDiscordId: discordId, eaPlayerName },
                {
                    $set: {
                        sellerTeamName: userTeam.teamName,
                        askingPrice: Math.round(askingPrice),
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            res.json({ success: true, message: `${eaPlayerName} puesto en venta por ${askingPrice.toLocaleString('es-ES')} €.` });
        } catch (e) {
            console.error('[API Fantasy List Market] Error:', e);
            res.status(500).json({ error: 'Error al listar jugador.' });
        }
    });

    // Unlist player from transfer market
    app.post('/api/fantasy/leagues/:id/market/unlist', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const { eaPlayerName } = req.body;
            if (!eaPlayerName) return res.status(400).json({ error: 'Falta eaPlayerName' });
            const db = getDb();
            const discordId = req.user.id;

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada.' });

            await db.collection('fantasy_market_listings').deleteOne({ leagueId, sellerDiscordId: discordId, eaPlayerName });
            // Remove pending bids for this listing
            await db.collection('fantasy_market_bids').deleteMany({ leagueId, sellerDiscordId: discordId, eaPlayerName });

            res.json({ success: true, message: `${eaPlayerName} retirado de la lista de transferibles.` });
        } catch (e) {
            console.error('[API Fantasy Unlist Market] Error:', e);
            res.status(500).json({ error: 'Error al retirar jugador.' });
        }
    });

    // Get listings for a league (excluding owned by caller)
    app.get('/api/fantasy/leagues/:id/market/listings', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const discordId = req.user.id;
            const db = getDb();

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            const listings = await db.collection('fantasy_market_listings').find({ leagueId }).toArray();
            
            if (listings.length === 0) return res.json([]);

            const playerNames = listings.map(l => l.eaPlayerName);
            const profiles = await db.collection('player_profiles').find({ eaPlayerName: { $in: playerNames } }).toArray();

            // Fetch team avatars
            const teams = await db.collection('fantasy_teams').find({ leagueId }, { projection: { discordId: 1, discordAvatar: 1 } }).toArray();
            const avatarMap = {};
            teams.forEach(t => {
                avatarMap[t.discordId] = t.discordAvatar;
            });

            const playerMap = {};
            profiles.forEach(p => {
                const { price, points: rawPoints, avgRating } = calculatePlayerPointsAndPrice(p);
                let points = rawPoints;
                let basePointsValue = 0;
                if (league && league.pointsMode === 'zero' && league.basePoints) {
                    const playerNameLower = p.eaPlayerName.toLowerCase();
                    let base = 0;
                    if (league.basePoints[p.eaPlayerName] !== undefined) {
                        base = league.basePoints[p.eaPlayerName];
                    } else {
                        const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === playerNameLower);
                        if (foundKey) {
                            base = league.basePoints[foundKey];
                        }
                    }
                    points = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                    basePointsValue = base;
                }
                playerMap[p.eaPlayerName] = {
                    lastPosition: p.manualPosition || p.lastPosition,
                    lastClub: p.lastClub,
                    avgRating: avgRating,
                    points: points,
                    price: price,
                    basePoints: basePointsValue
                };
            });

            const result = listings.map(l => ({
                _id: l._id,
                eaPlayerName: l.eaPlayerName,
                sellerDiscordId: l.sellerDiscordId,
                sellerTeamName: l.sellerTeamName,
                sellerAvatar: avatarMap[l.sellerDiscordId] || null,
                askingPrice: l.askingPrice,
                createdAt: l.createdAt,
                isMine: l.sellerDiscordId === discordId,
                playerInfo: playerMap[l.eaPlayerName] || { lastPosition: 'MC', lastClub: 'Sin Club', avgRating: 6.0, points: 0, price: l.askingPrice }
            }));

            res.json(result);
        } catch (e) {
            console.error('[API Fantasy Get Listings] Error:', e);
            res.status(500).json({ error: 'Error al obtener transferibles.' });
        }
    });

    // --- BIDDING SYSTEM ---
    // Place a bid on a player on transfer list
    app.post('/api/fantasy/leagues/:id/market/bid', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const { eaPlayerName, bidAmount, sellerDiscordId } = req.body;
            if (!eaPlayerName || !sellerDiscordId) return res.status(400).json({ error: 'Datos de puja incompletos.' });
            if (bidAmount === undefined || isNaN(bidAmount) || bidAmount <= 0) {
                return res.status(400).json({ error: 'Cantidad de la puja no válida.' });
            }
            const db = getDb();
            const discordId = req.user.id;

            // Validate that the bid amount is at least the player's market price
            const playerProfile = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            if (!playerProfile) return res.status(404).json({ error: 'Perfil de jugador no encontrado.' });

            const { price: playerMarketPrice } = calculatePlayerPointsAndPrice(playerProfile);
            if (Math.round(bidAmount) < playerMarketPrice) {
                return res.status(400).json({
                    error: `La puja mínima para este jugador debe ser su valor de mercado (${playerMarketPrice.toLocaleString('es-ES')} €).`
                });
            }

            if (sellerDiscordId === discordId) {
                return res.status(400).json({ error: 'No puedes pujar por tu propio jugador.' });
            }

            const userTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!userTeam) return res.status(404).json({ error: 'No estás inscrito en esta liga.' });
            if (!userTeam.approved) return res.status(403).json({ error: 'Tu equipo está pendiente de aprobación.' });

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada y no se permiten pujas.' });

            // Check if there is an existing bid by this bidder for this player
            const existingBid = await db.collection('fantasy_market_bids').findOne({ leagueId, bidderDiscordId: discordId, eaPlayerName });
            const oldBidAmount = existingBid ? existingBid.bidAmount : 0;
            const diff = Math.round(bidAmount) - oldBidAmount;

            if (userTeam.balance < diff) {
                return res.status(400).json({ error: `Saldo insuficiente. Esta puja requiere un incremento de ${diff.toLocaleString('es-ES')} € en tu balance, y tu saldo actual es ${userTeam.balance.toLocaleString('es-ES')} €.` });
            }

            if (sellerDiscordId === 'SYSTEM') {
                // Free agent validation
                if (!Array.isArray(league.marketFreeAgents) || !league.marketFreeAgents.map(n => n.toLowerCase()).includes(eaPlayerName.toLowerCase())) {
                    return res.status(400).json({ error: 'Este jugador no está disponible en el mercado de agentes libres de hoy.' });
                }
            } else {
                // Peer-to-peer verification
                const sellerTeam = await db.collection('fantasy_teams').findOne({ discordId: sellerDiscordId, leagueId });
                if (!sellerTeam || !sellerTeam.players.includes(eaPlayerName)) {
                    return res.status(400).json({ error: 'El vendedor ya no posee a este jugador.' });
                }
            }

            // Deduct the difference from the bidder's balance immediately
            await db.collection('fantasy_teams').updateOne({ _id: userTeam._id }, { $inc: { balance: -diff } });

            // Upsert bid
            await db.collection('fantasy_market_bids').updateOne(
                { leagueId, bidderDiscordId: discordId, eaPlayerName },
                {
                    $set: {
                        sellerDiscordId,
                        bidderTeamName: userTeam.teamName,
                        bidAmount: Math.round(bidAmount),
                        status: 'pending',
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            res.json({ success: true, message: `Puja enviada de ${bidAmount.toLocaleString('es-ES')} € por ${eaPlayerName}.` });
        } catch (e) {
            console.error('[API Fantasy Bid] Error:', e);
            res.status(500).json({ error: 'Error al enviar la puja.' });
        }
    });

    // Cancel/retract bid
    app.post('/api/fantasy/leagues/:id/market/bids/:bidId/cancel', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const bidId = req.params.bidId;
            const db = getDb();
            const discordId = req.user.id;

            const bid = await db.collection('fantasy_market_bids').findOne({ _id: new ObjectId(bidId), leagueId });
            if (!bid) return res.status(404).json({ error: 'Puja no encontrada.' });

            if (bid.bidderDiscordId !== discordId) {
                return res.status(403).json({ error: 'No tienes permiso para retirar esta puja.' });
            }

            if (bid.status !== 'pending') {
                return res.status(400).json({ error: 'Esta puja ya no está pendiente.' });
            }

            // Refund the money to team balance
            await db.collection('fantasy_teams').updateOne(
                { discordId, leagueId },
                { $inc: { balance: Math.round(bid.bidAmount) } }
            );

            // Delete the bid document
            await db.collection('fantasy_market_bids').deleteOne({ _id: new ObjectId(bidId) });

            res.json({ success: true, message: 'Puja retirada con éxito. Se ha reembolsado el importe a tu balance.' });
        } catch (e) {
            console.error('[API Fantasy Cancel Bid] Error:', e);
            res.status(500).json({ error: 'Error al retirar la puja.' });
        }
    });

    // Get bids (received & sent)
    app.get('/api/fantasy/leagues/:id/market/bids', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const discordId = req.user.id;
            const db = getDb();

            const received = await db.collection('fantasy_market_bids').find({ leagueId, sellerDiscordId: discordId, status: 'pending' }).toArray();
            const sent = await db.collection('fantasy_market_bids').find({ leagueId, bidderDiscordId: discordId }).toArray();

            // Enrich with player info
            const playerNames = [...new Set([...received.map(b => b.eaPlayerName), ...sent.map(b => b.eaPlayerName)])];
            const profiles = await db.collection('player_profiles').find({ eaPlayerName: { $in: playerNames } }).toArray();

            // Fetch team avatars and names
            const teams = await db.collection('fantasy_teams').find({ leagueId }, { projection: { discordId: 1, discordAvatar: 1, teamName: 1 } }).toArray();
            const avatarMap = {};
            const teamNameMap = {};
            teams.forEach(t => {
                avatarMap[t.discordId] = t.discordAvatar;
                teamNameMap[t.discordId] = t.teamName;
            });

            const playerMap = {};
            profiles.forEach(p => {
                const stats = calculatePlayerPointsAndPrice(p);
                playerMap[p.eaPlayerName] = {
                    lastPosition: p.manualPosition || p.lastPosition,
                    lastClub: p.lastClub,
                    price: stats.price
                };
            });

            const enrich = (bidsList) => bidsList.map(b => ({
                ...b,
                sellerAvatar: avatarMap[b.sellerDiscordId] || null,
                sellerTeamName: teamNameMap[b.sellerDiscordId] || 'Sin Equipo',
                bidderAvatar: avatarMap[b.bidderDiscordId] || null,
                bidderTeamName: teamNameMap[b.bidderDiscordId] || (b.bidderDiscordId === 'liga' ? 'La Liga' : 'Sin Equipo'),
                playerInfo: playerMap[b.eaPlayerName] || { lastPosition: 'MC', lastClub: 'Sin Club', price: b.bidAmount }
            }));

            res.json({
                received: enrich(received),
                sent: enrich(sent)
            });
        } catch (e) {
            console.error('[API Fantasy Get Bids] Error:', e);
            res.status(500).json({ error: 'Error al obtener pujas.' });
        }
    });

    // Respond to bid (accept/reject)
    app.post('/api/fantasy/leagues/:id/market/bids/:bidId/respond', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const bidId = req.params.bidId;
            const action = req.body.action || req.body.response; // 'accept' or 'reject'
            if (!action || !['accept', 'reject'].includes(action)) {
                return res.status(400).json({ error: 'Acción no válida. Debe ser accept o reject.' });
            }

            const db = getDb();
            const discordId = req.user.id;

            const bid = await db.collection('fantasy_market_bids').findOne({ _id: new ObjectId(bidId), leagueId });
            if (!bid) return res.status(404).json({ error: 'Oferta no encontrada.' });

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada.' });

            if (bid.sellerDiscordId !== discordId) {
                return res.status(403).json({ error: 'No tienes permiso para responder a esta oferta.' });
            }
            if (bid.status !== 'pending') {
                return res.status(400).json({ error: 'Esta oferta ya ha sido respondida.' });
            }

            if (action === 'reject') {
                await db.collection('fantasy_market_bids').updateOne(
                    { _id: new ObjectId(bidId) },
                    { $set: { status: 'rejected' } }
                );
                // Refund the bidder immediately since they paid upfront
                await db.collection('fantasy_teams').updateOne(
                    { discordId: bid.bidderDiscordId, leagueId },
                    { $inc: { balance: Math.round(bid.bidAmount) } }
                );
                return res.json({ success: true, message: 'Oferta rechazada y saldo reembolsado al comprador.' });
            }

            // --- Accept Bid Flow ---

            // Get league details (already fetched above)
            if (!league.marketOpen) return res.status(400).json({ error: 'El mercado está cerrado.' });

            // Check seller still has the player
            const sellerTeam = await db.collection('fantasy_teams').findOne({ discordId, leagueId });
            if (!sellerTeam.players.includes(bid.eaPlayerName)) {
                return res.status(400).json({ error: 'Ya no posees a este jugador en tu plantilla.' });
            }

            // --- LIGA BUYOUT SPECIAL FLOW ---
            if (bid.bidderDiscordId === 'liga') {
                const sellerLineup = { ...sellerTeam.lineup };
                for (const pos in sellerLineup) {
                    if (Array.isArray(sellerLineup[pos])) {
                        sellerLineup[pos] = sellerLineup[pos].filter(p => p !== bid.eaPlayerName);
                    } else if (sellerLineup[pos] === bid.eaPlayerName) {
                        sellerLineup[pos] = null;
                    }
                }

                await db.collection('fantasy_teams').updateOne(
                    { discordId, leagueId },
                    {
                        $inc: { balance: bid.bidAmount },
                        $pull: { players: bid.eaPlayerName },
                        $set: { lineup: sellerLineup },
                        $unset: { 
                            [`clauses.${bid.eaPlayerName}`]: "",
                            [`clausesProtectedUntil.${bid.eaPlayerName}`]: ""
                        }
                    }
                );

                // Update bid status to accepted
                await db.collection('fantasy_market_bids').updateOne(
                    { _id: new ObjectId(bidId) },
                    { $set: { status: 'accepted' } }
                );

                // Delete the listing for this player
                await db.collection('fantasy_market_listings').deleteOne({ leagueId, eaPlayerName: bid.eaPlayerName });

                // Refund and reject other pending bids for the same player in this league
                await refundPendingBidsForPlayer(db, leagueId, bid.eaPlayerName, bidId);

                return res.json({
                    success: true,
                    message: `¡Venta completada! Has vendido a ${bid.eaPlayerName} a La Liga por ${bid.bidAmount.toLocaleString('es-ES')} €.`
                });
            }

            // Check bidder exists
            const bidderTeam = await db.collection('fantasy_teams').findOne({ discordId: bid.bidderDiscordId, leagueId });
            if (!bidderTeam) return res.status(404).json({ error: 'El comprador ya no pertenece a la liga.' });

            const player = await db.collection('player_profiles').findOne({ eaPlayerName: bid.eaPlayerName });
            if (!player) return res.status(404).json({ error: 'Jugador no encontrado.' });
            const { price } = calculatePlayerPointsAndPrice(player);

            // Execute Peer Transfer!

            // 1. Add player to buyer, set initial clause with 2-day protection (buyer was already debited upfront)
            const clauseMultiplier = league.clauseMultiplier || 1.5;
            const buyerInitialClause = Math.round(price * clauseMultiplier);
            const protectionExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days protection

            await db.collection('fantasy_teams').updateOne(
                { discordId: bid.bidderDiscordId, leagueId },
                {
                    $push: { players: bid.eaPlayerName },
                    $set: { 
                        [`clauses.${bid.eaPlayerName}`]: buyerInitialClause,
                        [`clausesProtectedUntil.${bid.eaPlayerName}`]: protectionExpiry
                    }
                }
            );

            // 2. Credit seller, pull player, unset clause, remove from lineup
            const sellerLineup = { ...sellerTeam.lineup };
            for (const pos in sellerLineup) {
                if (Array.isArray(sellerLineup[pos])) {
                    sellerLineup[pos] = sellerLineup[pos].filter(p => p !== bid.eaPlayerName);
                } else if (sellerLineup[pos] === bid.eaPlayerName) {
                    sellerLineup[pos] = null;
                }
            }

            await db.collection('fantasy_teams').updateOne(
                { discordId, leagueId },
                {
                    $inc: { balance: bid.bidAmount },
                    $pull: { players: bid.eaPlayerName },
                    $set: { lineup: sellerLineup },
                    $unset: { 
                        [`clauses.${bid.eaPlayerName}`]: "",
                        [`clausesProtectedUntil.${bid.eaPlayerName}`]: ""
                    }
                }
            );

            // 3. Update bid status to accepted
            await db.collection('fantasy_market_bids').updateOne(
                { _id: new ObjectId(bidId) },
                { $set: { status: 'accepted' } }
            );

            // 4. Delete the listing for this player
            await db.collection('fantasy_market_listings').deleteOne({ leagueId, eaPlayerName: bid.eaPlayerName });

            // 5. Refund and reject other pending bids for the same player in this league
            await refundPendingBidsForPlayer(db, leagueId, bid.eaPlayerName, bidId);

            res.json({
                success: true,
                message: `¡Traspaso completado! Has vendido a ${bid.eaPlayerName} por ${bid.bidAmount.toLocaleString('es-ES')} € al mánager de ${bidderTeam.teamName}.`
            });
        } catch (e) {
            console.error('[API Fantasy Respond Bid] Error:', e);
            res.status(500).json({ error: 'Error al responder a la puja.' });
        }
    });


    // --- ADMIN PANEL CONTROLS ---
    // Toggle Clausulazos setting
    app.post('/api/fantasy/leagues/:id/toggle-clauses', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const { allowClauses } = req.body;
            if (allowClauses === undefined) return res.status(400).json({ error: 'Falta campo allowClauses' });

            const db = getDb();
            await db.collection('fantasy_leagues').updateOne(
                { _id: new ObjectId(leagueId) },
                { $set: { allowClauses: !!allowClauses } }
            );

            res.json({ success: true, message: `Cláusulas de rescisión ${allowClauses ? 'habilitadas' : 'deshabilitadas'} correctamente.` });
        } catch (e) {
            console.error('[API Toggle Clauses] Error:', e);
            res.status(500).json({ error: 'Error al configurar cláusulas.' });
        }
    });

    // Set Clause Multiplier setting
    app.post('/api/fantasy/leagues/:id/clause-multiplier', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const { clauseMultiplier } = req.body;
            if (clauseMultiplier === undefined || isNaN(clauseMultiplier) || clauseMultiplier < 1.0) {
                return res.status(400).json({ error: 'Multiplicador no válido (mínimo 1.0).' });
            }

            const db = getDb();
            await db.collection('fantasy_leagues').updateOne(
                { _id: new ObjectId(leagueId) },
                { $set: { clauseMultiplier: parseFloat(clauseMultiplier) } }
            );

            res.json({ success: true, message: `Multiplicador de cláusula fijado en ${clauseMultiplier}x.` });
        } catch (e) {
            console.error('[API Set Clause Multiplier] Error:', e);
            res.status(500).json({ error: 'Error al configurar multiplicador.' });
        }
    });

    // Admin reset all squads and free agent market
    app.post('/api/fantasy/leagues/:id/reset-all-squads', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const db = getDb();

            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            if (!league) return res.status(404).json({ error: 'Liga no encontrada.' });
            if (league.status === 'closed') return res.status(400).json({ error: 'La liga está finalizada.' });

            // 1. Refund pending bids
            const pendingBids = await db.collection('fantasy_market_bids').find({ leagueId, status: 'pending' }).toArray();
            for (const b of pendingBids) {
                await db.collection('fantasy_teams').updateOne(
                    { discordId: b.bidderDiscordId, leagueId },
                    { $inc: { balance: Math.round(b.bidAmount) } }
                );
            }

            // 2. Delete all bids and listings
            await db.collection('fantasy_market_bids').deleteMany({ leagueId });
            await db.collection('fantasy_market_listings').deleteMany({ leagueId });

            // 3. Find all teams in the league
            const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();

            // 4. Clear all teams' squads first to open up the player pool
            await db.collection('fantasy_teams').updateMany(
                { leagueId },
                {
                    $set: {
                        players: [],
                        lineup: { POR: null, DFC: [], MC: [], DC: [] },
                        clauses: {},
                        clausesProtectedUntil: {}
                    }
                }
            );

            // 5. Generate random squad for each team
            for (const team of teams) {
                await generateRandomSquadForTeam(db, leagueId, team._id.toString());
            }

            // 6. Regenerate market free agents pool
            await generateMarketFreeAgentsPool(db, league);

            res.json({
                success: true,
                message: `Se han restablecido correctamente las plantillas de todos los equipos (${teams.length}) y se ha regenerado el mercado con 30 nuevos agentes libres.`
            });
        } catch (e) {
            console.error('[API Reset All Squads] Error:', e);
            res.status(500).json({ error: 'Error al restablecer las plantillas y el mercado: ' + e.message });
        }
    });

    // Admin cancel and refund bids (all or below market value)
    app.post('/api/fantasy/leagues/:id/cancel-bids', isAuthenticated, canAdminLeague, async (req, res) => {
        try {
            const leagueId = req.params.id;
            const { mode } = req.body; // 'all' | 'below_value'
            if (!mode || !['all', 'below_value'].includes(mode)) {
                return res.status(400).json({ error: 'Modo de cancelación no válido. Debe ser "all" o "below_value".' });
            }

            const db = getDb();
            const pendingBids = await db.collection('fantasy_market_bids').find({ leagueId, status: 'pending' }).toArray();

            if (pendingBids.length === 0) {
                return res.json({ success: true, message: 'No hay pujas pendientes para cancelar.' });
            }

            let bidsToCancel = [];
            if (mode === 'below_value') {
                const playerNames = [...new Set(pendingBids.map(b => b.eaPlayerName))];
                const profiles = await db.collection('player_profiles').find({ eaPlayerName: { $in: playerNames } }).toArray();
                const playerPriceMap = {};
                profiles.forEach(p => {
                    const { price } = calculatePlayerPointsAndPrice(p);
                    playerPriceMap[p.eaPlayerName.toLowerCase()] = price;
                });

                bidsToCancel = pendingBids.filter(b => {
                    const marketPrice = playerPriceMap[b.eaPlayerName.toLowerCase()] || 0;
                    return b.bidAmount < marketPrice;
                });
            } else {
                bidsToCancel = pendingBids;
            }

            if (bidsToCancel.length === 0) {
                return res.json({ success: true, message: 'No se encontraron pujas que cumplan con la condición seleccionada.' });
            }

            // Refund each bidder
            for (const b of bidsToCancel) {
                await db.collection('fantasy_teams').updateOne(
                    { discordId: b.bidderDiscordId, leagueId },
                    { $inc: { balance: Math.round(b.bidAmount) } }
                );
            }

            // Delete refunded bids
            const bidIds = bidsToCancel.map(b => b._id);
            await db.collection('fantasy_market_bids').deleteMany({ _id: { $in: bidIds } });

            res.json({
                success: true,
                message: `Se han cancelado y reembolsado con éxito ${bidsToCancel.length} pujas ${mode === 'below_value' ? 'que eran menores al valor de mercado del jugador' : 'en total'}.`
            });
        } catch (e) {
            console.error('[API Cancel Bids] Error:', e);
            res.status(500).json({ error: 'Error al cancelar las pujas: ' + e.message });
        }
    });

    // Search players in admin panel
    app.get('/api/fantasy/admin/players/search', isAuthenticated, isFantasyEnabled, async (req, res) => {
        try {
            const { query, position, leagueId, vpgLeagueSlug, onlyNew } = req.query;
            
            const db = getDb();
            let customLeagues = null;
            let leagueDoc = null;
            if (leagueId) {
                try {
                    leagueDoc = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
                    if (leagueDoc && Array.isArray(leagueDoc.vpgLeagues) && leagueDoc.vpgLeagues.length > 0) {
                        customLeagues = leagueDoc.vpgLeagues;
                    }
                } catch (e) {
                    console.error('Invalid leagueId in search:', e);
                }
            }

            const queryObj = {
                excluded: { $ne: true }
            };

            const andConditions = [];

            if (vpgLeagueSlug) {
                andConditions.push({ vpgLeagueSlug: vpgLeagueSlug });
            } else {
                const { activeLeagues } = await getActiveFantasyTeams(db, customLeagues);
                const leaguesToQuery = customLeagues || activeLeagues;
                andConditions.push({
                    $or: [
                        { vpgLeagueSlug: { $in: leaguesToQuery } },
                        { vpgLeagueSlug: { $exists: false } },
                        { vpgLeagueSlug: null }
                    ]
                });
            }

            const hasQuery = query && query.trim().length >= 2;
            const hasPos = !!position;
            const isOnlyNew = onlyNew === 'true' || onlyNew === true;

            if (!hasQuery && !hasPos && !isOnlyNew) {
                return res.json([]);
            }

            if (hasQuery) {
                const regex = new RegExp(sanitizeInput(query.trim()), 'i');
                andConditions.push({
                    $or: [
                        { eaPlayerName: regex },
                        { lastClub: regex }
                    ]
                });
            }
            if (hasPos) {
                const posUpper = position.toUpperCase();
                let allowedPositions = [posUpper];
                if (posUpper === 'POR') allowedPositions = ['POR', 'GK'];
                else if (posUpper === 'DFC') allowedPositions = ['DFC', 'LD', 'LI'];
                else if (posUpper === 'CARR') allowedPositions = ['CARR', 'CAD', 'CAI'];
                else if (posUpper === 'MC') allowedPositions = ['MC', 'MCD', 'MCO', 'MD', 'MI'];
                else if (posUpper === 'DC') allowedPositions = ['DC', 'ED', 'EI', 'MP'];
                
                andConditions.push({ lastPosition: { $in: allowedPositions } });
            }
            if (isOnlyNew) {
                andConditions.push({
                    isNew: true,
                    newUntil: { $gt: new Date() }
                });
            }

            if (andConditions.length > 0) {
                queryObj.$and = andConditions;
            }

            const players = await db.collection('player_profiles').find(queryObj).limit(100).toArray();

            // Fetch team logos from test db
            const testDb = getDb('test');
            const teamsList = await testDb.collection('teams').find({}, { projection: { name: 1, logoUrl: 1 } }).toArray();
            const teamLogoMap = {};
            teamsList.forEach(t => {
                if (t.name) {
                    teamLogoMap[t.name.toLowerCase().trim()] = t.logoUrl || null;
                }
            });

            // Calculate points and prices for search results
            const processed = players.map(p => {
                const { price, points: rawPoints, avgRating } = calculatePlayerPointsAndPrice(p);
                let points = rawPoints;
                let basePointsValue = 0;
                if (leagueDoc && leagueDoc.pointsMode === 'zero' && leagueDoc.basePoints) {
                    const playerNameLower = p.eaPlayerName.toLowerCase();
                    let base = 0;
                    if (leagueDoc.basePoints[p.eaPlayerName] !== undefined) {
                        base = leagueDoc.basePoints[p.eaPlayerName];
                    } else {
                        const foundKey = Object.keys(leagueDoc.basePoints).find(k => k.toLowerCase() === playerNameLower);
                        if (foundKey) {
                            base = leagueDoc.basePoints[foundKey];
                        }
                    }
                    points = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                    basePointsValue = base;
                }

                const displayClub = (p.lastClub && p.lastClub.toLowerCase() === 'black hawks') ? 'Thunder Gaming' : p.lastClub;
                const stats = p.stats || {};

                return {
                    eaPlayerName: p.eaPlayerName,
                    lastClub: displayClub || 'Sin Club',
                    lastPosition: p.manualPosition || p.lastPosition || 'MC',
                    price,
                    points,
                    basePoints: basePointsValue,
                    avgRating: parseFloat(avgRating.toFixed(2)),
                    manualPrice: p.manualPrice || null,
                    manualPosition: p.manualPosition || null,
                    matchesPlayed: stats.matchesPlayed || 0,
                    goals: stats.goals || 0,
                    assists: stats.assists || 0,
                    clubLogo: (p.lastClub ? teamLogoMap[p.lastClub.toLowerCase().trim()] : null) || (displayClub ? teamLogoMap[displayClub.toLowerCase().trim()] : null) || null,
                    avatar: p.avatar || null,
                    nationality: p.nationality || p.user_nationality || null,
                    isNew: !!(p.isNew && p.newUntil && new Date(p.newUntil) > new Date())
                };
            });

            res.json(processed);
        } catch (e) {
            console.error('[API Admin Search Players] Error:', e);
            res.status(500).json({ error: 'Error al buscar jugadores.' });
        }
    });

    // Update manual price for a player
    app.post('/api/fantasy/admin/players/price', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { eaPlayerName, price } = req.body;
            if (!eaPlayerName) {
                return res.status(400).json({ error: 'Nombre de jugador es requerido.' });
            }

            const db = getDb();

            let manualPrice = null;
            if (price !== undefined && price !== null && price !== '') {
                manualPrice = parseInt(price);
                if (isNaN(manualPrice) || manualPrice < 0) {
                    return res.status(400).json({ error: 'Precio no válido.' });
                }
            }

            await db.collection('player_profiles').updateOne(
                { eaPlayerName },
                manualPrice !== null
                    ? { $set: { manualPrice } }
                    : { $unset: { manualPrice: "" } }
            );

            res.json({ success: true, message: `Precio de ${eaPlayerName} actualizado correctamente.` });
        } catch (e) {
            console.error('[API Admin Update Player Price] Error:', e);
            res.status(500).json({ error: 'Error al actualizar precio.' });
        }
    });

    // Update manual position for a player
    app.post('/api/fantasy/admin/players/position', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { eaPlayerName, position } = req.body;
            if (!eaPlayerName) {
                return res.status(400).json({ error: 'Nombre de jugador es requerido.' });
            }

            const db = getDb();

            let manualPosition = null;
            if (position !== undefined && position !== null && position !== '') {
                manualPosition = String(position).toUpperCase().trim();
                const validPositions = ['POR', 'DFC', 'LD', 'LI', 'CARR', 'MC', 'MCD', 'MCO', 'MI', 'MD', 'DC', 'ED', 'EI', 'MP'];
                if (!validPositions.includes(manualPosition)) {
                    return res.status(400).json({ error: 'Posición no válida.' });
                }
            }

            await db.collection('player_profiles').updateOne(
                { eaPlayerName },
                manualPosition !== null
                    ? { $set: { manualPosition } }
                    : { $unset: { manualPosition: "" } }
            );

            res.json({ success: true, message: `Posición de ${eaPlayerName} actualizada correctamente.` });
        } catch (e) {
            console.error('[API Admin Update Player Position] Error:', e);
            res.status(500).json({ error: 'Error al actualizar posición.' });
        }
    });

    // Update manual price and/or position for a player (unified endpoint)
    app.post('/api/fantasy/admin/players/update', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { eaPlayerName, price, position } = req.body;
            if (!eaPlayerName) {
                return res.status(400).json({ error: 'Nombre de jugador es requerido.' });
            }

            const db = getDb();
            const updateDoc = {};
            const unsetDoc = {};

            // 1. Process manualPrice
            if (price !== undefined) {
                if (price === null || price === '') {
                    unsetDoc.manualPrice = "";
                } else {
                    const manualPrice = parseInt(price);
                    if (isNaN(manualPrice) || manualPrice < 0) {
                        return res.status(400).json({ error: 'Precio no válido.' });
                    }
                    updateDoc.manualPrice = manualPrice;
                }
            }

            // 2. Process manualPosition
            if (position !== undefined) {
                if (position === null || position === '') {
                    unsetDoc.manualPosition = "";
                } else {
                    const manualPosition = String(position).toUpperCase().trim();
                    const validPositions = ['POR', 'DFC', 'LD', 'LI', 'CARR', 'MC', 'MCD', 'MCO', 'MI', 'MD', 'DC', 'ED', 'EI', 'MP'];
                    if (!validPositions.includes(manualPosition)) {
                        return res.status(400).json({ error: 'Posición no válida.' });
                    }
                    updateDoc.manualPosition = manualPosition;
                }
            }

            const updateOperations = {};
            if (Object.keys(updateDoc).length > 0) updateOperations.$set = updateDoc;
            if (Object.keys(unsetDoc).length > 0) updateOperations.$unset = unsetDoc;

            if (Object.keys(updateOperations).length > 0) {
                await db.collection('player_profiles').updateOne({ eaPlayerName }, updateOperations);
            }

            res.json({ success: true, message: `Configuración de ${eaPlayerName} actualizada correctamente.` });
        } catch (e) {
            console.error('[API Admin Update Player Unified] Error:', e);
            res.status(500).json({ error: 'Error al actualizar jugador.' });
        }
    });

    // Exclude/Delete player permanently
    app.delete('/api/fantasy/admin/players/:playerName/exclude', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { playerName } = req.params;
            const db = getDb();

            // 1. Mark player as excluded and unset vpgLeagueSlug
            const result = await db.collection('player_profiles').updateOne(
                { eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                { 
                    $set: { excluded: true },
                    $unset: { vpgLeagueSlug: "" }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Jugador no encontrado.' });
            }

            // 2. Remove player from all teams' players lists and lineups
            const affectedTeams = await db.collection('fantasy_teams').find({
                players: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            }).toArray();

            for (const team of affectedTeams) {
                const exactName = team.players.find(p => p.toLowerCase() === playerName.toLowerCase()) || playerName;
                const updatedLineup = { ...team.lineup };
                for (const pos in updatedLineup) {
                    if (Array.isArray(updatedLineup[pos])) {
                        updatedLineup[pos] = updatedLineup[pos].filter(p => p.toLowerCase() !== playerName.toLowerCase());
                    } else if (updatedLineup[pos] && updatedLineup[pos].toLowerCase() === playerName.toLowerCase()) {
                        updatedLineup[pos] = null;
                    }
                }
                
                await db.collection('fantasy_teams').updateOne(
                    { _id: team._id },
                    {
                        $pull: { players: exactName },
                        $set: { lineup: updatedLineup },
                        $unset: { 
                            [`clauses.${exactName}`]: "",
                            [`clausesProtectedUntil.${exactName}`]: ""
                        }
                    }
                );
            }

            // 3. Remove player from all market listings
            await db.collection('fantasy_market_listings').deleteMany({
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });

            // 4. Refund and remove all pending bids for the player
            const pendingBids = await db.collection('fantasy_market_bids').find({ 
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') },
                status: 'pending'
            }).toArray();

            for (const bid of pendingBids) {
                if (bid.bidderDiscordId !== 'liga') {
                    await db.collection('fantasy_teams').updateOne(
                        { discordId: bid.bidderDiscordId, leagueId: bid.leagueId },
                        { $inc: { balance: Math.round(bid.bidAmount) } }
                    );
                }
            }
            await db.collection('fantasy_market_bids').deleteMany({
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });

            // 5. Pull player from all leagues' marketFreeAgents
            await db.collection('fantasy_leagues').updateMany(
                {},
                { $pull: { marketFreeAgents: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } } }
            );

            res.json({ success: true, message: `El jugador ${playerName} ha sido excluido y eliminado globalmente.` });
        } catch (e) {
            console.error('[API Admin Exclude Player] Error:', e);
            res.status(500).json({ error: 'Error al excluir al jugador.' });
        }
    });

    // Replace/Merge player (playerName = new crawled name, targetName = old existing name)
    app.post('/api/fantasy/admin/players/:playerName/replace', isAuthenticated, isFantasyAdmin, async (req, res) => {
        try {
            const { playerName } = req.params; // new name
            const { targetName } = req.body; // old name
            if (!targetName) {
                return res.status(400).json({ error: 'El nombre del jugador a sustituir (antiguo) es requerido.' });
            }

            const db = getDb();

            // 1. Find old player profile
            const oldPlayer = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + targetName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            if (!oldPlayer) {
                return res.status(404).json({ error: `Jugador antiguo "${targetName}" no encontrado.` });
            }

            // 2. Find new player profile (if exists)
            const newPlayer = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });

            const oldPlayerNameExact = oldPlayer.eaPlayerName;
            const newPlayerNameExact = newPlayer ? newPlayer.eaPlayerName : playerName;

            // 3. Update old profile with new name and new stats, then delete new profile
            const updateDoc = {
                eaPlayerName: newPlayerNameExact
            };
            if (newPlayer) {
                if (newPlayer.stats) updateDoc.stats = newPlayer.stats;
                if (newPlayer.vpgLeagueSlug) updateDoc.vpgLeagueSlug = newPlayer.vpgLeagueSlug;
                if (newPlayer.lastPosition) updateDoc.lastPosition = newPlayer.lastPosition;
                if (newPlayer.lastClub) updateDoc.lastClub = newPlayer.lastClub;
                if (newPlayer.avatar) updateDoc.avatar = newPlayer.avatar;
                if (newPlayer.nationality) updateDoc.nationality = newPlayer.nationality;
                if (newPlayer.isNew !== undefined) updateDoc.isNew = newPlayer.isNew;
                if (newPlayer.newUntil) updateDoc.newUntil = newPlayer.newUntil;
            }

            await db.collection('player_profiles').updateOne({ _id: oldPlayer._id }, { $set: updateDoc });

            if (newPlayer) {
                await db.collection('player_profiles').deleteOne({ _id: newPlayer._id });
            }

            // 4. Replace name in all fantasy teams
            const affectedTeams = await db.collection('fantasy_teams').find({
                players: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            }).toArray();

            for (const team of affectedTeams) {
                const updatedPlayers = team.players.map(p => {
                    if (p.toLowerCase() === oldPlayerNameExact.toLowerCase()) {
                        return newPlayerNameExact;
                    }
                    return p;
                });

                const updatedLineup = { ...team.lineup };
                for (const pos in updatedLineup) {
                    if (Array.isArray(updatedLineup[pos])) {
                        updatedLineup[pos] = updatedLineup[pos].map(p => {
                            if (p && p.toLowerCase() === oldPlayerNameExact.toLowerCase()) {
                                return newPlayerNameExact;
                            }
                            return p;
                        });
                    } else if (updatedLineup[pos] && updatedLineup[pos].toLowerCase() === oldPlayerNameExact.toLowerCase()) {
                        updatedLineup[pos] = newPlayerNameExact;
                    }
                }

                const updatedClauses = { ...team.clauses || {} };
                const updatedClausesProtected = { ...team.clausesProtectedUntil || {} };
                
                const clauseKey = Object.keys(updatedClauses).find(k => k.toLowerCase() === oldPlayerNameExact.toLowerCase());
                if (clauseKey) {
                    updatedClauses[newPlayerNameExact] = updatedClauses[clauseKey];
                    delete updatedClauses[clauseKey];
                }
                const protectKey = Object.keys(updatedClausesProtected).find(k => k.toLowerCase() === oldPlayerNameExact.toLowerCase());
                if (protectKey) {
                    updatedClausesProtected[newPlayerNameExact] = updatedClausesProtected[protectKey];
                    delete updatedClausesProtected[protectKey];
                }

                await db.collection('fantasy_teams').updateOne(
                    { _id: team._id },
                    {
                        $set: {
                            players: updatedPlayers,
                            lineup: updatedLineup,
                            clauses: updatedClauses,
                            clausesProtectedUntil: updatedClausesProtected
                        }
                    }
                );
            }

            // 5. Replace name in market listings and bids
            await db.collection('fantasy_market_listings').updateMany(
                { eaPlayerName: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                { $set: { eaPlayerName: newPlayerNameExact } }
            );

            await db.collection('fantasy_market_bids').updateMany(
                { eaPlayerName: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                { $set: { eaPlayerName: newPlayerNameExact } }
            );

            // 6. Replace name in fantasy leagues' marketFreeAgents and basePoints (for ZERO mode)
            const affectedLeagues = await db.collection('fantasy_leagues').find({
                $or: [
                    { marketFreeAgents: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                    { [`basePoints.${oldPlayerNameExact}`]: { $exists: true } }
                ]
            }).toArray();

            for (const league of affectedLeagues) {
                const updateOps = {};
                
                if (Array.isArray(league.marketFreeAgents)) {
                    updateOps.marketFreeAgents = league.marketFreeAgents.map(p => {
                        if (p.toLowerCase() === oldPlayerNameExact.toLowerCase()) {
                            return newPlayerNameExact;
                        }
                        return p;
                    });
                }
                
                if (league.basePoints) {
                    const updatedBasePoints = { ...league.basePoints };
                    const baseKey = Object.keys(updatedBasePoints).find(k => k.toLowerCase() === oldPlayerNameExact.toLowerCase());
                    if (baseKey) {
                        updatedBasePoints[newPlayerNameExact] = updatedBasePoints[baseKey];
                        delete updatedBasePoints[baseKey];
                        updateOps.basePoints = updatedBasePoints;
                    }
                }

                await db.collection('fantasy_leagues').updateOne(
                    { _id: league._id },
                    { $set: updateOps }
                );
            }

            // 7. Recalculate points for affected teams using updated league and player data
            for (const team of affectedTeams) {
                try {
                    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
                    let totalPoints = 0;
                    // Fetch updated team doc to get the new players list
                    const teamDoc = await db.collection('fantasy_teams').findOne({ _id: team._id });
                    if (teamDoc) {
                        for (const playerName of (teamDoc.players || [])) {
                            let player = await db.collection('player_profiles').findOne({ eaPlayerName: playerName });
                            if (!player) {
                                player = await db.collection('player_profiles').findOne({
                                    eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                                });
                            }
                            if (player) {
                                const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                                let playerPoints = rawPoints;
                                if (league && league.pointsMode === 'zero' && league.basePoints) {
                                    let base = league.basePoints[player.eaPlayerName] || 0;
                                    if (league.basePoints[player.eaPlayerName] === undefined) {
                                        const playerNameLower = player.eaPlayerName.toLowerCase();
                                        const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === playerNameLower);
                                        if (foundKey) {
                                            base = league.basePoints[foundKey];
                                        }
                                    }
                                    playerPoints = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                                }
                                totalPoints += playerPoints;
                            }
                        }
                        totalPoints = Math.round(totalPoints * 10) / 10;
                        await db.collection('fantasy_teams').updateOne({ _id: team._id }, { $set: { points: totalPoints } });
                    }
                } catch (recErr) {
                    console.error(`[API Replace Player] Error recalculating points for team ${team._id}:`, recErr);
                }
            }

            res.json({ success: true, message: `Sustitución completada. Se ha renombrado globalmente a ${oldPlayerNameExact} por ${newPlayerNameExact}.` });
        } catch (e) {
            console.error('[API Admin Replace Player] Error:', e);
            res.status(500).json({ error: 'Error al realizar la sustitución.' });
        }
    });

    // ============================================================
    // REBUILD STATS - Sync stats with VPG public tables & leaderboards
    // ============================================================

    // GET rebuild status
    app.get('/api/fantasy/admin/rebuild-stats/status', isAuthenticated, isOwner, (req, res) => {
        res.json(rebuildStatus);
    });

    // POST trigger rebuild
    app.post('/api/fantasy/admin/rebuild-stats', isAuthenticated, isOwner, async (req, res) => {
        if (rebuildStatus.running) {
            return res.status(409).json({ error: 'Ya hay una sincronización/reconstrucción en curso.', progress: rebuildStatus.progress });
        }

        // Run in background
        syncFantasyWithVpg().catch(err => {
            console.error('[REBUILD API] Error en la sincronización con VPG:', err);
        });

        res.json({ success: true, message: 'Sincronización con VPG iniciada en segundo plano.' });
    });

    // Reset base points (only points) for all active ZERO leagues at once (owner only)
    app.post('/api/fantasy/admin/reset-all-zero-points', isAuthenticated, isOwner, async (req, res) => {
        try {
            const db = getDb();
            const leagues = await db.collection('fantasy_leagues').find({ 
                pointsMode: 'zero', 
                status: { $ne: 'closed' } 
            }).toArray();

            if (leagues.length === 0) {
                return res.json({ success: true, message: 'No hay ligas activas en modo ZERO para resetear.' });
            }

            // Fetch current VPG points for all players
            const players = await db.collection('player_profiles').find({ "stats.vpgPoints": { $exists: true } }).toArray();
            const newBasePoints = {};
            for (const p of players) {
                if (p.eaPlayerName) {
                    newBasePoints[p.eaPlayerName] = p.stats.vpgPoints || 0;
                }
            }

            let leaguesUpdated = 0;
            let teamsUpdated = 0;

            for (const league of leagues) {
                // Update basePoints map for the league
                await db.collection('fantasy_leagues').updateOne(
                    { _id: league._id },
                    { $set: { basePoints: newBasePoints } }
                );
                leaguesUpdated++;

                // Reset all teams' points to 0 in this league
                const teams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
                for (const team of teams) {
                    await db.collection('fantasy_teams').updateOne({ _id: team._id }, { $set: { points: 0 } });
                    teamsUpdated++;
                }
            }

            res.json({ 
                success: true, 
                message: `Se han reseteado los puntos iniciales a 0 en ${leaguesUpdated} ligas y restablecido los puntos de ${teamsUpdated} equipos.` 
            });
        } catch (e) {
            console.error('[API Admin Reset All Zero Points] Error:', e);
            res.status(500).json({ error: 'Error al resetear los puntos iniciales de las ligas.' });
        }
    });

    // === 404 Catch-all: Must be AFTER all routes ===
    app.use((req, res) => {
        // Return JSON for API routes, HTML for everything else
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        res.status(404).sendFile('404.html', { root: 'public' });
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
