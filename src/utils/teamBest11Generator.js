import { registerFont, createCanvas, loadImage } from 'canvas';
import path from 'path';

// --- CONFIGURACIÓN DE PUNTOS ---
function calculatePlayerPoints(player) {
    const p = {
        gamesPlayed: parseInt(player.gamesPlayed || 0),
        goals: parseInt(player.goals || 0),
        assists: parseInt(player.assists || 0),
        passesMade: parseInt(player.passesMade || 0),
        tacklesMade: parseInt(player.tacklesMade || 0),
        cleanSheetsDef: parseInt(player.cleanSheetsDef || 0),
        cleanSheetsGK: parseInt(player.cleanSheetsGK || 0),
        motm: parseInt(player.manOfTheMatch || 0)
    };

    let points = p.gamesPlayed * 1.0;
    points += p.motm * 3.0;
    points += p.goals * 3.0;
    points += p.assists * 2.0;
    points += p.passesMade * 0.05;
    points += p.tacklesMade * 0.2;
    points += p.cleanSheetsDef * 3.0;
    points += p.cleanSheetsGK * 4.0;

    return Math.round(points);
}

// --- CLASIFICACIÓN DE POSICIONES ---
// Usamos posName que es calculado de forma mucho más precisa por nuestro bot (POR, DFC, MC, DC)
function determinePositionGroup(player) {
    const p = (player.posName || '').toUpperCase();
    if (p === 'POR') return 'gk';
    if (['DFC', 'LI', 'LD', 'CAD', 'CAI', 'DFI', 'DFD'].includes(p)) return 'def';
    if (['MCD', 'MC', 'MCO', 'MI', 'MD'].includes(p)) return 'mid';
    return 'fwd'; // ED, EI, DC, MP, SD, etc.
}

// Lógica principal de selección
export async function calculateTeamBest11(eaClubId, eaPlatform = 'common-gen5') {
    const eaStatsFetcher = await import('./eaStatsFetcher.js');
    const roster = await eaStatsFetcher.fetchClubRosterHeights(eaClubId, eaPlatform);

    if (!roster || roster.length === 0) {
        throw new Error('No se encontraron jugadores en el club de EA Sports.');
    }

    const playersWithPoints = roster
        .filter(p => parseInt(p.gamesPlayed || 0) > 0)
        .map(p => ({
            ...p,
            points: calculatePlayerPoints(p),
            posGroup: determinePositionGroup(p),
            username: p.name
        }))
        .sort((a, b) => b.points - a.points); // Ordenar por puntos de mayor a menor

    if (playersWithPoints.length === 0) {
        throw new Error('Ningún jugador de este club de EA tiene partidos jugados registrados en su historial.');
    }

    const gks = playersWithPoints.filter(p => p.posGroup === 'gk');
    const defs = playersWithPoints.filter(p => p.posGroup === 'def');
    const mids = playersWithPoints.filter(p => p.posGroup === 'mid');
    const fwds = playersWithPoints.filter(p => p.posGroup === 'fwd');

    const best11 = {
        gk: gks.slice(0, 1),
        def: defs.slice(0, 3), // Formación 3-5-2
        mid: mids.slice(0, 5),
        fwd: fwds.slice(0, 2)
    };

    // --- RELLENO INTELIGENTE ---
    // Si faltan jugadores en alguna posición, rellenamos con los que tienen más puntos sobrantes
    let selectedNames = new Set([
        ...best11.gk.map(p => p.name),
        ...best11.def.map(p => p.name),
        ...best11.mid.map(p => p.name),
        ...best11.fwd.map(p => p.name)
    ]);

    const getRemaining = () => playersWithPoints.filter(p => !selectedNames.has(p.name));

    // Si falta portero (muy raro que jueguen sin él, pero por si acaso)
    if (best11.gk.length < 1) {
        const remaining = getRemaining();
        if (remaining.length > 0) {
            best11.gk.push(remaining[0]);
            selectedNames.add(remaining[0].name);
        }
    }

    // Si faltan defensas
    while (best11.def.length < 3) {
        const remaining = getRemaining();
        if (remaining.length === 0) break;
        best11.def.push(remaining[0]);
        selectedNames.add(remaining[0].name);
    }

    // Si faltan medios
    while (best11.mid.length < 5) {
        const remaining = getRemaining();
        if (remaining.length === 0) break;
        best11.mid.push(remaining[0]);
        selectedNames.add(remaining[0].name);
    }

    // Si faltan delanteros
    while (best11.fwd.length < 2) {
        const remaining = getRemaining();
        if (remaining.length === 0) break;
        best11.fwd.push(remaining[0]);
        selectedNames.add(remaining[0].name);
    }

    return best11;
}

