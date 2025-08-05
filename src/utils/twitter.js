// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { getBotSettings } from '../../database.js';

// --- INICIO DE MODIFICACIONES ---

// 1. Enlace de Discord y Hashtag Global
const DISCORD_INVITE_LINK = 'https://discord.gg/zEy9ztp8QM';
const GLOBAL_HASHTAG = '#VPGLightnings';
const LOGO_URL_BACKGROUND = 'https://i.imgur.com/GZQLl0g.png'; // He subido tu logo a Imgur para tener una URL estable y con fondo transparente

// --- FIN DE MODIFICACIONES ---

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// --- INICIO DE MODIFICACIONES CSS ---

// 2. CSS Global Modificado
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

  body { 
    /* Usamos la nueva fuente 'Orbitron' */
    font-family: 'Orbitron', sans-serif; 
    background-color: #f0f0f0; /* Fondo claro para que el logo negro se vea */
    color: #141414; /* Texto oscuro para contraste */
    margin: 0;
    padding: 0;
    /* Todo el texto en mayúsculas */
    text-transform: uppercase;
  }
  .container { 
    padding: 40px; 
    border: 4px solid #000000;
    background: rgba(255, 255, 255, 0.85); /* Fondo blanco semitransparente */
    position: relative;
    overflow: hidden;
    /* Añadimos la imagen de fondo */
    background-image: url('${LOGO_URL_BACKGROUND}');
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
  }
  h1 { 
    color: #C70000; 
    font-size: 52px; 
    margin-top: 0;
    margin-bottom: 20px;
    font-weight: 900;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
  }
  h2 {
    color: #333333;
    font-size: 36px;
    margin-bottom: 25px;
    border-bottom: 3px solid #ddd;
    padding-bottom: 10px;
    font-weight: 700;
  }
  p { 
    font-size: 24px; 
    margin-bottom: 15px; 
  }
  .label { 
    color: #555; 
    font-weight: 400; 
  }
  .value { 
    color: #000000; 
    font-weight: 700; 
  }
  .roster-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px 30px;
    font-size: 22px;
  }
  .group-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-bottom: 20px;
    background-color: rgba(255, 255, 255, 0.6);
  }
  th, td { 
    padding: 14px 18px; 
    text-align: left; 
    border-bottom: 1px solid #ccc; 
    font-size: 20px;
  }
  th { 
    color: #C70000; 
    font-weight: 700;
  }
  .matchup-box {
    text-align: center;
    border: 2px solid #ccc;
    padding: 25px;
    margin-bottom: 20px;
    background-color: rgba(255, 255, 255, 0.7);
    border-radius: 10px;
  }
  .vs {
    color: #C70000;
    font-size: 32px;
    font-weight: 900;
    margin: 12px 0;
  }
  .team-name {
    font-size: 34px;
    font-weight: 700;
  }
   .result {
    font-size: 40px;
    font-weight: 900;
    color: #C70000;
    margin: 8px 0;
  }
