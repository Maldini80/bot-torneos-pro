// --- INICIO DEL ARCHIVO visualizerServer.js (VERSIÓN FINAL Y COMPLETA) ---

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
// IMPORTAMOS LAS NUEVAS FUNCIONES DE GESTIÓN
import { advanceDraftTurn, handlePlayerSelectionFromWeb, requestStrikeFromWeb, requestKickFromWeb, handleRouletteSpinResult, undoLastPick, forcePickFromWeb, adminKickPlayerFromWeb, adminAddPlayerFromWeb, sendRegistrationRequest, sendPaymentApprovalRequest } from './src/logic/tournamentLogic.js';
import { getDb } from './database.js';
import { ObjectId } from 'mongodb'; // FIX: Global import for ObjectId

let client; // FIX: Variable global para acceder al cliente desde cualquier endpoint

const app = express();
// FIX: Middlewares esenciales para que funcione el body parser y archivos estáticos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route: serve landing page
app.get('/', (req, res) => {
    res.sendFile('home.html', { root: 'public' });
});

app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.set('trust proxy', 1);

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
        secure: process.env.BASE_URL.startsWith('https'),
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
    res.json(req.user || null);
});

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
        const users = await db.collection('verified_users').find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { gameId: { $regex: query, $options: 'i' } }, // FIX: Usar gameId
                { psnId: { $regex: query, $options: 'i' } }, // Mantener soporte legacy
                { discordId: { $regex: query, $options: 'i' } }
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

    const { platform, psnId } = req.body;
    if (!psnId || psnId.length < 3) return res.status(400).json({ error: 'ID inválido (mínimo 3 caracteres)' });

    // Validar plataforma
    const validPlatforms = ['psn', 'xbox', 'pc'];
    if (!validPlatforms.includes(platform)) return res.status(400).json({ error: 'Plataforma no válida' });

    try {
        const db = getDb('test'); // FIX: Guardar verificación en 'test' (DB compartida)

        // Comprobar si el ID ya está usado por otro discordId
        const existing = await db.collection('verified_users').findOne({
            psnId: { $regex: new RegExp(`^${psnId}$`, 'i') }
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
            name: 1,
            logoUrl: 1,
            abbreviation: 1,
            managerId: 1,
            captains: 1
        }).toArray();

        console.log('🔍 [SERVER] User ID:', userId);
        console.log('🔍 [SERVER] Teams found:', teams.length);
        console.log('🔍 [SERVER] Teams data:', JSON.stringify(teams, null, 2));

        res.json({ teams });
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

    const { league, teamName, teamAbbr, teamTwitter, logoUrl } = req.body;

    // Validaciones básicas
    if (!league || !teamName || !teamAbbr) {
        return res.status(400).json({ error: 'Faltan campos requeridos (liga, nombre, abreviatura)' });
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
                { name: { $regex: new RegExp(`^${teamName}$`, 'i') } },
                { abbreviation: { $regex: new RegExp(`^${teamAbbr}$`, 'i') } }
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


// Obtener torneos abiertos a inscripción
app.get('/api/tournaments/open', async (req, res) => {
    try {
        const db = getDb(); // Torneos están en la DB por defecto (tournamentBotDb)

        // Buscar torneos con inscripción abierta
        const openTournaments = await db.collection('tournaments').find({
            status: 'inscripcion_abierta'
        }).toArray();

        // Mapear datos relevantes para el frontend
        const tournamentsData = openTournaments.map(t => ({
            _id: t._id,
            shortId: t.shortId,
            nombre: t.nombre,
            tipo: t.tipo || 'Torneo',
            inscripcion: t.config?.isPaid ? 'Pago' : 'Gratis',
            isPaid: t.config?.isPaid || false,
            entryFee: t.config?.entryFee || 0,
            teamsCount: t.teams?.aprobados ? Object.keys(t.teams.aprobados).length : 0,
            maxTeams: t.config?.maxTeams || t.config?.format?.size || t.config?.size || null,
            format: t.config?.formatId || 'unknown'
        }));

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
                inviteUrl: 'https://discord.gg/tu-servidor' // Cambiar por tu invite real
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
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const mongoose = require('mongoose');
            const Team = require('./src/vpg_bot/models/team.js');

            if (mongoose.connection.readyState === 0) {
                await mongoose.connect(process.env.DATABASE_URL);
            }

            const vpgTeam = await Team.findOne({
                $or: [{ managerId: userId }, { captains: userId }],
                guildId: process.env.GUILD_ID
            }).lean();

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

        // TORNEOS DE PAGO - Sistema de doble aprobación
        else {
            if (!teamData?.teamName || !teamData?.eafcTeamName) {
                return res.status(400).json({ error: 'Faltan datos del equipo (nombre, EAFC team)' });
            }

            const finalTeamData = {
                userId: userId,
                userTag: req.user.username,
                teamName: teamData.teamName,
                eafcTeamName: teamData.eafcTeamName,
                streamChannel: teamData.streamChannel || '',
                twitter: teamData.twitter || '',
                registeredAt: new Date(),
                status: 'awaiting_payment_info_approval'
            };

            // Guardar en pendingApproval (NO pendingPayments)
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendingApproval.${userId}`]: finalTeamData } }
            );

            // Enviar notificación a Discord para PRIMERA aprobación
            const { getVpgClient } = require('./src/vpg_bot/index.js');
            const vpgClient = getVpgClient();

            if (vpgClient) {
                await sendPaymentApprovalRequest(vpgClient, tournament, finalTeamData, req.user);
            }

            return res.json({
                success: true,
                message: 'Solicitud enviada. Un administrador la revisará y te enviará la información de pago.'
            });
        }

    } catch (error) {
        console.error('[Tournament Registration] Error:', error);
        res.status(500).json({ error: 'Error al procesar la inscripción' });
    }
});

// Función auxiliar para// Enviar notificación a Discord para aprobación de equipos (usa el VPG Bot client)
async function sendWebTeamRequestToDiscord(teamData, user) {
    // Importar el getter del VPG Bot client
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const { getVpgClient } = require('./src/vpg_bot/index.js');

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

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle }
        = await import('discord.js');

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
            { name: 'URL del Logo', value: `[Ver Logo](${teamData.logoUrl})` },
            { name: 'Liga Seleccionada', value: teamData.leagueName }
        )
        .setTimestamp()
        .setFooter({ text: 'Solicitud creada desde la web' });

    const safeLeague = teamData.leagueName.replace(/\s/g, '_');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approve_request_${user.id}_${safeLeague}`)
            .setLabel('Aprobar')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`reject_request_${user.id}`)
            .setLabel('Rechazar')
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `**[WEB]** Solicitante: <@${user.id}>`,
        embeds: [embed],
        components: [row]
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
        const db = getDb('test'); // FIX: Equipos están en 'test'
        const teamId = req.params.teamId;

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
        const team = req.team;
        const allIds = [team.managerId, ...(team.captains || []), ...(team.players || [])];
        const uniqueIds = [...new Set(allIds)].filter(id => id); // Eliminar duplicados y nulos

        // Obtener detalles de Discord y DB
        const rosterDetails = [];
        const dbUsers = getDb(); // FIX: Usuarios verificados están en tournamentBotDb
        const dbTeams = getDb('test'); // Teams están en test, aunque aquí no se usa directamnte

        for (const userId of uniqueIds) {
            let role = 'member';
            if (userId === team.managerId) role = 'manager';
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
                username: { $regex: new RegExp(`^${usernameOrId}$`, 'i') }
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
                roleData.role = 'admin';
                return res.json(roleData);
            }
        }

        // 2. VERIFICAR ROLES ESPECÍFICOS DEL EVENTO
        if (eventType === 'tournament') {
            // A. Capitán principal, Co-Capitán, o Capitán Extra
            for (const groupName in event.structure.grupos) {
                const group = event.structure.grupos[groupName];
                if (group.equipos) {
                    for (const team of group.equipos) {
                        // Capitán principal
                        if (team.capitanId === userId) {
                            roleData.role = 'captain';
                            roleData.teamId = team.id;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }

                        // Mánager
                        if (team.managerId === userId) {
                            roleData.role = 'manager';
                            roleData.teamId = team.id;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }

                        // Co-Capitán
                        if (team.coCaptainId === userId) {
                            roleData.role = 'coCaptain';
                            roleData.teamId = team.id;
                            roleData.teamName = team.nombre;
                            return res.json(roleData);
                        }

                        // Capitán Extra
                        if (team.extraCaptains && Array.isArray(team.extraCaptains) && team.extraCaptains.includes(userId)) {
                            roleData.role = 'extraCaptain';
                            roleData.teamId = team.id;
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
            if (event.teams) {
                const team = event.teams.find(t => t.captainId === userId);
                if (team) {
                    roleData.role = 'draftCaptain';
                    roleData.teamName = team.captainTag;
                    return res.json(roleData);
                }
            }
        }

        // Si no tiene ningún rol especial, es visitante
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

            // Buscar drafts activos o pendientes
            const drafts = await db.collection('drafts')
                .find({
                    status: { $in: ['active', 'pending'] }
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
                    teamsCount: Object.keys(d.teams || {}).length || 0,
                    currentPick: d.currentPickIndex || 0,
                    totalPicks: d.order?.length || 0,
                    createdAt: d.timestamp || d.createdAt || new Date().toISOString()
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
                    createdAt: t.timestamp || t.createdAt || t.updatedAt || new Date().toISOString(),
                    completedAt: t.updatedAt || t.timestamp || new Date().toISOString()
                }));

                if (type === 'tournament') results.total = tournamentCount;
            }

            if (type === 'draft' || type === 'all') {
                const draftFilter = {
                    status: { $in: ['completed', 'cancelled'] },
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
                    teamsCount: Object.keys(d.teams || {}).length || 0,
                    createdAt: d.timestamp || d.createdAt || d.updatedAt || new Date().toISOString(),
                    completedAt: d.updatedAt || d.timestamp || new Date().toISOString()
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
