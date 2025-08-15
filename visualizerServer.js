// visualizerServer.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
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
let tournamentStates = new Map();

let ngrokProcess;
const ngrokPath = join(process.cwd(), platform() === 'win32' ? 'ngrok.exe' : 'ngrok');

// --- INICIO DE LA LÓGICA DE GESTIÓN DE NGROK ---
async function downloadNgrok() {
    if (existsSync(ngrokPath)) {
        console.log('[ngrok-manager] El agente ngrok ya existe.');
        return;
    }

    const plat = platform();
    const architecture = arch();
    let url;

    if (plat === 'linux' && architecture === 'x64') {
        url = 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.zip';
    } else {
        console.error(`[ngrok-manager] Plataforma no soportada para descarga automática: ${plat} ${architecture}`);
        return;
    }

    console.log(`[ngrok-manager] Descargando el agente ngrok desde ${url}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error al descargar ngrok: ${response.statusText}`);
    
    const zipPath = join(process.cwd(), 'ngrok.zip');
    const fileStream = createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
    });

    await createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: process.cwd() }))
        .promise();
    
    console.log('[ngrok-manager] Agente ngrok extraído.');

    if (platform() !== 'win32') {
        await chmod(ngrokPath, 0o755);
        console.log('[ngrok-manager] Permisos de ejecución establecidos para ngrok.');
    }
}

function startNgrokTunnel() {
    if (!process.env.NGROK_AUTHTOKEN || !process.env.NGROK_STATIC_DOMAIN) {
        console.warn('[ngrok-manager] Faltan las variables de entorno de ngrok. El túnel no se iniciará.');
        return;
    }
    
    console.log('[ngrok-manager] Intentando iniciar el túnel de ngrok...');
    const command = `${ngrokPath} http ${PORT} --authtoken ${process.env.NGROK_AUTHTOKEN} --domain ${process.env.NGROK_STATIC_DOMAIN} --log=stdout`;
    
    ngrokProcess = exec(command);

    ngrokProcess.stdout.on('data', (data) => {
        const logLine = data.toString();
        console.log(`[ngrok-stdout] ${logLine}`);
        if (logLine.includes('started tunnel')) {
             console.log(`[ngrok-manager] ¡CONFIRMADO! El túnel está online y listo.`);
        }
    });

    ngrokProcess.stderr.on('data', (data) => {
        console.error(`[ngrok-stderr] ${data.toString()}`);
    });

    ngrokProcess.on('close', (code) => {
        console.warn(`[ngrok-manager] El proceso de ngrok se ha cerrado inesperadamente con código: ${code}`);
    });

    ngrokProcess.on('error', (err) => {
        console.error('[ngrok-manager] Error al ejecutar el proceso de ngrok:', err);
    });
}
// --- FIN DE LA LÓGICA DE GESTIÓN DE NGROK ---

export async function startVisualizerServer() {
    app.use(express.json());
    app.use(express.static('public'));

    // Endpoints para drafts
    app.post('/update-draft/:draftId', (req, res) => {
        const { draftId } = req.params;
        const draftData = req.body;
        draftStates.set(draftId, draftData);
        broadcastUpdate('draft', draftId, draftData);
        console.log(`[Visualizer] Estado de DRAFT actualizado para: ${draftId}`);
        res.status(200).send({ message: 'Update received' });
    });

    app.get('/draft-data/:draftId', (req, res) => {
        const { draftId } = req.params;
        const data = draftStates.get(draftId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Draft data not found' });
    });

    // Endpoints para torneos
    app.post('/update-tournament/:tournamentId', (req, res) => {
        const { tournamentId } = req.params;
        const tournamentData = req.body;
        tournamentStates.set(tournamentId, tournamentData);
        broadcastUpdate('tournament', tournamentId, tournamentData);
        console.log(`[Visualizer] Estado de TORNEO actualizado para: ${tournamentId}`);
        res.status(200).send({ message: 'Update received' });
    });

    app.get('/tournament-data/:tournamentId', (req, res) => {
        const { tournamentId } = req.params;
        const data = tournamentStates.get(tournamentId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Tournament data not found' });
    });

    wss.on('connection', ws => console.log('[Visualizer] Caster conectado.'));
    
    server.listen(PORT, async () => {
        console.log(`[Visualizer] Servidor interno escuchando en ${PORT}`);
        try {
            await downloadNgrok();
            startNgrokTunnel();
        } catch (error) {
            console.error('[ngrok-manager] Fallo crítico en el proceso de inicio de ngrok:', error);
        }
    });
}

function broadcastUpdate(type, id, data) {
    const payload = JSON.stringify({ type, id, data });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(payload);
    });
}

function gracefulShutdown() {
  console.log('[Shutdown] Recibida señal de apagado. Cerrando el túnel de ngrok...');
  if (ngrokProcess) {
    ngrokProcess.kill('SIGINT');
  }
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
