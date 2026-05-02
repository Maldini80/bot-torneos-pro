// src/utils/vpgBest11ImageGenerator.js
import { createCanvas, loadImage } from 'canvas';

/**
 * Genera una imagen premium del Mejor 11 VPG en formación 3-5-2.
 * @param {Object} best11 - { gk: [], def: [], mid: [], fwd: [] }
 * @param {string} tournamentShortId
 * @param {string} leagueSlug
 * @returns {Promise<Buffer>}
 */
export async function generateVpgBest11Image(best11, tournamentShortId, leagueSlug) {
    const WIDTH = 1100;
    const HEIGHT = 1350;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // === FONDO PREMIUM ===
    drawBackground(ctx, WIDTH, HEIGHT);

    // === CAMPO DE FÚTBOL ===
    drawPitch(ctx, WIDTH, HEIGHT);

    // === HEADER ===
    const title = 'MEJOR 11 VPG';
    const subtitle = `Liga: ${leagueSlug.toUpperCase().replace(/-/g, ' ')}`;
    drawHeader(ctx, WIDTH, title, subtitle);

    // === TARJETAS DE JUGADORES (formación 3-5-2) ===
    const slots = [
        // FWD (2 delanteros arriba)
        { x: 380, y: 240, arr: best11.fwd, idx: 0, label: 'DC' },
        { x: 720, y: 240, arr: best11.fwd, idx: 1, label: 'DC' },
        // MID (5 medios en el centro - wingers y cdms/cams)
        // El array mid viene con los 3 centrales primero y los 2 wingers después, o viceversa.
        // Asumiendo mid = [c1, c2, c3, w1, w2]
        { x: 130, y: 460, arr: best11.mid, idx: 3, label: 'CARR' }, // Winger 1
        { x: 970, y: 460, arr: best11.mid, idx: 4, label: 'CARR' }, // Winger 2
        { x: 290, y: 650, arr: best11.mid, idx: 0, label: 'MED' }, // Central 1
        { x: 550, y: 650, arr: best11.mid, idx: 1, label: 'MED' }, // Central 2
        { x: 810, y: 650, arr: best11.mid, idx: 2, label: 'MED' }, // Central 3
        // DEF (3 defensas)
        { x: 290, y: 870, arr: best11.def, idx: 0, label: 'DEF' },
        { x: 550, y: 870, arr: best11.def, idx: 1, label: 'DEF' },
        { x: 810, y: 870, arr: best11.def, idx: 2, label: 'DEF' },
        // GK (1 portero abajo)
        { x: 550, y: 1090, arr: best11.gk, idx: 0, label: 'GK' },
    ];

    for (const slot of slots) {
        const player = slot.arr?.[slot.idx] || null;
        await drawPlayerCard(ctx, slot.x, slot.y, player, slot.label);
    }

    // === FOOTER ===
    drawFooter(ctx, WIDTH, HEIGHT);

    return canvas.toBuffer('image/png');
}

// ==========================================
// === FONDO PREMIUM ===
// ==========================================
function drawBackground(ctx, w, h) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0d17');
    bg.addColorStop(0.15, '#0d1a0d');
    bg.addColorStop(0.5, '#143a14');
    bg.addColorStop(0.85, '#0d1a0d');
    bg.addColorStop(1, '#0b0d17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
}

// ==========================================
// === CAMPO DE FÚTBOL ===
// ==========================================
function drawPitch(ctx, w, h) {
    const pitchTop = 160;
    const pitchBottom = h - 160;
    const pitchLeft = 50;
    const pitchRight = w - 50;
    const pitchW = pitchRight - pitchLeft;
    const pitchH = pitchBottom - pitchTop;
    const midY = pitchTop + pitchH / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2;

    ctx.strokeRect(pitchLeft, pitchTop, pitchW, pitchH);
    ctx.beginPath();
    ctx.moveTo(pitchLeft, midY);
    ctx.lineTo(pitchRight, midY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2, midY, 90, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.arc(w / 2, midY, 4, 0, Math.PI * 2);
    ctx.fill();

    const boxW = 350;
    const boxH = 100;
    ctx.strokeRect(w / 2 - boxW / 2, pitchTop, boxW, boxH);
    ctx.strokeRect(w / 2 - 140, pitchTop, 280, 45);
    ctx.strokeRect(w / 2 - boxW / 2, pitchBottom - boxH, boxW, boxH);
    ctx.strokeRect(w / 2 - 140, pitchBottom - 45, 280, 45);
}

// ==========================================
// === HEADER ===
// ==========================================
function drawHeader(ctx, w, title, subtitle) {
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 140);
    headerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    headerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, w, 140);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 65);

    ctx.fillStyle = '#ffffff';
    ctx.font = '22px Arial, sans-serif';
    ctx.fillText(subtitle, w / 2, 100);

    const lineGrad = ctx.createLinearGradient(180, 0, w - 180, 0);
    lineGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    lineGrad.addColorStop(0.3, 'rgba(255, 215, 0, 0.8)');
    lineGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.8)');
    lineGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(180, 118);
    ctx.lineTo(w - 180, 118);
    ctx.stroke();
}

