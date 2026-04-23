// src/utils/best11ImageGenerator.js
import { createCanvas } from 'canvas';
import { AttachmentBuilder } from 'discord.js';

/**
 * Genera una imagen del Mejor 11 en formación 3-5-2.
 * @param {string} tournamentName - Nombre del torneo
 * @param {Object} best11 - { gk: [], defs: [], meds: [], carrs: [], dcs: [] }
 * @returns {AttachmentBuilder}
 */
export function generateBest11Image(tournamentName, best11) {
    const WIDTH = 900;
    const HEIGHT = 1100;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // === FONDO (gradiente oscuro con tono verde central) ===
    const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bgGrad.addColorStop(0, '#0a0e1a');
    bgGrad.addColorStop(0.3, '#0f1e0f');
    bgGrad.addColorStop(0.7, '#0f1e0f');
    bgGrad.addColorStop(1, '#0a0e1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // === MARCAS DEL CAMPO (sutiles) ===
    drawPitch(ctx, WIDTH, HEIGHT);

    // === TÍTULO ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 38px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MEJOR 11', WIDTH / 2, 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial, sans-serif';
    const displayName = tournamentName.length > 45 ? tournamentName.substring(0, 44) + '...' : tournamentName;
    ctx.fillText(displayName, WIDTH / 2, 80);

    // Línea decorativa dorada
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 95);
    ctx.lineTo(750, 95);
    ctx.stroke();

    // === TARJETAS DE JUGADORES (formación 3-5-2) ===
    const slots = [
        // DC (2 delanteros arriba)
        { x: 330, y: 190, arr: best11.dcs, idx: 0, label: 'DC' },
        { x: 570, y: 190, arr: best11.dcs, idx: 1, label: 'DC' },
        // CARR (2 carrileros en las bandas)
        { x: 110, y: 370, arr: best11.carrs, idx: 0, label: 'CARR' },
        { x: 790, y: 370, arr: best11.carrs, idx: 1, label: 'CARR' },
        // MED (3 medios en el centro)
        { x: 250, y: 520, arr: best11.meds, idx: 0, label: 'MED' },
        { x: 450, y: 520, arr: best11.meds, idx: 1, label: 'MED' },
        { x: 650, y: 520, arr: best11.meds, idx: 2, label: 'MED' },
        // DEF (3 defensas)
        { x: 250, y: 700, arr: best11.defs, idx: 0, label: 'DEF' },
        { x: 450, y: 700, arr: best11.defs, idx: 1, label: 'DEF' },
        { x: 650, y: 700, arr: best11.defs, idx: 2, label: 'DEF' },
        // GK (1 portero abajo)
        { x: 450, y: 880, arr: best11.gk, idx: 0, label: 'GK' },
    ];

    for (const slot of slots) {
        const player = slot.arr?.[slot.idx] || null;
        drawPlayerCard(ctx, slot.x, slot.y, player, slot.label);
    }

    // === FORMACIÓN ===
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Formacion: 3-5-2', WIDTH / 2, 990);

    // === FOOTER ===
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText('Powered by EA Sports FC - THE BLITZ', WIDTH / 2, 1020);

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'mejor-11.png' });
}

// --- Dibujar marcas del campo de fútbol ---
function drawPitch(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;

    // Borde exterior
    ctx.strokeRect(50, 130, w - 100, h - 260);

    // Línea del centro
    ctx.beginPath();
    ctx.moveTo(50, h / 2 + 30);
    ctx.lineTo(w - 50, h / 2 + 30);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 30, 100, 0, Math.PI * 2);
    ctx.stroke();

    // Área grande superior (ataque)
    ctx.strokeRect(w / 2 - 170, 130, 340, 110);

    // Área grande inferior (portería)
    ctx.strokeRect(w / 2 - 170, h - 240, 340, 110);

    // Punto central
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 30, 4, 0, Math.PI * 2);
    ctx.fill();
}

// --- Dibujar tarjeta de jugador ---
function drawPlayerCard(ctx, cx, cy, player, posLabel) {
    const W = 160;
    const H = 85;
    const x = cx - W / 2;
    const y = cy - H / 2;
    const r = 10;

    // Fondo de la tarjeta
    ctx.fillStyle = player ? 'rgba(15, 20, 40, 0.88)' : 'rgba(30, 30, 30, 0.45)';
    roundedRect(ctx, x, y, W, H, r);
    ctx.fill();

    // Borde
    ctx.strokeStyle = player ? '#FFD700' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = player ? 2 : 1;
    roundedRect(ctx, x, y, W, H, r);
    ctx.stroke();

    if (!player) {
        // Tarjeta vacía: solo mostrar la posición
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(posLabel, cx, cy + 5);
        return;
    }

    // Posición (arriba, dorado)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(posLabel, cx, y + 18);

    // Nombre del jugador (centro, blanco)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial, sans-serif';
    const name = player.name.length > 16 ? player.name.substring(0, 15) + '..' : player.name;
    ctx.fillText(name, cx, y + 42);

    // Rating (abajo, dorado grande)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px Arial, sans-serif';
    const rating = (player.avgRating || 0).toFixed(1);
    ctx.fillText(rating, cx, y + 70);
}

// --- Helper: rectángulo con esquinas redondeadas ---
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
