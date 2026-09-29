// src/utils/best11ImageGenerator.js
import { AttachmentBuilder } from 'discord.js';

const { createCanvas, loadImage } = await import('canvas').catch(async () => await import('@napi-rs/canvas'));

// ==========================================
// === DIBUJAR SILUETA CARTA FUT (SHIELD) ===
// ==========================================
function drawCardShape(ctx, x, y, w, h, r = 12) {
    const cutH = 22; // Inclinación inferior hacia la punta central
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - cutH);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h - cutH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function isValidLogoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.includes('2M7540p.png') || url.includes('V4J2Fcf.png') || url.includes('default_logo')) return false;
    return true;
}

// ==========================================
// === FONDO DE ESTADIO CON FOCOS Y CÉSPED ===
// ==========================================
// === FONDO DE ESTADIO CON CÉSPED VERDE Y FOCOS ===
// ==========================================
function drawStadiumPitch(ctx, w, h) {
    // 1. Marco exterior oscuro del estadio
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, w, h);

    // 2. Focos de estadio en esquinas (Iluminación real)
    const flareLeft = ctx.createRadialGradient(0, 0, 10, 0, 0, 600);
    flareLeft.addColorStop(0, 'rgba(160, 230, 255, 0.35)');
    flareLeft.addColorStop(0.3, 'rgba(80, 200, 240, 0.12)');
    flareLeft.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = flareLeft;
    ctx.fillRect(0, 0, 650, 650);

    const flareRight = ctx.createRadialGradient(w, 0, 10, w, 0, 600);
    flareRight.addColorStop(0, 'rgba(255, 230, 150, 0.30)');
    flareRight.addColorStop(0.3, 'rgba(255, 200, 100, 0.10)');
    flareRight.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = flareRight;
    ctx.fillRect(w - 650, 0, 650, 650);

    // 3. Césped verde visible, vibrante y natural
    const pitchTop = 150;
    const pitchBottom = h - 110;
    const pitchLeft = 40;
    const pitchRight = w - 40;
    const pitchW = pitchRight - pitchLeft;
    const pitchH = pitchBottom - pitchTop;
    const midY = pitchTop + pitchH / 2;

    // Fondo base del césped (verde auténtico, no negro)
    const grassGrad = ctx.createLinearGradient(0, pitchTop, 0, pitchBottom);
    grassGrad.addColorStop(0, '#1c5e2d');
    grassGrad.addColorStop(0.5, '#267d3c');
    grassGrad.addColorStop(1, '#1b5629');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(pitchLeft, pitchTop, pitchW, pitchH);

    // Franjas de corte de césped con verde alterno claro/oscuro
    const stripesCount = 10;
    const stripeW = pitchW / stripesCount;
    for (let s = 0; s < stripesCount; s++) {
        if (s % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        }
        ctx.fillRect(pitchLeft + s * stripeW, pitchTop, stripeW, pitchH);
    }

    // Foco de luz sobre el centro del campo
    const centerSpotlight = ctx.createRadialGradient(w / 2, midY, 80, w / 2, midY, 500);
    centerSpotlight.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    centerSpotlight.addColorStop(0.7, 'rgba(255, 255, 255, 0.02)');
    centerSpotlight.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
    ctx.fillStyle = centerSpotlight;
    ctx.fillRect(pitchLeft, pitchTop, pitchW, pitchH);

    // Sombra perimetral suave del campo
    const edgeShadow = ctx.createLinearGradient(0, pitchTop, 0, pitchBottom);
    edgeShadow.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    edgeShadow.addColorStop(0.08, 'rgba(0, 0, 0, 0)');
    edgeShadow.addColorStop(0.92, 'rgba(0, 0, 0, 0)');
    edgeShadow.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = edgeShadow;
    ctx.fillRect(pitchLeft, pitchTop, pitchW, pitchH);

    // 4. Líneas de campo nítidas, blancas y brillantes
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.shadowBlur = 5;

    // Borde exterior
    ctx.strokeRect(pitchLeft, pitchTop, pitchW, pitchH);

    // Línea de medio campo
    ctx.beginPath();
    ctx.moveTo(pitchLeft, midY);
    ctx.lineTo(pitchRight, midY);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(w / 2, midY, 110, 0, Math.PI * 2);
    ctx.stroke();

    // Punto central
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, midY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Áreas de penalti
    const boxW = 380;
    const boxH = 120;
    ctx.strokeRect(w / 2 - boxW / 2, pitchTop, boxW, boxH);
    ctx.strokeRect(w / 2 - 160, pitchTop, 320, 50);

    ctx.strokeRect(w / 2 - boxW / 2, pitchBottom - boxH, boxW, boxH);
    ctx.strokeRect(w / 2 - 160, pitchBottom - 50, 320, 50);

    ctx.restore();
}

