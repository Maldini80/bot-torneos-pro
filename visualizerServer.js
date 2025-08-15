// visualizerServer.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Usamos el puerto que nos asigne Render, o el 3000 si es local.
const PORT = process.env.PORT || 3000;

// Almacenará el estado actual de cada draft activo.
let draftStates = new Map();

export function startVisualizerServer() {
    // Middleware para que el servidor entienda datos en formato JSON
    app.use(express.json());

    // Sirve los archivos estáticos (HTML, CSS, JS) de la carpeta 'public'
    app.use(express.static('public'));

    // Endpoint que el bot usará para enviar actualizaciones
    app.post('/update-draft/:draftId', (req, res) => {
        const { draftId } = req.params;
        const draftData = req.body;

        // Guardamos el estado más reciente del draft
        draftStates.set(draftId, draftData);

        // Enviamos la actualización a todos los clientes web conectados
        broadcastUpdate(draftId, draftData);

        console.log(`[Visualizer] Estado actualizado para el draft: ${draftId}`);
        res.status(200).send({ message: 'Update received' });
    });

    // Endpoint que la página web usará para obtener los datos iniciales al cargar
    app.get('/draft-data/:draftId', (req, res) => {
        const { draftId } = req.params;
        const data = draftStates.get(draftId);
        if (data) {
            res.json(data);
        } else {
            res.status(404).send({ error: 'Draft data not found' });
        }
    });

    wss.on('connection', ws => {
        console.log('[Visualizer] Nuevo caster conectado a la web.');
        ws.on('close', () => {
            console.log('[Visualizer] Caster desconectado.');
        });
    });

    server.listen(PORT, () => {
        console.log(`[Visualizer] Servidor web y WebSocket escuchando en el puerto ${PORT}`);
    });
}

// Función para enviar la data a todos los clientes conectados
function broadcastUpdate(draftId, data) {
    const payload = JSON.stringify({ draftId, data });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(payload);
        }
    });
}
