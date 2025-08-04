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

// 2. CSS Global para todas las imágenes (Estilo VPG ProDiarios con logo)
const globalCss = `
  body { 
    font-family: 'Montserrat', sans-serif; 
    background-color: #141414; 
    color: #ffffff;
    margin: 0;
    padding: 0;
    width: 1024px;
    height: 512px;
  }
  .container { 
    padding: 40px; 
    border: 3px solid #C70000;
    background-color: rgba(29, 29, 29, 0.9);
    background-image: url(https://www.rektv.es/wp-content/uploads/2022/11/Recurso-10.png);
    background-position: center;
    background-repeat: no-repeat;
    background-size: 450px;
    position: relative;
    overflow: hidden;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }
  h1, h2, th, .team-name, .value, .label {
    text-transform: uppercase;
  }
  h1 { 
    color: #C70000; 
    font-size: 64px; 
    margin-top: 0;
    margin-bottom: 20px;
    font-weight: 900;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  }
  h2 {
    color: #e1e8ed;
    font-size: 38px;
    margin-bottom: 25px;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    font-weight: 700;
  }
  p { 
    font-size: 24px; 
    margin-bottom: 15px; 
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
    text-align: left;
  }
  .group-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 25px;
    text-align: left;
  }
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-bottom: 20px;
    background-color: rgba(42, 42, 42, 0.8);
    text-align: left;
  }
  th, td { 
    padding: 12px 15px; 
    border-bottom: 1px solid #38444d; 
    font-size: 18px;
  }
  th { 
    color: #C70000; 
    font-weight: 700;
  }
  .matchup-box {
    text-align: center;
    border: 1px solid #333;
    padding: 15px;
    margin-bottom: 15px;
    background-color: rgba(20, 20, 20, 0.8);
    border-radius: 10px;
  }
  .vs {
    color: #C70000;
    font-size: 24px;
    font-weight: 900;
    margin: 8px 0;
  }
  .team-name {
    font-size: 28px;
    font-weight: 700;
  }
   .result {
    font-size: 32px;
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
        return { success: true, url: data.url };
    } catch (error) {
        console.error("[TWITTER] Error al generar imagen con HCTI:", error);
        return { success: false, error: 'Fallo en el servicio de generación de imágenes.' };
    }
}

// 4. Generadores de HTML para cada tipo de anuncio
function generateTournamentAnnouncementHtml(tournament) {
    return `
      <div class="container">
        <h1>¡INSCRIPCIONES ABIERTAS!</h1>
        <h2>${tournament.nombre}</h2>
        <p><span class="label">FORMATO:</span> <span class="value">${tournament.config.format.label}</span></p>
        <p><span class="label">TIPO:</span> <span class="value">${tournament.config.isPaid ? 'DE PAGO' : 'GRATUITO'}</span></p>
      </div>`;
}

function generateNewCaptainHtml(data) {
    const { captainData, draft } = data;
    return `
      <div class="container">
        <h1>NUEVO CAPITÁN APROBADO</h1>
        <h2>DRAFT: ${draft.name}</h2>
        <p><span class="label">EQUIPO:</span> <span class="value">${captainData.teamName}</span></p>
        <p><span class="label">CAPITÁN (PSN ID):</span> <span class="value">${captainData.psnId}</span></p>
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
        <h1>PLANTILLA COMPLETA</h1>
        <h2>${captain.teamName} (DRAFT: ${draft.name})</h2>
        <p><span class="label">CAPITÁN:</span> <span class="value">${captain.psnId}</span></p>
        <div class="roster-grid">
            ${playerItems}
        </div>
      </div>`;
}

function generateGroupStartHtml(tournament) {
    let allGroupsHtml = '';
    const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();

    for (const groupName of sortedGroupNames) {
        const group = tournament.structure.grupos[groupName];
        let tableHtml = `<div><h2>${groupName}</h2>`;
        group.equipos.forEach(team => {
            tableHtml += `<p class="value">${team.nombre}</p>`;
        });
        tableHtml += '</div>';
        allGroupsHtml += tableHtml;
    }
    
    return `<div class="container">
              <h1>¡ARRANCA LA FASE DE GRUPOS!</h1>
              <h2>${tournament.nombre}</h2>
              <div class="group-grid">${allGroupsHtml}</div>
            </div>`;
}

function generateGroupTablesHtml(tournament) {
    let allGroupsHtml = '';
    const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();

    for (const groupName of sortedGroupNames) {
        const group = tournament.structure.grupos[groupName];
        let tableHtml = `<div><h2>${groupName}</h2><table><tr><th>EQUIPO</th><th>PTS</th><th>PJ</th><th>DG</th></tr>`;
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
    
    return `<div class="container">
              <h1>CLASIFICACIÓN FASE DE GRUPOS</h1>
              <h2>${tournament.nombre}</h2>
              <div class="group-grid">${allGroupsHtml}</div>
            </div>`;
}

function generateKnockoutStageHtml(data) {
    const { matches, stage, tournament } = data;
    const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
    const hasResults = matches.some(m => m.resultado);
    const title = hasResults ? `${stageName} - RESULTADOS` : `${stageName} - CRUCES`;
    
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

function generateChampionHtml(tournament) {
    const finalMatch = tournament.structure.eliminatorias.final;
    const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
    const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
    
    return `
      <div class="container">
        <h1>¡TENEMOS CAMPEÓN!</h1>
        <h2 style="font-size: 52px; color: #ffd700;">${champion.nombre}</h2>
        <p><span class="label">TORNEO:</span> <span class="value">${tournament.nombre}</span></p>
      </div>`;
}

// 5. Función principal reestructurada para postear en Twitter y devolver el resultado
export async function postTournamentUpdate(eventType, data, forSimulation = false) {
    const settings = await getBotSettings();
    if (!forSimulation && !settings.twitterEnabled) {
        console.log("[TWITTER] La publicación automática está desactivada globalmente.");
        return { success: false, error: "La publicación automática en Twitter está desactivada." };
    }
    if (!forSimulation && !process.env.TWITTER_API_KEY) {
        console.log("[TWITTER] No se han configurado las claves de API.");
        return { success: false, error: "Las claves de la API de Twitter no están configuradas en el bot." };
    }

    let tweetText = "";
    let htmlContent = null;
    let logMessage = "";

    switch (eventType) {
        case 'INSCRIPCION_ABIERTA': {
            const tournament = data;
            const format = tournament.config.format;
            tweetText = `¡INSCRIPCIONES ABIERTAS PARA EL TORNEO "${tournament.nombre.toUpperCase()}"! 🏆\n\nFORMATO: ${format.label.toUpperCase()}\nTIPO: ${tournament.config.isPaid ? 'DE PAGO' : 'GRATUITO'}\n\n¡APÚNTATE EN NUESTRO DISCORD! 👇\n${DISCORD_INVITE_LINK}\n\n#VPGLightnings`;
            htmlContent = generateTournamentAnnouncementHtml(tournament);
            logMessage = `Tweet de apertura de inscripciones para ${tournament.nombre}`;
            break;
        }
        case 'NEW_CAPTAIN_APPROVED': {
            const { captainData, draft } = data;
            tweetText = `¡DAMOS LA BIENVENIDA AL DRAFT "${draft.name.toUpperCase()}" AL EQUIPO "${captainData.teamName.toUpperCase()}", LIDERADO POR ${captainData.psnId}!\n\n#VPGLightnings`;
            htmlContent = generateNewCaptainHtml(data);
            logMessage = `Tweet de nuevo capitán para ${captainData.teamName}`;
            break;
        }
        case 'ROSTER_COMPLETE': {
            const { captain, draft } = data;
            tweetText = `¡PLANTILLA COMPLETA! 🔥 EL EQUIPO "${captain.teamName.toUpperCase()}", CAPITANEADO POR ${captain.psnId}, HA COMPLETADO SUS 11 JUGADORES PARA EL DRAFT "${draft.name.toUpperCase()}".\n\n#VPGLightnings`;
            htmlContent = generateFullRosterHtml(data);
            logMessage = `Tweet de plantilla completa para ${captain.teamName}`;
            break;
        }
        case 'GROUP_STAGE_START': {
             const tournament = data;
             tweetText = `¡ARRANCA LA FASE DE GRUPOS DEL TORNEO "${tournament.nombre.toUpperCase()}"! 🔥\n\n¡MUCHA SUERTE A TODOS LOS EQUIPOS!\n\n#VPGLightnings`;
             htmlContent = generateGroupStartHtml(tournament);
             logMessage = `Tweet de inicio de fase de grupos para ${tournament.nombre}`;
             break;
        }
        case 'GROUP_STAGE_END': {
            const tournament = data;
            tweetText = `¡FINALIZA LA FASE DE GRUPOS DEL TORNEO "${tournament.nombre.toUpperCase()}"! 🔥\n\nESTAS SON LAS CLASIFICACIONES FINALES. ¡ENHORABUENA A LOS CLASIFICADOS!\n\n#VPGLightnings`;
            htmlContent = generateGroupTablesHtml(tournament);
            logMessage = `Tweet de fin de fase de grupos para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_MATCHUPS_CREATED': {
            const { stage, tournament } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡ARRANCAN LOS ${stageName.toUpperCase()} DEL TORNEO "${tournament.nombre.toUpperCase()}"! 💥\n\nESTOS SON LOS ENFRENTAMIENTOS. ¡QUE GANE EL MEJOR!\n\n#VPGLightnings`;
            htmlContent = generateKnockoutStageHtml(data);
            logMessage = `Tweet de cruces de ${stageName} para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_ROUND_COMPLETE': {
            const { stage, tournament, matches } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡RESULTADOS FINALES DE ${stageName.toUpperCase()} EN EL TORNEO "${tournament.nombre.toUpperCase()}"!\n\nASÍ QUEDAN LOS MARCADORES DE ESTA RONDA. ¡LOS GANADORES AVANZAN!\n\n#VPGLightnings`;
            htmlContent = generateKnockoutStageHtml({ matches, stage, tournament });
            logMessage = `Tweet de resultados de ${stageName} para ${tournament.nombre}`;
            break;
        }
        case 'FINALIZADO': {
            const tournament = data;
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch && finalMatch.resultado) {
                tweetText = `¡TENEMOS CAMPEÓN! 🏆\n\nFELICIDADES AL EQUIPO "${champion.nombre.toUpperCase()}" POR GANAR EL TORNEO "${tournament.nombre.toUpperCase()}". ¡GRAN ACTUACIÓN!\n\n#VPGLightnings`;
                htmlContent = generateChampionHtml(tournament);
            } else {
                tweetText = `EL TORNEO "${tournament.nombre.toUpperCase()}" HA FINALIZADO. ¡GRACIAS A TODOS POR PARTICIPAR!`;
                htmlContent = null;
            }
            logMessage = `Tweet de finalización para ${tournament.nombre}`;
            break;
        }
        default: {
            console.warn(`[TWITTER] Evento no reconocido: ${eventType}`);
            return null;
        }
    }

    try {
        if (htmlContent) {
            const imageResult = await generateHtmlImage(htmlContent);
            if (!imageResult.success) throw new Error(imageResult.error);

            if (forSimulation) {
                return { success: true, imageUrl: imageResult.url };
            }

            const imageResponse = await fetch(imageResult.url);
            const imageBuffer = await imageResponse.arrayBuffer();
            const mediaId = await client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType: 'image/png' });
            
            const tweetResult = await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
            if (tweetResult.data && tweetResult.data.id) {
                const tweetUrl = `https://twitter.com/i/web/status/${tweetResult.data.id}`;
                console.log(`[TWITTER] ${logMessage}`);
                return { success: true, url: tweetUrl };
            }
        }
        
        if (forSimulation) return { success: true, imageUrl: null };

        const tweetResult = await twitterClient.v2.tweet({ text: tweetText });
        if (tweetResult.data && tweetResult.data.id) {
            const tweetUrl = `https://twitter.com/i/web/status/${tweetResult.data.id}`;
            console.log(`[TWITTER] ${logMessage}`);
            return { success: true, url: tweetUrl };
        }
        
        return { success: true, url: null };

    } catch (e) {
        console.error(`[TWITTER] Error al publicar tweet para el evento ${eventType}:`, e);
        let errorMessage = 'Error desconocido al intentar publicar.';
        if (e.code === 429 || (e.data && e.data.title === 'Too Many Requests')) {
            errorMessage = 'Límite de tweets alcanzado. La API de Twitter bloqueó la publicación temporalmente.';
        } else if (e.errors && e.errors.length > 0 && e.errors[0].message) {
            errorMessage = e.errors[0].message;
        } else if (e.message) {
            errorMessage = e.message;
        }
        return { success: false, error: errorMessage };
    }
}