// ==========================================
// === DIBUJAR CARTA FUT PREMIUM ===
// ==========================================
async function drawFutCard(ctx, cx, cy, player, posLabel) {
    const W = 166;
    const H = 222;
    const x = cx - W / 2;
    const y = cy - H / 2;

    if (!player) {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 15, 22, 0.6)';
        drawCardShape(ctx, x, y, W, H);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1.5;
        drawCardShape(ctx, x, y, W, H);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(posLabel, cx, cy);
        ctx.restore();
        return;
    }

    // 1. Sombra 3D proyectada de la carta
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#0f1117';
    drawCardShape(ctx, x, y, W, H);
    ctx.fill();
    ctx.restore();

    ctx.save();
    // 2. Fondo degradado de la carta (Estilo TOTW Black/Gold)
    const cardBg = ctx.createLinearGradient(x, y, x + W, y + H);
    cardBg.addColorStop(0, '#1c1f26');
    cardBg.addColorStop(0.3, '#12141a');
    cardBg.addColorStop(0.7, '#0c0d12');
    cardBg.addColorStop(1, '#1b1a16');
    ctx.fillStyle = cardBg;
    drawCardShape(ctx, x, y, W, H);
    ctx.fill();

    // Patrón geométrico superior
    const goldPattern = ctx.createLinearGradient(x, y, x + W, y + 70);
    goldPattern.addColorStop(0, 'rgba(255, 215, 0, 0.08)');
    goldPattern.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldPattern;
    drawCardShape(ctx, x, y, W, H);
    ctx.fill();

    // 3. Borde metálico dorado de la carta
    const goldBorder = ctx.createLinearGradient(x, y, x + W, y + H);
    goldBorder.addColorStop(0, '#ffe082');
    goldBorder.addColorStop(0.25, '#d4af37');
    goldBorder.addColorStop(0.5, '#fff3b0');
    goldBorder.addColorStop(0.75, '#aa771c');
    goldBorder.addColorStop(1, '#ffd54f');
    ctx.strokeStyle = goldBorder;
    ctx.lineWidth = 2.5;
    drawCardShape(ctx, x, y, W, H);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    drawCardShape(ctx, x + 3, y + 3, W - 6, H - 6);
    ctx.stroke();

    // 4. Rating + Posición (Izquierda)
    const ratingVal = (player.avgRating || 0).toFixed(1);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(ratingVal, x + 14, y + 42);
    ctx.shadowBlur = 0;

    const badgeColor = (posLabel === 'POR' || posLabel === 'GK') ? '#ab47bc'
                     : (posLabel === 'DEF' || posLabel === 'DFC' || posLabel === 'LD' || posLabel === 'LI') ? '#29b6f6'
                     : (posLabel === 'CARR') ? '#26a69a'
                     : (posLabel === 'MED' || posLabel === 'MC' || posLabel === 'MCO' || posLabel === 'MCD') ? '#ffa726'
                     : '#ef5350';

    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.roundRect(x + 14, y + 50, 48, 20, 5);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(posLabel, x + 38, y + 64);

    // 5. Escudo del Equipo (Derecha)
    const logoX = x + W - 52;
    const logoY = y + 14;
    const logoSize = 42;

    const logoGlow = ctx.createRadialGradient(logoX + logoSize/2, logoY + logoSize/2, 5, logoX + logoSize/2, logoY + logoSize/2, 28);
    logoGlow.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
    logoGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = logoGlow;
    ctx.beginPath();
    ctx.arc(logoX + logoSize/2, logoY + logoSize/2, 28, 0, Math.PI * 2);
    ctx.fill();
    if (isValidLogoUrl(player.teamLogo)) {
        try {
            const img = await loadImage(player.teamLogo);
            ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
        } catch (e) {
            drawFallbackShield(ctx, logoX, logoY, logoSize);
        }
    } else {
        drawFallbackShield(ctx, logoX, logoY, logoSize);
    }

    // 6. Línea divisoria dorada
    const sepGrad = ctx.createLinearGradient(x + 12, 0, x + W - 12, 0);
    sepGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    sepGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.7)');
    sepGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.strokeStyle = sepGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 80);
    ctx.lineTo(x + W - 12, y + 80);
    ctx.stroke();

    // 7. Nombre del Jugador
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    const rawName = player.name || 'Desconocido';
    const pName = rawName.length > 15 ? rawName.substring(0, 14) + '…' : rawName;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(pName.toUpperCase(), cx, y + 104);
    ctx.shadowBlur = 0;

    // Nombre del Equipo
    ctx.fillStyle = '#dfba68';
    ctx.font = '600 12px "Segoe UI", Arial, sans-serif';
    const rawTeam = player.teamName || 'VPG Club';
    const tName = rawTeam.length > 18 ? rawTeam.substring(0, 17) + '…' : rawTeam;
    ctx.fillText(tName, cx, y + 122);

    // 8. Tira de estadísticas del jugador
    const statsY = y + 138;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(x + 10, statsY, W - 20, 52, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const goals = player.goals || 0;
    const assists = player.assists || 0;
    const cleanSheets = player.cleanSheets || 0;
    const saves = player.saves || 0;
    const mom = player.mom || 0;
    const tackles = player.tacklesMade || 0;
    const matches = player.gamesPlayed || 1;

    let stat1Label = 'PJ', stat1Val = String(matches);
    let stat2Label = 'GOL', stat2Val = String(goals);
    let stat3Label = 'AST', stat3Val = String(assists);

    const isGk = posLabel === 'POR' || posLabel === 'GK';
    const isDef = posLabel === 'DEF' || posLabel === 'DFC' || posLabel === 'LD' || posLabel === 'LI' || posLabel === 'CARR';

    if (isGk) {
        stat1Label = 'CS'; stat1Val = String(cleanSheets);
        stat2Label = 'PAR'; stat2Val = String(saves);
        stat3Label = 'PJ'; stat3Val = String(matches);
    } else if (isDef) {
        stat1Label = 'REC'; stat1Val = String(tackles);
        stat2Label = 'CS'; stat2Val = String(cleanSheets);
        stat3Label = (goals > 0) ? 'GOL' : (assists > 0 ? 'AST' : 'PJ');
        stat3Val = (goals > 0) ? String(goals) : (assists > 0 ? String(assists) : String(matches));
    } else {
        stat1Label = 'GOL'; stat1Val = String(goals);
        stat2Label = 'AST'; stat2Val = String(assists);
        stat3Label = mom > 0 ? 'MVP' : 'PJ';
        stat3Val = mom > 0 ? String(mom) : String(matches);
    }

    const colW = (W - 20) / 3;
    const drawCol = (label, val, colIdx) => {
        const colX = x + 10 + colIdx * colW + colW / 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val, colX, statsY + 24);

        ctx.fillStyle = 'rgba(255, 215, 0, 0.75)';
        ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        ctx.fillText(label, colX, statsY + 41);
    };

    drawCol(stat1Label, stat1Val, 0);
    drawCol(stat2Label, stat2Val, 1);
    drawCol(stat3Label, stat3Val, 2);

    ctx.restore();
}