`;
// --- FIN DE MODIFICACIONES CSS ---

async function generateHtmlImage(htmlContent) {
    try {
        const response = await fetch('https://hcti.io/v1/image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(process.env.HCTI_API_USER_ID + ':' + process.env.HCTI_API_KEY).toString('base64')
            },
            // Le pasamos el nombre de la fuente de Google Fonts que queremos usar
            body: JSON.stringify({ html: htmlContent, css: globalCss, google_fonts: "Orbitron:wght@400;700;900" })
        });
        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error("[TWITTER] Error al generar imagen con HCTI:", error);
        return null;
    }
}

// Generadores de HTML sin cambios en su lógica interna, solo se verán afectados por el nuevo CSS.
function generateTournamentAnnouncementHtml(tournament) {
    return `
      <div class="container">
        <h1>¡Inscripciones Abiertas!</h1>
        <h2>${tournament.nombre}</h2>
        <p><span class="label">Formato:</span> <span class="value">${tournament.config.format.label}</span></p>
        <p><span class="label">Tipo:</span> <span class="value">${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}</span></p>
      </div>`;
}

function generateNewCaptainHtml(data) {
    const { captainData, draft } = data;
    return `
      <div class="container">
        <h1>Nuevo Capitán Aprobado</h1>
        <h2>Draft: ${draft.name}</h2>
        <p><span class="label">Equipo:</span> <span class="value">${captainData.teamName}</span></p>
        <p><span class="label">Capitán (PSN ID):</span> <span class="value">${captainData.psnId}</span></p>
      </div>`;
}

function generateFullRosterHtml(data) {
    const { captain, players, draft } = data;
    const playerItems = players
        .filter(p => !p.isCaptain)
        .map(p => `<div class="value">• ${p.psnId}</div>`)
        .join('');
    return `
      <div class="container">
        <h1>Plantilla Completa</h1>
        <h2>${captain.teamName} (Draft: ${draft.name})</h2>
        <p><span class="label">Capitán:</span> <span class="value">${captain.psnId}</span></p>
        <div class="roster-grid">
            ${playerItems}
        </div>
      </div>`;
}

function generateGroupTablesHtml(tournament) {
    let allGroupsHtml = '';
    const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();

    for (const groupName of sortedGroupNames) {
        const group = tournament.structure.grupos[groupName];
        let tableHtml = `<div><h2>${groupName}</h2><table><tr><th>Equipo</th><th>Pts</th><th>PJ</th><th>DG</th></tr>`;
        const sortedTeams = [...group.equipos].sort((a, b) => {
            if (b.stats.pts !== a.stats.pts) return b.stats.pts - a.stats.pts;
            return b.stats.dg - a.stats.dg;
        });
        sortedTeams.forEach(team => {
            tableHtml += `<tr><td>${team.nombre}</td><td>${team.stats.pts}</td><td>${team.stats.pj}</td><td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td></tr>`;
        });
        tableHtml += '</table></div>';
        allGroupsHtml += tableHtml;
    }
    
    return `<div class="container"><h1>Clasificación Fase de Grupos</h1><div class="group-grid">${allGroupsHtml}</div></div>`;
}

function generateKnockoutStageHtml(data) {
    const { matches, stage, tournament } = data;
    const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
    const hasResults = matches.some(m => m.resultado);
    const title = hasResults ? `${stageName} - Resultados` : `${stageName} - Cruces`;
    
    let matchupsHtml = '';
    matches.forEach(match => {
        const centerContent = match.resultado 
            ? `<div class="result">${match.resultado}</div>` 
            : `<div class="vs">vs</div>`;
        
        matchupsHtml += `
          <div class="matchup-box">
            <div class="team-name">${match.equipoA.nombre}</div>
            ${centerContent}
            <div class="team-name">${match.equipoB.nombre}</div>
          </div>`;
    });
    return `
        <div class="container">
            <h1>${title}</h1>
            <h2>${tournament.nombre}</h2>
            ${matchupsHtml}
        </div>`;
}

// --- INICIO DE MODIFICACIONES ---

// Función para obtener el @ de Twitter si existe
function getTwitterHandle(team) {
    if (team && team.twitter && !team.twitter.includes(' ') && !team.twitter.includes('/')) {
        return `@${team.twitter}`;
    }
    return team.nombre; // Si no hay Twitter, devuelve el nombre del equipo
}

// 5. Función principal reestructurada para postear en Twitter
export async function postTournamentUpdate(eventType, data) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled) {
        console.log("[TWITTER] La publicación automática está desactivada globalmente.");
        return;
    }
    if (!process.env.TWITTER_API_KEY) {
        console.log("[TWITTER] No se han configurado las claves de API.");
        return;
    }

    let tweetText = "";
    let htmlContent = null;
    let logMessage = "";

    switch (eventType) {
        case 'INSCRIPCION_ABIERTA': {
            const tournament = data;
            const format = tournament.config.format;
            tweetText = `¡Inscripciones abiertas para "${tournament.nombre}"! 🏆\n\nFormato: ${format.label}\nTipo: ${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}\n\n¡Únete y compite! 👇\n${DISCORD_INVITE_LINK}\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateTournamentAnnouncementHtml(tournament);
            logMessage = `Tweet de apertura de inscripciones publicado para ${tournament.nombre}`;
            break;
        }
        case 'NEW_CAPTAIN_APPROVED': {
            const { captainData, draft } = data;
            const twitterHandle = getTwitterHandle(captainData);
            tweetText = `¡Bienvenido al draft "${draft.name}", ${twitterHandle}! Mucha suerte en la competición. 캡틴을 환영합니다!\n\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
            htmlContent = generateNewCaptainHtml(data);
            logMessage = `Tweet de nuevo capitán publicado para ${captainData.teamName}`;
            break;
        }
        case 'ROSTER_COMPLETE': {
            const { captain, draft } = data;
            const twitterHandle = getTwitterHandle(captain);
            tweetText = `¡Plantilla completa! 🔥 El equipo de ${twitterHandle} ha completado sus 11 jugadores para el draft "${draft.name}".\n\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
            htmlContent = generateFullRosterHtml(data);
            logMessage = `Tweet de plantilla completa publicado para ${captain.teamName}`;
            break;
        }
        case 'GROUP_STAGE_END': {
            const tournament = data;
            tweetText = `¡Finaliza la fase de grupos de "${tournament.nombre}"! 🔥\n\nAquí están las clasificaciones. ¡Enhorabuena a los clasificados!\n\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
            htmlContent = generateGroupTablesHtml(tournament);
            logMessage = `Tweet de fin de fase de grupos publicado para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_MATCHUPS_CREATED': {
            const { stage, tournament, matches } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            // Mencionamos a los equipos en los cruces
            const mentions = matches.map(m => `${getTwitterHandle(m.equipoA)} vs ${getTwitterHandle(m.equipoB)}`).join('\n');
            tweetText = `¡Arrancan los ${stageName} de "${tournament.nombre}"! 💥\n\n${mentions}\n\n¡Que gane el mejor!\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
            htmlContent = generateKnockoutStageHtml(data);
            logMessage = `Tweet de cruces de ${stageName} publicado para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_ROUND_COMPLETE': {
            const { stage, tournament, matches } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡Resultados finales de ${stageName} en "${tournament.nombre}"!\n\nAsí quedan los marcadores. ¡Los ganadores avanzan!\n\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
            htmlContent = generateKnockoutStageHtml({ matches, stage, tournament });
            logMessage = `Tweet de resultados de ${stageName} publicado para ${tournament.nombre}`;
            break;
        }
        case 'FINALIZADO': {
            const tournament = data;
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch && finalMatch.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                const championHandle = getTwitterHandle(champion);
                tweetText = `¡Tenemos un campeón! 🏆\n\nFelicidades a ${championHandle} por ganar "${tournament.nombre}". ¡Gran actuación!\n\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
                // Generamos imagen para el campeón
                htmlContent = `<div class="container"><h1>¡Campeones!</h1><h2>${tournament.nombre}</h2><div class="team-name">${champion.nombre}</div></div>`;
            } else {
                tweetText = `El torneo "${tournament.nombre}" ha finalizado. ¡Gracias a todos por participar!\n\n${DISCORD_INVITE_LINK}\n${GLOBAL_HASHTAG}`;
            }
            logMessage = `Tweet de finalización publicado para ${tournament.nombre}`;
            break;
        }
    }
    // --- FIN DE MODIFICACIONES ---

    try {
        // La lógica para generar imagen para todos los tweets ahora es estándar
        const imageUrl = await generateHtmlImage(htmlContent);
        if (!imageUrl) throw new Error("No se pudo obtener la URL de la imagen.");
        
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const mediaId = await client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType: 'image/png' });
        
        await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
        console.log(`[TWITTER] ${logMessage} (con imagen)`);
        
    } catch (e) {
        console.error(`[TWITTER] Error al publicar tweet para el evento ${eventType}:`, e);
    }
}