// --- GENERACIÓN DE IMAGEN (CANVAS) ---
export async function generateTeamBest11Image(best11, teamName, teamLogoUrl) {
    const WIDTH = 1200;
    const HEIGHT = 1400; // Un poco más alto para que quepa bien el 3-5-2
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Fondo Premium (Degradado Oscuro)
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#020617');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 2. Líneas del campo simplificadas (brillo bajo)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 3;
    // Círculo central
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 120, 0, Math.PI * 2);
    ctx.stroke();
    // Línea central
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT / 2);
    ctx.lineTo(WIDTH, HEIGHT / 2);
    ctx.stroke();
    // Áreas
    ctx.strokeRect(WIDTH / 2 - 250, 0, 500, 200);
    ctx.strokeRect(WIDTH / 2 - 250, HEIGHT - 200, 500, 200);

    // 3. Logo del equipo de fondo (Gigante y Semitransparente)
    if (teamLogoUrl) {
        try {
            const logo = await loadImage(teamLogoUrl);
            ctx.globalAlpha = 0.05;
            // Calcular aspect ratio para centrarlo
            const size = 800;
            const lx = (WIDTH - size) / 2;
            const ly = (HEIGHT - size) / 2;
            ctx.drawImage(logo, lx, ly, size, size);
            ctx.globalAlpha = 1.0;
        } catch (e) {
            console.error('[Canvas] Error cargando logo de fondo:', e.message);
        }
    }

    // 4. Cabecera
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial'; // Usando Arial como fallback rápido
    ctx.fillText('11 IDEAL DEL EQUIPO', WIDTH / 2, 70);
    ctx.font = '32px Arial';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(teamName.toUpperCase(), WIDTH / 2, 120);

    // 5. Dibujar Cartas (3-5-2)
    // Coordenadas relativas
    const positionsCoords = {
        gk: [{ x: 600, y: 1250, label: 'POR' }],
        def: [
            { x: 250, y: 1000, label: 'DFI' },
            { x: 600, y: 1050, label: 'DFC' },
            { x: 950, y: 1000, label: 'DFD' }
        ],
        mid: [
            { x: 200, y: 700, label: 'MI' },
            { x: 400, y: 800, label: 'MCD' },
            { x: 600, y: 650, label: 'MCO' },
            { x: 800, y: 800, label: 'MCD' },
            { x: 1000, y: 700, label: 'MD' }
        ],
        fwd: [
            { x: 450, y: 350, label: 'DC' },
            { x: 750, y: 350, label: 'DC' }
        ]
    };

    // Helper para dibujar una carta
    async function drawCard(cx, cy, player, posLabel) {
        const CARD_W = 160;
        const CARD_H = 200;
        const x = cx - CARD_W / 2;
        const y = cy - CARD_H / 2;

        if (!player) {
            // Carta vacía
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath(); ctx.roundRect(x, y, CARD_W, CARD_H, 10); ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath(); ctx.roundRect(x, y, CARD_W, CARD_H, 10); ctx.stroke();
            return;
        }

        // Fondo de carta con degradado dorado
        const cardGrad = ctx.createLinearGradient(x, y, x, y + CARD_H);
        cardGrad.addColorStop(0, '#eab308'); // Dorado principal
        cardGrad.addColorStop(1, '#a16207'); // Dorado oscuro
        ctx.fillStyle = cardGrad;
        ctx.beginPath(); ctx.roundRect(x, y, CARD_W, CARD_H, 12); ctx.fill();
        
        // Borde interior
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x+3, y+3, CARD_W-6, CARD_H-6, 10); ctx.stroke();

        // Puntos (Gigante arriba)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.points, cx, y + 60);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText('PUNTOS', cx, y + 80);

        // Nombre (Abajo)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        const pName = player.username.length > 13 ? player.username.substring(0,11) + '...' : player.username;
        ctx.fillText(pName, cx, y + 140);

        // Posición y Partidos
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#fef08a'; // Amarillo clarito
        ctx.fillText(`${posLabel} | ${player.gamesPlayed || 0} PJ`, cx, y + 170);

        // Detalle de aportación (Goles o Asistencias dependiendo si atacante o defensa)
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        if (posLabel === 'POR' || posLabel.startsWith('DF')) {
            ctx.fillText(`Cero: ${player.cleanSheetsDef || player.cleanSheetsGK || 0} | Entr: ${player.tacklesMade || 0}`, cx, y + 190);
        } else {
            ctx.fillText(`Goles: ${player.goals || 0} | Asist: ${player.assists || 0}`, cx, y + 190);
        }
    }

    // Dibujar cada línea
    for (let i = 0; i < positionsCoords.gk.length; i++) {
        await drawCard(positionsCoords.gk[i].x, positionsCoords.gk[i].y, best11.gk[i], positionsCoords.gk[i].label);
    }
    for (let i = 0; i < positionsCoords.def.length; i++) {
        await drawCard(positionsCoords.def[i].x, positionsCoords.def[i].y, best11.def[i], positionsCoords.def[i].label);
    }
    for (let i = 0; i < positionsCoords.mid.length; i++) {
        await drawCard(positionsCoords.mid[i].x, positionsCoords.mid[i].y, best11.mid[i], positionsCoords.mid[i].label);
    }
    for (let i = 0; i < positionsCoords.fwd.length; i++) {
        await drawCard(positionsCoords.fwd[i].x, positionsCoords.fwd[i].y, best11.fwd[i], positionsCoords.fwd[i].label);
    }

    // 6. Si hay logo, ponerlo también pequeño arriba a la derecha (opcional, le da un toque oficial)
    if (teamLogoUrl) {
        try {
            const logo = await loadImage(teamLogoUrl);
            ctx.drawImage(logo, WIDTH - 150, 40, 90, 90);
        } catch(e) {}
    }

    return canvas.toBuffer('image/png');
}