function drawFallbackShield(ctx, x, y, size) {
    ctx.save();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.fill();
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('FC', x + size / 2, y + size / 2 + 4);
    ctx.restore();
}

function drawPremiumHeader(ctx, w, tournamentName) {
    const topGrad = ctx.createLinearGradient(0, 0, 0, 160);
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    topGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 160);

    ctx.save();
    const titleGrad = ctx.createLinearGradient(w / 2 - 200, 0, w / 2 + 200, 0);
    titleGrad.addColorStop(0, '#ffd54f');
    titleGrad.addColorStop(0.3, '#ffffff');
    titleGrad.addColorStop(0.5, '#ffd700');
    titleGrad.addColorStop(0.7, '#fff3b0');
    titleGrad.addColorStop(1, '#ffc107');
    ctx.fillStyle = titleGrad;
    ctx.font = '900 48px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('MEJOR 11 DE LA JORNADA', w / 2, 65);
    ctx.restore();

    ctx.save();
    const cleanTitle = tournamentName.toUpperCase();
    const badgeW = Math.min(650, ctx.measureText(cleanTitle).width + 80);
    const badgeH = 34;
    const badgeX = w / 2 - badgeW / 2;
    const badgeY = 88;

    ctx.fillStyle = 'rgba(15, 20, 30, 0.85)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 17);
    ctx.fill();

    const badgeBorder = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
    badgeBorder.addColorStop(0, 'rgba(255, 215, 0, 0.1)');
    badgeBorder.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    badgeBorder.addColorStop(1, 'rgba(255, 215, 0, 0.1)');
    ctx.strokeStyle = badgeBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`-  ${cleanTitle}  -`, w / 2, badgeY + 23);
    ctx.restore();
}

