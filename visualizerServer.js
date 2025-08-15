// visualizerServer.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
// ... (todos los demás imports se mantienen igual)
import { exec } from 'child_process';
import fetch from 'node-fetch';
import { platform, arch } from 'os';
import { createWriteStream, createReadStream } from 'fs';
import fs from 'fs-extra';
const { chmod, existsSync } = fs;
import { join } from 'path';
import unzipper from 'unzipper';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
let draftStates = new Map();
let tournamentStates = new Map(); // <-- NUEVO: Para guardar estados de torneos

let ngrokProcess;
const ngrokPath = join(process.cwd(), platform() === 'win2' ? 'ngrok.exe' : 'ngrok');

// ... (las funciones downloadNgrok y startNgrokTunnel no cambian)
async function downloadNgrok() { /* ...código sin cambios... */ }
function startNgrokTunnel() { /* ...código sin cambios... */ }

export async function startVisualizerServer() {
    app.use(express.json());
    app.use(express.static('public'));

    // --- ENDPOINTS PARA DRAFTS (EXISTENTES) ---
    app.post('/update-draft/:draftId', (req, res) => {
        const { draftId } = req.params;
        const draftData = req.body;
        draftStates.set(draftId, draftData);
        broadcastUpdate('draft', draftId, draftData); // Añadimos un tipo
        console.log(`[Visualizer] Estado de DRAFT actualizado para: ${draftId}`);
        res.status(200).send({ message: 'Update received' });
    });

    app.get('/draft-data/:draftId', (req, res) => {
        const { draftId } = req.params;
        const data = draftStates.get(draftId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Draft data not found' });
    });

    // --- NUEVOS ENDPOINTS PARA TORNEOS ---
    app.post('/update-tournament/:tournamentId', (req, res) => {
        const { tournamentId } = req.params;
        const tournamentData = req.body;
        tournamentStates.set(tournamentId, tournamentData);
        broadcastUpdate('tournament', tournamentId, tournamentData); // Añadimos un tipo
        console.log(`[Visualizer] Estado de TORNEO actualizado para: ${tournamentId}`);
        res.status(200).send({ message: 'Update received' });
    });

    app.get('/tournament-data/:tournamentId', (req, res) => {
        const { tournamentId } = req.params;
        const data = tournamentStates.get(tournamentId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Tournament data not found' });
    });

    // ... (el resto de la función y broadcastUpdate se adaptan)
    wss.on('connection', ws => console.log('[Visualizer] Caster conectado.'));
    server.listen(PORT, async () => { /* ...código sin cambios... */ });
}

function broadcastUpdate(type, id, data) {
    const payload = JSON.stringify({ type, id, data }); // Enviamos el tipo
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(payload);
    });
}

function gracefulShutdown() { /* ...código sin cambios... */ }
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
