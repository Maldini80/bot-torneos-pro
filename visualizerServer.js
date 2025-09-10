// --- INICIO DEL ARCHIVO visualizerServer.js (VERSIÓN FINAL Y COMPLETA) ---

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
// IMPORTAMOS LAS NUEVAS FUNCIONES DE GESTIÓN
import { advanceDraftTurn, handlePlayerSelectionFromWeb, requestStrikeFromWeb, requestKickFromWeb } from './src/logic/tournamentLogic.js';
import { getDb } from './database.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const draftStates = new Map();
const tournamentStates = new Map();

function broadcastUpdate(type, id, data) {
    const payload = JSON.stringify({ type, id, data });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(payload);
    });
}

function sendToUser(userId, payload) {
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

const sessionParser = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.BASE_URL.startsWith('https') }
});
app.use(sessionParser);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/callback`,
    scope: ['identify', 'connections']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

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
        res.redirect('/');
    });
});

app.get('/api/user', (req, res) => {
    res.json(req.user || null);
});
app.get('/api/player-details/:draftId/:playerId', async (req, res) => {
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

        const isCaptainInThisDraft = draft.captains.some(c => c.userId === req.user.id);
        if (!isCaptainInThisDraft) {
             return res.status(403).send({ error: 'No tienes permiso para ver los detalles de este draft.' });
        }

        const verifiedData = await db.collection('verified_users').findOne({ discordId: playerId });
        const playerRecord = await db.collection('player_records').findOne({ userId: playerId });
        const draftPlayerData = draft.players.find(p => p.userId === playerId);

        if (!verifiedData || !draftPlayerData) {
            return res.status(404).send({ error: 'No se encontraron todos los datos para este jugador.' });
        }

        const responseData = {
            psnId: verifiedData.gameId,
            discordTag: verifiedData.discordTag,
            primaryPosition: draftPlayerData.primaryPosition,
            secondaryPosition: draftPlayerData.secondaryPosition,
            whatsapp: verifiedData.whatsapp || 'No Proporcionado',
            twitter: verifiedData.twitter || 'No Proporcionado',
            strikes: playerRecord ? playerRecord.strikes : 0
        };

        res.json(responseData);

    } catch (error) {
        console.error(`[API Player Details Error]: ${error.message}`);
        res.status(500).send({ error: 'Error interno del servidor.' });
    }
});

export async function startVisualizerServer(client) {
    app.use(express.json());
    app.use(express.static('public'));

    app.get('/draft-data/:draftId', (req, res) => {
        const data = draftStates.get(req.params.draftId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Draft data not found' });
    });
    
    app.get('/tournament-data/:tournamentId', (req, res) => {
        const data = tournamentStates.get(req.params.tournamentId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Tournament data not found' });
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
                if (!ws.user) return;

                const captainId = ws.user.id;
                const { draftId, playerId, reason, position } = data;

                switch (data.type) {
                    case 'execute_draft_pick':
                        await handlePlayerSelectionFromWeb(client, draftId, captainId, playerId, position);
                        await advanceDraftTurn(client, draftId);
                        break;
                    
                    case 'report_player':
                        await requestStrikeFromWeb(client, draftId, captainId, playerId, reason);
                        break;

                    case 'request_kick':
                        await requestKickFromWeb(client, draftId, captainId, playerId, reason);
                        break;
                }
            } catch (e) { console.error('Error procesando mensaje de WebSocket:', e); }
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
