import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Mock data for roulette
const mockTeams = [
    { id: '1', nombre: 'Team Alpha', logoUrl: 'https://via.placeholder.com/50' },
    { id: '2', nombre: 'Team Beta', logoUrl: 'https://via.placeholder.com/50' },
    { id: '3', nombre: 'Team Gamma', logoUrl: 'https://via.placeholder.com/50' },
    { id: '4', nombre: 'Team Delta', logoUrl: 'https://via.placeholder.com/50' },
    { id: '5', nombre: 'Team Epsilon', logoUrl: 'https://via.placeholder.com/50' },
    { id: '6', nombre: 'Team Zeta', logoUrl: 'https://via.placeholder.com/50' },
    { id: '7', nombre: 'Team Eta', logoUrl: 'https://via.placeholder.com/50' },
    { id: '8', nombre: 'Team Theta', logoUrl: 'https://via.placeholder.com/50' }
];

// Mock API endpoint
app.get('/api/roulette-data/:sessionId', (req, res) => {
    console.log(`[API] Fetching data for session: ${req.params.sessionId}`);
    if (req.params.sessionId === 'test-session') {
        res.json({
            teams: mockTeams,
            tournamentShortId: 'test-tournament'
        });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Mock WebSocket
wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    ws.on('message', (message) => {
        console.log(`[WS] Received: ${message}`);
        const data = JSON.parse(message);

        if (data.type === 'spin_result') {
            console.log(`[WS] Spin result received: Team ID ${data.teamId}`);
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}/?rouletteSessionId=test-session`);
});