function drawPremiumFooter(ctx, w, h) {
    const footGrad = ctx.createLinearGradient(0, h - 80, 0, h);
    footGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    footGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = footGrad;
    ctx.fillRect(0, h - 80, w, 80);

    ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 60, h - 62, 120, 26, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('3 - 5 - 2', w / 2, h - 44);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('OFFICIAL TOURNAMENT STATS  •  POWERED BY EA SPORTS FC', w / 2, h - 18);
}

// ==========================================
// === EXPORT 1: GENERAR MEJOR 11 ===
// ==========================================
export async function generateBest11Image(tournamentName, best11) {
    const WIDTH = 1100;
    const HEIGHT = 1420;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Fondo de estadio
    drawStadiumPitch(ctx, WIDTH, HEIGHT);

    // 2. Header
    drawPremiumHeader(ctx, WIDTH, tournamentName);

    // 3. Tarjetas FUT de Jugadores (Formación 3-5-2)
    const slots = [
        // DC (2 delanteros arriba)
        { x: 380, y: 260, arr: best11.dcs, idx: 0, label: 'DC' },
        { x: 720, y: 260, arr: best11.dcs, idx: 1, label: 'DC' },
        // CARR (2 carrileros abiertos)
        { x: 135, y: 505, arr: best11.carrs, idx: 0, label: 'CARR' },
        { x: 965, y: 505, arr: best11.carrs, idx: 1, label: 'CARR' },
        // MED (3 medios centros)
        { x: 310, y: 720, arr: best11.meds, idx: 0, label: 'MED' },
        { x: 550, y: 720, arr: best11.meds, idx: 1, label: 'MED' },
        { x: 790, y: 720, arr: best11.meds, idx: 2, label: 'MED' },
        // DEF (3 defensas)
        { x: 310, y: 960, arr: best11.defs, idx: 0, label: 'DEF' },
        { x: 550, y: 960, arr: best11.defs, idx: 1, label: 'DEF' },
        { x: 790, y: 960, arr: best11.defs, idx: 2, label: 'DEF' },
        // GK (1 portero)
        { x: 550, y: 1210, arr: best11.gk, idx: 0, label: 'GK' },
    ];

    for (const slot of slots) {
        const player = slot.arr?.[slot.idx] || null;
        await drawFutCard(ctx, slot.x, slot.y, player, slot.label);
    }

    // 4. Footer
    drawPremiumFooter(ctx, WIDTH, HEIGHT);

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'mejor-11.png' });
}

