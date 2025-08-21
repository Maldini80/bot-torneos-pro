// visualizerServer.js (VERSIÓN FINAL CON LOGIN CORREGIDO)
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

// --- ESTADO CENTRALIZADO (SIN CAMBIOS) ---
const draftStates = new Map();
const tournamentStates = new Map();

function broadcastUpdate(type, id, data) {
    const payload = JSON.stringify({ type, id, data });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(payload);
    });
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
    }
};

// --- LÓGICA DE AUTENTICACIÓN Y SESIONES ---
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
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

app.use(passport.initialize());
app.use(passport.session());

// --- RUTAS DE LOGIN Y CALLBACK (CORREGIDAS) ---
app.get('/login', (req, res, next) => {
    // Codificamos la URL de retorno en el parámetro 'state'
    const returnTo = Buffer.from(req.query.returnTo || '/').toString('base64');
    passport.authenticate('discord', { state: returnTo })(req, res, next);
});

app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    // Decodificamos la URL guardada en 'state' y redirigimos
    const returnTo = Buffer.from(req.query.state, 'base64').toString('utf8');
    res.redirect(returnTo || '/');
});
// --- FIN DE LAS RUTAS CORREGIDAS ---

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

app.get('/api/user', (req, res) => {
    res.json(req.user || null);
});

export async function startVisualizerServer(client, advanceDraftTurn, handlePlayerSelectionFromWeb) {
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
                if (request.session.passport && request.session.passport.user) {
                    ws.user = request.session.passport.user;
                }
                wss.emit('connection', ws, request);
            });
        });
    });

    wss.on('connection', (ws, req) => {
        if (ws.user) {
            console.log(`[Visualizer] Usuario autenticado conectado: ${ws.user.username}`);
        } else {
            console.log('[Visualizer] Espectador conectado.');
        }

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'execute_draft_pick' && ws.user) {
                    const userId = ws.user.id;
                    const { draftId, playerId, position } = data;
                    try {
                        await handlePlayerSelectionFromWeb(client, draftId, userId, playerId, position);
                        await advanceDraftTurn(client, draftId);
                    } catch (error) {
                        console.error(`[PICK WEB] Fallo en el pick desde la web: ${error.message}`);
                    }
                }
            } catch (e) {
                console.error('Error procesando mensaje de WebSocket:', e);
            }
        });
    });

    server.listen(PORT, () => {
        console.log(`[Visualizer] Servidor escuchando en ${PORT}`);
    });
}

function gracefulShutdown() {
    console.log('[Shutdown] Recibida señal de apagado. El servicio se detendrá.');
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
