// visualizerServer.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import { platform, arch } from 'os';
import { createWriteStream } from 'fs';
import fs from 'fs-extra';
const { chmod, existsSync } = fs;
import { join } from 'path';
import unzipper from 'unzipper';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
let draftStates = new Map();

// --- NUEVA LÓGICA PARA GESTIONAR EL AGENTE NGROK MANUALMENTE ---
const ngrokPath = join(process.cwd(), platform() === 'win32' ? 'ngrok.exe' : 'ngrok');

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
        // Añadir URLs para otras plataformas si es necesario (ej. Mac, Windows)
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
        await chmod(ngrokPath, 0o755); // Dar permisos de ejecución
        console.log('[ngrok-manager] Permisos de ejecución establecidos para ngrok.');
    }
}

function startNgrokTunnel() {
    if (!process.env.NGROK_AUTHTOKEN || !process.env.NGROK_STATIC_DOMAIN) {
        console.warn('[ngrok-manager] No se han proporcionado las variables de entorno de ngrok. El túnel no se iniciará.');
        return;
    }
    
    const command = `${ngrokPath} http ${PORT} --authtoken ${process.env.NGROK_AUTHTOKEN} --domain ${process.env.NGROK_STATIC_DOMAIN}`;
    
    const ngrokProcess = exec(command);

    ngrokProcess.stdout.on('data', (data) => {
        console.log(`[ngrok-agent]: ${data}`);
    });

    ngrokProcess.stderr.on('data', (data) => {
        if (data.includes('url=')) {
             console.log(`[ngrok-manager] Túnel establecido. El visualizador está disponible públicamente.`);
        } else {
             console.error(`[ngrok-agent-error]: ${data}`);
        }
    });

    ngrokProcess.on('close', (code) => {
        console.warn(`[ngrok-manager] El proceso de ngrok se ha cerrado con código: ${code}`);
    });
}
// --- FIN DE LA NUEVA LÓGICA ---


export async function startVisualizerServer() {
    app.use(express.json());
    app.use(express.static('public'));

    // ... (los endpoints app.post y app.get se mantienen igual que antes) ...
    app.post('/update-draft/:draftId', (req, res) => {
        const { draftId } = req.params;
        const draftData = req.body;
        draftStates.set(draftId, draftData);
        broadcastUpdate(draftId, draftData);
        console.log(`[Visualizer] Estado actualizado para el draft: ${draftId}`);
        res.status(200).send({ message: 'Update received' });
    });

    app.get('/draft-data/:draftId', (req, res) => {
        const { draftId } = req.params;
        const data = draftStates.get(draftId);
        if (data) res.json(data);
        else res.status(404).send({ error: 'Draft data not found' });
    });


    wss.on('connection', ws => {
        console.log('[Visualizer] Nuevo caster conectado a la web.');
        ws.on('close', () => console.log('[Visualizer] Caster desconectado.'));
    });

    server.listen(PORT, async () => {
        console.log(`[Visualizer] Servidor interno escuchando en el puerto ${PORT}`);
        try {
            await downloadNgrok(); // Primero asegura que ngrok está descargado
            startNgrokTunnel();   // Luego inicia el túnel
        } catch (error) {
            console.error('[ngrok-manager] Fallo crítico en el proceso de inicio de ngrok:', error);
        }
    });
}

function broadcastUpdate(draftId, data) {
    const payload = JSON.stringify({ draftId, data });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(payload);
        }
    });
}
