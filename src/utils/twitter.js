// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { getBotSettings } from '../../database.js';
import { DISCORD_INVITE_LINK } from '../../config.js';

// 1. Configuración del Cliente de Twitter
const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// --- INICIO DE LA MODIFICACIÓN ---

// 2. CSS Global para todas las imágenes (Estilo VPG ProDiarios)
const globalCss = `
  body { 
    font-family: 'Montserrat', sans-serif; 
    background-color: #141414; 
    color: #ffffff;
    margin: 0;
    padding: 0;
  }
  .container { 
    padding: 40px; 
    border: 3px solid #C70000;
    background: #1D1D1D;
    position: relative;
    overflow: hidden;
  }
   .container::before {
    content: 'VPG';
    position: absolute;
    top: -50px;
    left: -50px;
    font-size: 200px;
    font-weight: 900;
    color: rgba(255, 255, 255, 0.03);
    transform: rotate(-20deg);
  }
  h1 { 
    color: #C70000; 
    font-size: 48px; 
    margin-top: 0;
    margin-bottom: 15px;
    font-weight: 900;
    text-transform: uppercase;
  }
  h2 {
    color: #e1e8ed;
    font-size: 32px;
    margin-bottom: 25px;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    font-weight: 700;
  }
  p { 
    font-size: 22px; 
    margin-bottom: 10px; 
  }
  .label { 
    color: #8899a6; 
    font-weight: 400; 
  }
  .value { 
    color: #ffffff; 
    font-weight: 700; 
  }
  .roster-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 25px;
    font-size: 20px;
  }
  .group-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 25px;
  }
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-bottom: 20px;
    background-color: #2a2a2a;
  }
  th, td { 
    padding: 12px 15px; 
    text-align: left; 
    border-bottom: 1px solid #38444d; 
    font-size: 18px;
  }
  th { 
    color: #C70000; 
    font-weight: 700;
    text-transform: uppercase;
  }
  .matchup-box {
    text-align: center;
    border: 1px solid #333;
    padding: 20px;
    margin-bottom: 15px;
    background-color: #141414;
    border-radius: 10px;
  }
  .vs {
    color: #C70000;
    font-size: 28px;
    font-weight: 900;
    margin: 10px 0;
  }
  .team-name {
    font-size: 30px;
    font-weight: 700;
  }
   .result {
    font-size: 36px;
    font-weight: 900;
    color: #C70000;
    margin: 5px 0;
  }
`;

// 3. Función mejorada para generar la imagen desde HTML
async function generateHtmlImage(htmlContent) {
    try {
        const response = await fetch('https://hcti.io/v1/image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(process.env.HCTI_API_USER_ID + ':' + process.env.HCTI_API_KEY).toString('base64')
            },
            body: JSON.stringify({ html: htmlContent, css: globalCss, google_fonts: "Montserrat:wght@400;700;900" })
        });
        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error("[TWITTER] Error al generar imagen con HCTI:", error);
        return null;
    }
}

// 4. Generadores de HTML para cada tipo de anuncio
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
            tweetText = `¡Inscripciones abiertas para el torneo "${tournament.nombre}"! 🏆\n\nFormato: ${format.label}\nTipo: ${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}\n\n¡Apúntate en nuestro Discord! 👇\n${DISCORD_INVITE_LINK}\n\n#eSports`;
            htmlContent = generateTournamentAnnouncementHtml(tournament);
            logMessage = `Tweet de apertura de inscripciones publicado para ${tournament.nombre}`;
            break;
        }
        case 'NEW_CAPTAIN_APPROVED': {
            const { captainData, draft } = data;
            tweetText = `¡Damos la bienvenida al draft "${draft.name}" al equipo "${captainData.teamName}", liderado por ${captainData.psnId}! 캡틴을 환영합니다!\n\n#eSports #Draft`;
            htmlContent = generateNewCaptainHtml(data);
            logMessage = `Tweet de nuevo capitán publicado para ${captainData.teamName}`;
            break;
        }
        case 'ROSTER_COMPLETE': {
            const { captain, draft } = data;
            tweetText = `¡Plantilla completa! 🔥 El equipo "${captain.teamName}", capitaneado por ${captain.psnId}, ha completado sus 11 jugadores para el draft "${draft.name}".\n\n#eSports #Draft`;
            htmlContent = generateFullRosterHtml(data);
            logMessage = `Tweet de plantilla completa publicado para ${captain.teamName}`;
            break;
        }
        case 'GROUP_STAGE_END': {
            const tournament = data;
            tweetText = `¡Finaliza la fase de grupos del torneo "${tournament.nombre}"! 🔥\n\nAquí están las clasificaciones finales. ¡Enhorabuena a los clasificados!\n\n#eSports`;
            htmlContent = generateGroupTablesHtml(tournament);
            logMessage = `Tweet de fin de fase de grupos publicado para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_MATCHUPS_CREATED': {
            const { stage, tournament } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡Arrancan los ${stageName} del torneo "${tournament.nombre}"! 💥\n\nEstos son los enfrentamientos. ¡Que gane el mejor!\n\n#eSports`;
            htmlContent = generateKnockoutStageHtml(data);
            logMessage = `Tweet de cruces de ${stageName} publicado para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_ROUND_COMPLETE': {
            const { stage, tournament } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡Resultados finales de ${stageName} en el torneo "${tournament.nombre}"!\n\nAsí quedan los marcadores de esta ronda. ¡Los ganadores avanzan!\n\n#eSports`;
            htmlContent = generateKnockoutStageHtml(data);
            logMessage = `Tweet de resultados de ${stageName} publicado para ${tournament.nombre}`;
            break;
        }
        case 'FINALIZADO': {
            const tournament = data;
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch && finalMatch.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                tweetText = `¡Tenemos un campeón! 🏆\n\nFelicidades al equipo "${champion.nombre}" por ganar el torneo "${tournament.nombre}". ¡Gran actuación! #eSports #Campeones`;
            } else {
                tweetText = `El torneo "${tournament.nombre}" ha finalizado. ¡Gracias a todos por participar!`;
            }
            logMessage = `Tweet de finalización publicado para ${tournament.nombre}`;
            break;
        }
    }

    try {
        if (htmlContent) {
            const imageUrl = await generateHtmlImage(htmlContent);
            if (!imageUrl) throw new Error("No se pudo obtener la URL de la imagen.");
            const imageResponse = await fetch(imageUrl);
            const imageBuffer = await imageResponse.arrayBuffer();
            const mediaId = await client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType: 'image/png' });
            await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
            console.log(`[TWITTER] ${logMessage} (con imagen)`);
        } else if (tweetText) {
            await twitterClient.v2.tweet(tweetText);
            console.log(`[TWITTER] ${logMessage} (solo texto)`);
        }
    } catch (e) {
        console.error(`[TWITTER] Error al publicar tweet para el evento ${eventType}:`, e);
    }
}
