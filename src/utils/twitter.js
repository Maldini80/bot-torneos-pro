// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { getBotSettings } from '../../database.js';

// 1. Configuración del Cliente de Twitter
const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// --- INICIO DE LA MODIFICACIÓN ---

// 2. CSS Global para todas las imágenes
const globalCss = `
  body { 
    font-family: 'Helvetica Neue', sans-serif; 
    background-color: #15202B; 
    color: #ffffff;
    margin: 0;
    padding: 0;
  }
  .container { 
    padding: 30px; 
    border: 2px solid #1DA1F2;
    background: linear-gradient(145deg, #192734, #15202B);
  }
  h1 { 
    color: #1DA1F2; 
    font-size: 42px; 
    margin-top: 0;
    margin-bottom: 10px;
    font-weight: 900;
  }
  h2 {
    color: #e1e8ed;
    font-size: 28px;
    margin-bottom: 20px;
    border-bottom: 2px solid #38444d;
    padding-bottom: 10px;
  }
  p { 
    font-size: 20px; 
    margin-bottom: 5px; 
  }
  .label { 
    color: #8899a6; 
    font-weight: bold; 
  }
  .value { 
    color: #ffffff; 
    font-weight: bold; 
  }
  .roster-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 20px;
    font-size: 18px;
  }
  .group-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-bottom: 20px;
  }
  th, td { 
    padding: 10px; 
    text-align: left; 
    border-bottom: 1px solid #38444d; 
    font-size: 16px;
  }
  th { 
    color: #1DA1F2; 
    font-weight: bold;
  }
  .matchup-box {
    text-align: center;
    border: 1px solid #38444d;
    padding: 20px;
    margin-bottom: 15px;
    background-color: #192734;
    border-radius: 10px;
  }
  .vs {
    color: #1DA1F2;
    font-size: 24px;
    font-weight: bold;
    margin: 10px 0;
  }
  .team-name {
    font-size: 28px;
    font-weight: bold;
  }
   .result {
    font-size: 32px;
    font-weight: bold;
    color: #1DA1F2;
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
            body: JSON.stringify({ html: htmlContent, css: globalCss, google_fonts: "Helvetica Neue" })
        });
        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error("[TWITTER] Error al generar imagen con HCTI:", error);
        return null;
    }
}

// 4. Generadores de HTML para cada tipo de anuncio
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

function generateKnockoutMatchupsHtml(data) {
    const { matches, stage, tournament } = data;
    const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
    let matchupsHtml = '';
    matches.forEach(match => {
        matchupsHtml += `
          <div class="matchup-box">
            <div class="team-name">${match.equipoA.nombre}</div>
            <div class="vs">vs</div>
            <div class="team-name">${match.equipoB.nombre}</div>
          </div>`;
    });
    return `
        <div class="container">
            <h1>${stageName} - Cruces</h1>
            <h2>${tournament.nombre}</h2>
            ${matchupsHtml}
        </div>`;
}

function generateMatchResultHtml(data) {
    const { match, tournament } = data;
    const [scoreA, scoreB] = match.resultado.split('-');
    const winner = parseInt(scoreA) > parseInt(scoreB) ? match.equipoA.nombre : match.equipoB.nombre;
    const stageName = match.jornada.charAt(0).toUpperCase() + match.jornada.slice(1);

    return `
        <div class="container">
            <h1>Resultado del Partido</h1>
            <h2>${tournament.nombre} - ${stageName}</h2>
            <div class="matchup-box">
                <div class="team-name">${match.equipoA.nombre}</div>
                <div class="result">${match.resultado}</div>
                <div class="team-name">${match.equipoB.nombre}</div>
            </div>
            <p style="text-align:center;"><span class="label">Ganador:</span> <span class="value">${winner}</span></p>
        </div>`;
}

// 5. Función principal reestructurada para postear en Twitter
export async function postTournamentUpdate(eventType, data) {
    // Comprobamos si la publicación en Twitter está activada globalmente
    const settings = await getBotSettings();
    if (!settings.twitterEnabled) {
        console.log("[TWITTER] La publicación automática está desactivada globalmente, se omite la publicación.");
        return;
    }

    if (!process.env.TWITTER_API_KEY) {
        console.log("[TWITTER] No se han configurado las claves de API, se omite la publicación.");
        return;
    }

    let tweetText = "";
    let htmlContent = null;
    let logMessage = "";

    switch (eventType) {
        case 'INSCRIPCION_ABIERTA': {
            const tournament = data;
            const format = tournament.config.format;
            tweetText = `¡Inscripciones abiertas para el torneo "${tournament.nombre}"! 🏆\n\nFormato: ${format.label}\nTipo: ${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}\n\n¡Apúntate en nuestro Discord! 👇\n\n#eSports`;
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
            htmlContent = generateKnockoutMatchupsHtml(data);
            logMessage = `Tweet de cruces de ${stageName} publicado para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_MATCH_FINISHED': {
            const { match, tournament } = data;
            const [scoreA, scoreB] = match.resultado.split('-');
            const winner = parseInt(scoreA) > parseInt(scoreB) ? match.equipoA.nombre : match.equipoB.nombre;
            tweetText = `¡Resultado final en el torneo "${tournament.nombre}"! ${winner} avanza de ronda tras vencer ${match.resultado} a su rival.\n\n#eSports`;
            htmlContent = generateMatchResultHtml(data);
            logMessage = `Tweet de resultado de partido publicado para ${tournament.nombre}`;
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
        // CASO LEGADO: Para mantener la compatibilidad con llamadas antiguas
        default: {
            const tournament = eventType; // El primer argumento es el objeto del torneo
            if (tournament.status === 'fase_de_grupos') {
                tweetText = `¡Comienza la fase de grupos en el torneo "${tournament.nombre}"! 🔥\n\n¡Mucha suerte a todos los equipos! #eSports`;
                htmlContent = generateGroupTablesHtml(tournament);
                logMessage = `Tweet de actualización (fase de grupos) publicado para ${tournament.nombre}`;
            } else if (tournament.status !== 'inscripcion_abierta' && tournament.status !== 'finalizado') {
                tweetText = `¡Avanzamos a la fase de ${tournament.status.replace('_', ' ')} en el torneo "${tournament.nombre}"! 💥 #eSports`;
                logMessage = `Tweet de actualización simple publicado para ${tournament.nombre}`;
            }
        }
    }

    // Ejecutar la publicación
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
// --- FIN DE LA MODIFICACIÓN ---
