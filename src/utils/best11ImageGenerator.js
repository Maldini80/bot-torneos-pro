// src/utils/best11ImageGenerator.js
import { createCanvas } from 'canvas';
import { AttachmentBuilder } from 'discord.js';

/**
 * Genera una imagen premium del Mejor 11 en formación 3-5-2.
 * @param {string} tournamentName - Nombre del torneo
 * @param {Object} best11 - { gk: [], defs: [], meds: [], carrs: [], dcs: [] }
 * @returns {AttachmentBuilder}
 */
export function generateBest11Image(tournamentName, best11) {
    const WIDTH = 900;
    const HEIGHT = 1100;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // === FONDO PREMIUM ===
    drawBackground(ctx, WIDTH, HEIGHT);

    // === CAMPO DE FÚTBOL ===
    drawPitch(ctx, WIDTH, HEIGHT);

    // === HEADER ===
    drawHeader(ctx, WIDTH, tournamentName);

    // === TARJETAS DE JUGADORES (formación 3-5-2) ===
    const slots = [
        // DC (2 delanteros arriba)
        { x: 310, y: 200, arr: best11.dcs, idx: 0, label: 'DC' },
        { x: 590, y: 200, arr: best11.dcs, idx: 1, label: 'DC' },
        // CARR (2 carrileros en las bandas)
        { x: 115, y: 380, arr: best11.carrs, idx: 0, label: 'CARR' },
        { x: 785, y: 380, arr: best11.carrs, idx: 1, label: 'CARR' },
        // MED (3 medios en el centro)
        { x: 240, y: 530, arr: best11.meds, idx: 0, label: 'MED' },
        { x: 450, y: 530, arr: best11.meds, idx: 1, label: 'MED' },
        { x: 660, y: 530, arr: best11.meds, idx: 2, label: 'MED' },
        // DEF (3 defensas)
        { x: 240, y: 710, arr: best11.defs, idx: 0, label: 'DEF' },
        { x: 450, y: 710, arr: best11.defs, idx: 1, label: 'DEF' },
        { x: 660, y: 710, arr: best11.defs, idx: 2, label: 'DEF' },
        // GK (1 portero abajo)
        { x: 450, y: 890, arr: best11.gk, idx: 0, label: 'GK' },
    ];

    for (const slot of slots) {
        const player = slot.arr?.[slot.idx] || null;
        drawPlayerCard(ctx, slot.x, slot.y, player, slot.label);
    }

    // === FOOTER ===
    drawFooter(ctx, WIDTH, HEIGHT);

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'mejor-11.png' });
}

// ==========================================
// === FONDO PREMIUM ===
// ==========================================
function drawBackground(ctx, w, h) {
    // Gradiente principal oscuro
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0d17');
    bg.addColorStop(0.15, '#0d1a0d');
    bg.addColorStop(0.5, '#143a14');
    bg.addColorStop(0.85, '#0d1a0d');
    bg.addColorStop(1, '#0b0d17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Viñeta sutil en las esquinas
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
    const pitchTop = 140;
    const pitchBottom = h - 140;
    const pitchLeft = 40;
    const pitchRight = w - 40;
    const pitchW = pitchRight - pitchLeft;
    const pitchH = pitchBottom - pitchTop;
    const midY = pitchTop + pitchH / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2;

    // Borde exterior
    ctx.strokeRect(pitchLeft, pitchTop, pitchW, pitchH);

    // Línea del centro
    ctx.beginPath();
    ctx.moveTo(pitchLeft, midY);
    ctx.lineTo(pitchRight, midY);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(w / 2, midY, 80, 0, Math.PI * 2);
    ctx.stroke();

    // Punto central
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.arc(w / 2, midY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Área grande superior (ataque)
    const boxW = 300;
    const boxH = 90;
    ctx.strokeRect(w / 2 - boxW / 2, pitchTop, boxW, boxH);

    // Área pequeña superior
    ctx.strokeRect(w / 2 - 120, pitchTop, 240, 40);

    // Área grande inferior (portería)
    ctx.strokeRect(w / 2 - boxW / 2, pitchBottom - boxH, boxW, boxH);

    // Área pequeña inferior
    ctx.strokeRect(w / 2 - 120, pitchBottom - 40, 240, 40);
}

// ==========================================
// === HEADER ===
// ==========================================
function drawHeader(ctx, w, tournamentName) {
    // Barra superior semi-transparente
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 120);
    headerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    headerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, w, 120);

    // Título principal
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 44px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MEJOR 11', w / 2, 55);

    // Nombre del torneo
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px Arial, sans-serif';
    const name = tournamentName.length > 50 ? tournamentName.substring(0, 49) + '...' : tournamentName;
    ctx.fillText(name, w / 2, 85);

    // Línea dorada decorativa
    const lineGrad = ctx.createLinearGradient(150, 0, w - 150, 0);
    lineGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    lineGrad.addColorStop(0.3, 'rgba(255, 215, 0, 0.8)');
    lineGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.8)');
    lineGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 100);
    ctx.lineTo(w - 150, 100);
    ctx.stroke();
}