// ==========================================
// === EXPORT 2: PREMIOS INDIVIDUALES ===
// ==========================================
export async function generateAwardsImage(tournamentName, awards) {
    const WIDTH = 1000;
    const HEIGHT = 720;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Fondo estilo estadio oscuro
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#04070d');
    bg.addColorStop(0.3, '#0b111a');
    bg.addColorStop(0.7, '#07120e');
    bg.addColorStop(1, '#03060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Resplandor radial dorado central
    const centerGlow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 80, WIDTH / 2, HEIGHT / 2, 550);
    centerGlow.addColorStop(0, 'rgba(255, 215, 0, 0.08)');
    centerGlow.addColorStop(0.6, 'rgba(20, 60, 40, 0.15)');
    centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Header
    ctx.save();
    const titleGrad = ctx.createLinearGradient(WIDTH / 2 - 200, 0, WIDTH / 2 + 200, 0);
    titleGrad.addColorStop(0, '#ffd54f');
    titleGrad.addColorStop(0.3, '#ffffff');
    titleGrad.addColorStop(0.5, '#ffd700');
    titleGrad.addColorStop(0.7, '#fff3b0');
    titleGrad.addColorStop(1, '#ffc107');
    ctx.fillStyle = titleGrad;
    ctx.font = '900 42px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText('GALARDONES INDIVIDUALES', WIDTH / 2, 55);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`-  ${tournamentName.toUpperCase()}  -`, WIDTH / 2, 88);
    ctx.restore();

    const awardsList = [
        {
            tag: 'MVP',
            badgeTitle: 'MVP DEL TORNEO',
            player: awards.mvp,
            statValue: awards.mvp ? `${awards.mvp.avgRating.toFixed(1)}` : '-',
            statLabel: 'RATING MEDIO',
            accentColor: '#ffd700'
        },
        {
            tag: 'GOL',
            badgeTitle: 'BOTA DE ORO',
            player: awards.topScorer,
            statValue: awards.topScorer ? `${awards.topScorer.goals || 0}` : '-',
            statLabel: 'GOLES ANOTADOS',
            accentColor: '#00e676'
        },
        {
            tag: 'AST',
            badgeTitle: 'MÁXIMO ASISTENTE',
            player: awards.topAssister,
            statValue: awards.topAssister ? `${awards.topAssister.assists || 0}` : '-',
            statLabel: 'ASISTENCIAS',
            accentColor: '#29b6f6'
        },
        {
            tag: 'GK',
            badgeTitle: 'GUANTE DE ORO (ZAMORA)',
            player: awards.zamora,
            statValue: awards.zamora ? `${awards.zamora.cleanSheets || 0}` : '-',
            statLabel: 'PORTERÍAS A CERO',
            accentColor: '#ab47bc'
        }
    ];

    const cardW = 880;
    const cardH = 115;
    const startY = 125;
    const gap = 20;

    for (let i = 0; i < awardsList.length; i++) {
        const item = awardsList[i];
        const cardX = (WIDTH - cardW) / 2;
        const cardY = startY + i * (cardH + gap);

        // Sombra de tarjeta
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#0f131a';
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 14);
        ctx.fill();
        ctx.restore();

        // Fondo de tarjeta con gradiente
        ctx.save();
        const cardBg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
        cardBg.addColorStop(0, '#161922');
        cardBg.addColorStop(0.5, '#12141c');
        cardBg.addColorStop(1, '#181b26');
        ctx.fillStyle = cardBg;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 14);
        ctx.fill();

        // Borde elegante con acento de color
        const cardBorder = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
        cardBorder.addColorStop(0, item.accentColor);
        cardBorder.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
        cardBorder.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
        cardBorder.addColorStop(1, item.accentColor);
        ctx.strokeStyle = cardBorder;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Insignia circular lateral izquierda
        const badgeX = cardX + 60;
        const badgeY = cardY + cardH / 2;
        const badgeR = 34;

        ctx.fillStyle = item.accentColor;
        ctx.shadowColor = item.accentColor;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#0d1117';
        ctx.font = '900 16px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.tag, badgeX, badgeY + 6);

        // Logo del equipo
        const logoSize = 56;
        const logoX = cardX + 125;
        const logoY = cardY + (cardH - logoSize) / 2;

        if (item.player && isValidLogoUrl(item.player.teamLogo)) {
            try {
                const img = await loadImage(item.player.teamLogo);
                ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
            } catch (e) {
                drawFallbackShield(ctx, logoX, logoY, logoSize);
            }
        } else {
            drawFallbackShield(ctx, logoX, logoY, logoSize);
        }

        // Título del premio + Nombre del jugador
        const infoX = logoX + logoSize + 22;
        ctx.textAlign = 'left';

        ctx.fillStyle = item.accentColor;
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.badgeTitle.toUpperCase(), infoX, cardY + 38);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px "Segoe UI", Arial, sans-serif';
        const pName = item.player?.name ? item.player.name.toUpperCase() : 'SIN DATOS';
        ctx.fillText(pName, infoX, cardY + 70);

        ctx.fillStyle = '#dfba68';
        ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
        const tName = item.player?.teamName || '';
        ctx.fillText(tName, infoX, cardY + 92);

        // Bloque de Estadística Derecha
        const statBlockW = 160;
        const statX = cardX + cardW - statBlockW - 20;
        const statY = cardY + 16;
        const statH = cardH - 32;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.roundRect(statX, statY, statBlockW, statH, 10);
        ctx.fill();
        ctx.strokeStyle = item.accentColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = item.accentColor;
        ctx.font = '900 34px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.statValue, statX + statBlockW / 2, statY + 42);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.statLabel, statX + statBlockW / 2, statY + 62);

        ctx.restore();
    }

    // Footer
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFICIAL AWARDS  •  POWERED BY EA SPORTS FC  •  VPG PRO', WIDTH / 2, HEIGHT - 18);

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'premios-individuales.png' });
}