// ==========================================
// === TARJETA DE JUGADOR ===
// ==========================================
async function drawPlayerCard(ctx, cx, cy, playerData, posLabel) {
    const CARD_W = 140;
    const CARD_H = 175;
    const x = cx - CARD_W / 2;
    const y = cy - CARD_H / 2;

    if (!playerData) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        roundedRect(ctx, x, y, CARD_W, CARD_H, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        roundedRect(ctx, x, y, CARD_W, CARD_H, 8);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '14px Arial';
        ctx.fillText(posLabel, cx, cy);
        return;
    }

    // La API VPG devuelve objetos planos: { username, team_name, team_logo, match_rating, ... }
    const rating = playerData.points !== undefined && playerData.points !== null ? playerData.points : (playerData.match_rating || 0);
    const playerName = playerData.username || 'Desconocido';
    const teamName = playerData.team_name || 'Agente Libre';
    // Los logos de VPG están en el CDN de Cloudflare Images
    const teamLogoId = playerData.team_logo;
    const teamLogoUrl = teamLogoId ? `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${teamLogoId}/smThumb` : null;

    // Fondo tarjeta con gradiente
    const cardGrad = ctx.createLinearGradient(x, y, x, y + CARD_H);
    cardGrad.addColorStop(0, '#1a1e24');
    cardGrad.addColorStop(1, '#12151a');
    ctx.fillStyle = cardGrad;
    roundedRect(ctx, x, y, CARD_W, CARD_H, 8);
    ctx.fill();

    // Borde dorado
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    roundedRect(ctx, x, y, CARD_W, CARD_H, 8);
    ctx.stroke();

    // Rating grande
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(Math.floor(rating), x + 12, y + 34);
    
    // Posición
    ctx.font = 'bold 14px Arial';
    ctx.fillText(posLabel, x + 12, y + 52);

    // Logo equipo (CDN Cloudflare Images de VPG)
    if (teamLogoUrl) {
        try {
            const img = await loadImage(teamLogoUrl);
            ctx.drawImage(img, x + CARD_W - 42, y + 8, 34, 34);
        } catch (e) {
            // Silenciar errores de logo para no spamear logs
        }
    }

    // Línea separadora
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 62);
    ctx.lineTo(x + CARD_W - 10, y + 62);
    ctx.stroke();

    // Nombre del jugador
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    const displayName = playerName.length > 16 ? playerName.substring(0, 15) + '.' : playerName;
    ctx.fillText(displayName, cx, y + 82);

    // Nombre del equipo
    ctx.fillStyle = 'rgba(212, 175, 55, 0.7)';
    ctx.font = '11px Arial';
    const teamDisplay = teamName.length > 18 ? teamName.substring(0, 17) + '.' : teamName;
    ctx.fillText(teamDisplay, cx, y + 98);

    // Rating decimal pequeño
    ctx.fillStyle = '#d4af37';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    const ratingNum = typeof rating === 'number' ? rating : parseFloat(rating) || 0;
    const decimal = ratingNum.toFixed(1).split('.')[1];
    ctx.fillText(`.${decimal}`, x + 12 + ctx.measureText(Math.floor(ratingNum).toString()).width + 2, y + 34);
}

// ==========================================
// === FOOTER ===
// ==========================================
function drawFooter(ctx, w, h) {
    const footerGrad = ctx.createLinearGradient(0, h - 80, 0, h);
    footerGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    footerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = footerGrad;
    ctx.fillRect(0, h - 80, w, 80);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('3 - 5 - 2', w / 2, h - 50);

    ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText('Powered by Virtual Pro Gaming', w / 2, h - 25);
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