// ==========================================
// === TARJETA DE JUGADOR ===
// ==========================================
function drawPlayerCard(ctx, cx, cy, player, posLabel) {
    const CARD_W = 155;
    const CARD_H = 90;
    const x = cx - CARD_W / 2;
    const y = cy - CARD_H / 2;
    const r = 12;

    // === Sombra de la tarjeta ===
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundedRect(ctx, x + 3, y + 3, CARD_W, CARD_H, r);
    ctx.fill();

    if (!player) {
        // Tarjeta vacía
        ctx.fillStyle = 'rgba(30, 35, 50, 0.5)';
        roundedRect(ctx, x, y, CARD_W, CARD_H, r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        roundedRect(ctx, x, y, CARD_W, CARD_H, r);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(posLabel, cx, cy + 5);
        return;
    }

    // === Fondo con gradiente premium ===
    const cardGrad = ctx.createLinearGradient(x, y, x, y + CARD_H);
    cardGrad.addColorStop(0, 'rgba(20, 30, 60, 0.92)');
    cardGrad.addColorStop(1, 'rgba(10, 15, 35, 0.95)');
    ctx.fillStyle = cardGrad;
    roundedRect(ctx, x, y, CARD_W, CARD_H, r);
    ctx.fill();

    // === Borde con brillo dorado ===
    const borderGrad = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
    borderGrad.addColorStop(0, '#FFD700');
    borderGrad.addColorStop(0.5, '#FFA500');
    borderGrad.addColorStop(1, '#FFD700');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2;
    roundedRect(ctx, x, y, CARD_W, CARD_H, r);
    ctx.stroke();

    // === Badge de posición (esquina superior izquierda) ===
    const badgeW = 42;
    const badgeH = 18;
    const badgeX = x + 6;
    const badgeY = y + 6;
    ctx.fillStyle = '#FFD700';
    roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.fillStyle = '#0a0e1a';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(posLabel, badgeX + badgeW / 2, badgeY + 13);

    // === Nombre del jugador ===
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    const displayName = player.name.length > 15 ? player.name.substring(0, 14) + '..' : player.name;
    ctx.fillText(displayName, cx, cy + 5);

    // === Círculo de Rating ===
    const rating = (player.avgRating || 0).toFixed(1);
    const ratingX = x + CARD_W - 28;
    const ratingY = y + CARD_H - 22;
    const ratingRadius = 16;

    // Fondo del círculo (gradiente según nota)
    const ratingColor = getRatingColor(player.avgRating || 0);
    const rCircleGrad = ctx.createRadialGradient(ratingX, ratingY, 0, ratingX, ratingY, ratingRadius);
    rCircleGrad.addColorStop(0, ratingColor);
    rCircleGrad.addColorStop(1, shadeColor(ratingColor, -40));
    ctx.fillStyle = rCircleGrad;
    ctx.beginPath();
    ctx.arc(ratingX, ratingY, ratingRadius, 0, Math.PI * 2);
    ctx.fill();

    // Borde del círculo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ratingX, ratingY, ratingRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Texto del rating
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rating, ratingX, ratingY + 5);
}

// ==========================================
// === FOOTER ===
// ==========================================
function drawFooter(ctx, w, h) {
    // Barra inferior
    const footerGrad = ctx.createLinearGradient(0, h - 80, 0, h);
    footerGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    footerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = footerGrad;
    ctx.fillRect(0, h - 80, w, 80);

    // Formación
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('3 - 5 - 2', w / 2, h - 45);

    // Powered by
    ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('Powered by EA Sports FC  |  THE BLITZ', w / 2, h - 20);
}

// ==========================================
// === HELPERS ===
// ==========================================

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

// Color del círculo de rating según la nota
function getRatingColor(rating) {
    if (rating >= 9.0) return '#00e676'; // Verde brillante
    if (rating >= 8.0) return '#66bb6a'; // Verde
    if (rating >= 7.0) return '#ffc107'; // Amarillo
    if (rating >= 6.0) return '#ff9800'; // Naranja
    return '#f44336'; // Rojo
}

// Oscurecer un color hex
function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// ==========================================
// === IMAGEN DE PREMIOS INDIVIDUALES ===
// ==========================================

