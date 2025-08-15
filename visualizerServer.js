// visualizerServer.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import ngrok from 'ngrok';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
let draftStates = new Map();

// La función ahora es 'async' para poder usar 'await' con ngrok
export async function startVisualizerServer() {
    app.use(express.json());
    app.use(express.static('public'));

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

    // Hacemos que el servidor interno escuche en el puerto
    server.listen(PORT, async () => {
        console.log(`[Visualizer] Servidor interno escuchando en el puerto ${PORT}`);
        
        // --- LÓGICA DE NGROK ---
        if (process.env.NGROK_AUTHTOKEN && process.env.NGROK_STATIC_DOMAIN) {
            try {
                // Inicia el túnel ngrok hacia nuestro servidor interno
                const url = await ngrok.connect({
                    proto: 'http',
                    addr: PORT,
                    authtoken: process.env.NGROK_AUTHTOKEN,
                    domain: process.env.NGROK_STATIC_DOMAIN,
                });
                console.log(`[ngrok] Túnel establecido. El visualizador está disponible públicamente en: ${url}`);
            } catch (error) {
                console.error('[ngrok] Error al iniciar el túnel:', error);
            }
        } else {
            console.warn('[ngrok] No se han proporcionado las variables de entorno NGROK_AUTHTOKEN y NGROK_STATIC_DOMAIN. El visualizador solo será accesible localmente.');
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