/**
 * Genera una imagen premium con los premios individuales del torneo.
 * @param {string} tournamentName - Nombre del torneo
 * @param {Object} awards - { mvp, topScorer, topAssister, zamora }
 * @returns {AttachmentBuilder}
 */
export function generateAwardsImage(tournamentName, awards) {
    const WIDTH = 900;
    const HEIGHT = 600;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // === FONDO ===
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#0b0d17');
    bg.addColorStop(0.5, '#111827');
    bg.addColorStop(1, '#0b0d17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Viñeta
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.15, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // === HEADER ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GALARDONES INDIVIDUALES', WIDTH / 2, 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial, sans-serif';
    const name = tournamentName.length > 50 ? tournamentName.substring(0, 49) + '...' : tournamentName;
    ctx.fillText(name, WIDTH / 2, 78);

    // Línea dorada
    const lineGrad = ctx.createLinearGradient(100, 0, WIDTH - 100, 0);
    lineGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    lineGrad.addColorStop(0.3, 'rgba(255, 215, 0, 0.7)');
    lineGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.7)');
    lineGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 95);
    ctx.lineTo(WIDTH - 100, 95);
    ctx.stroke();

    // === PREMIOS ===
    const awardsList = [
        {
            icon: 'MVP', iconColor: '#FFD700', label: 'MVP DEL TORNEO',
            player: awards.mvp, stat: awards.mvp ? `Rating: ${awards.mvp.avgRating.toFixed(1)}` : null
        },
        {
            icon: 'GOL', iconColor: '#00e676', label: 'BOTA DE ORO',
            player: awards.topScorer, stat: awards.topScorer && awards.topScorer.goals > 0 ? `${awards.topScorer.goals} goles` : null
        },
        {
            icon: 'AST', iconColor: '#42a5f5', label: 'MAXIMO ASISTENTE',
            player: awards.topAssister, stat: awards.topAssister && awards.topAssister.assists > 0 ? `${awards.topAssister.assists} asistencias` : null
        },
        {
            icon: 'GK', iconColor: '#ab47bc', label: 'GUANTE DE ORO (ZAMORA)',
            player: awards.zamora, stat: awards.zamora ? `${awards.zamora.cleanSheets} porterias a cero` : null
        }
    ];

    const cardW = 380;
    const cardH = 95;
    const startY = 125;
    const gap = 15;

    for (let i = 0; i < awardsList.length; i++) {
        const award = awardsList[i];
        const cx = WIDTH / 2;
        const cy = startY + i * (cardH + gap) + cardH / 2;
        const x = cx - cardW / 2;
        const y = cy - cardH / 2;

        // Sombra
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        roundedRect(ctx, x + 3, y + 3, cardW, cardH, 14);
        ctx.fill();

        // Fondo tarjeta
        const cGrad = ctx.createLinearGradient(x, y, x + cardW, y);
        cGrad.addColorStop(0, 'rgba(20, 25, 50, 0.9)');
        cGrad.addColorStop(1, 'rgba(15, 20, 40, 0.95)');
        ctx.fillStyle = cGrad;
        roundedRect(ctx, x, y, cardW, cardH, 14);
        ctx.fill();

        // Borde
        ctx.strokeStyle = award.iconColor;
        ctx.lineWidth = 2;
        roundedRect(ctx, x, y, cardW, cardH, 14);
        ctx.stroke();

        // Círculo del icono (izquierda)
        const circleX = x + 50;
        const circleY = cy;
        const circleR = 28;

        const cCircleGrad = ctx.createRadialGradient(circleX, circleY, 0, circleX, circleY, circleR);
        cCircleGrad.addColorStop(0, award.iconColor);
        cCircleGrad.addColorStop(1, shadeColor(award.iconColor, -50));
        ctx.fillStyle = cCircleGrad;
        ctx.beginPath();
        ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
        ctx.stroke();

        // Texto del icono
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(award.icon, circleX, circleY + 5);

        // Textos (derecha del círculo)
        const textX = circleX + 50;

        // Label del premio
        ctx.fillStyle = award.iconColor;
        ctx.font = 'bold 13px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(award.label, textX, cy - 20);

        if (award.player && award.stat) {
            // Nombre del jugador
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Arial, sans-serif';
            const pName = award.player.name.length > 18 ? award.player.name.substring(0, 17) + '..' : award.player.name;
            ctx.fillText(pName, textX, cy + 8);

            // Estadística
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '14px Arial, sans-serif';
            ctx.fillText(award.stat, textX, cy + 30);
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '16px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('Sin datos disponibles', textX, cy + 5);
        }
    }

    // === FOOTER ===
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by EA Sports FC  |  THE BLITZ', WIDTH / 2, HEIGHT - 20);

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'premios.png' });
}
