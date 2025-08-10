// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { getBotSettings } from '../../database.js';

// --- CONFIGURACIÓN GLOBAL ---
const DISCORD_INVITE_LINK = 'https://discord.gg/zEy9ztp8QM';
const GLOBAL_HASHTAG = '#VPGLightnings';
const BACKGROUND_IMAGE_URL = 'https://i.imgur.com/q3qh98T.jpeg';

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// --- CSS CON LA SOLUCIÓN DEFINITIVA A PRUEBA DE CACHÉ ---
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');

  body { 
    font-family: 'Montserrat', sans-serif; 
    color: #ffffff;
    margin: 0;
    padding: 0;
    width: 1024px;
    height: 512px;
    
    /* SOLUCIÓN 1: El fondo se aplica aquí, en la capa principal */
    background-image: url('${BACKGROUND_IMAGE_URL}?v=${new Date().getTime()}'); /* <-- El truco anti-caché */
    background-size: cover;
    background-position: center;
  }
  .container { 
    padding: 40px; 
    border: 3px solid #C70000;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    
    /* SOLUCIÓN 2: El contenedor ahora es solo una caja transparente */
    background-color: rgba(0, 0, 0, 0); /* <-- Fondo totalmente transparente */
  }
  h1, h2, th, .team-name, .value, .label, p {
    text-transform: uppercase;
    /* Mantenemos la sombra para asegurar la legibilidad */
    text-shadow: 2px 2px 5px rgba(0,0,0,0.9);
  }
  h1 { 
    color: #C70000; 
    font-size: 64px; 
    margin: 0 0 20px 0;
    font-weight: 900;
  }
  h2 {
    color: #e1e8ed;
    font-size: 38px;
    margin-bottom: 25px;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    font-weight: 700;
  }
  p { font-size: 24px; margin-bottom: 15px; }
  .label { color: #8899a6; }
  .value { color: #ffffff; font-weight: 700; }
  .group-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; text-align: left; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: rgba(42, 42, 42, 0.8); text-align: left; }
  th, td { padding: 12px 15px; border-bottom: 1px solid #38444d; font-size: 18px; }
  th { color: #C70000; font-weight: 700; }
  .matchup-box { text-align: center; border: 1px solid #333; padding: 15px; margin-bottom: 15px; background-color: rgba(20, 20, 20, 0.8); border-radius: 10px; }
  .vs { color: #C70000; font-size: 24px; font-weight: 900; margin: 8px 0; }
  .team-name { font-size: 28px; font-weight: 700; }
  .result { font-size: 32px; font-weight: 900; color: #C70000; margin: 5px 0; }
`;

export async function generateHtmlImage(htmlContent) {
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
        if (data.url) {
            return { success: true, url: data.url };
        } else {
            console.error("[TWITTER] HCTI no devolvió una URL. Respuesta:", data);
            return { success: false, error: data.error || 'El servicio de imágenes no devolvió una URL.' };
        }
    } catch (error) {
        console.error("[TWITTER] Error de red al contactar con HCTI:", error);
        return { success: false, error: 'Fallo al contactar con el servicio de generación de imágenes.' };
    }
}

function generateTournamentAnnouncementHtml(tournament) {
    return `
      <div class="container">
        <h1>¡Inscripciones Abiertas!</h1>
        <h2>${tournament.nombre}</h2>
        <p><span class="label">Formato:</span> <span class="value">${tournament.config.format.label}</span></p>
        <p><span class="label">Tipo:</span> <span class="value">${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}</span></p>
      </div>`;
}

function generateGroupStartHtml(tournament) {
    let allGroupsHtml = '';
    const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();
    for (const groupName of sortedGroupNames) {
        const group = tournament.structure.grupos[groupName];
        let tableHtml = `<div><h2>${groupName}</h2>`;
        group.equipos.forEach(team => { tableHtml += `<p class="value">${team.nombre}</p>`; });
        tableHtml += '</div>';
        allGroupsHtml += tableHtml;
    }
    return `<div class="container"><h1>¡Arranca la Fase de Grupos!</h1><h2>${tournament.nombre}</h2><div class="group-grid">${allGroupsHtml}</div></div>`;
}

function generateChampionHtml(tournament) {
    const finalMatch = tournament.structure.eliminatorias.final;
    const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
    const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
    return `<div class="container"><h1>¡Tenemos Campeón!</h1><h2 style="font-size: 52px; color: #ffd700;">${champion.nombre}</h2><p><span class="label">Torneo:</span> <span class="value">${tournament.nombre}</span></p></div>`;
}

function generateGroupEndHtml(tournament) {
    let allGroupsHtml = '';
    const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();

    const sortTeams = (a, b) => {
        if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
        if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
        if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;
        return 0;
    };

    for (const groupName of sortedGroupNames) {
        const group = tournament.structure.grupos[groupName];
        const sortedTeams = [...group.equipos].sort(sortTeams);
        
        let tableHtml = `<div><h2>${groupName}</h2><table>`;
        tableHtml += `<tr><th>EQUIPO</th><th>PTS</th><th>DG</th></tr>`;
        sortedTeams.forEach(team => {
            tableHtml += `<tr><td>${team.nombre}</td><td>${team.stats.pts}</td><td>${team.stats.dg}</td></tr>`;
        });
        tableHtml += '</table></div>';
        allGroupsHtml += tableHtml;
    }

    return `<div class="container"><h1>¡Clasificación Final de Grupos!</h1><h2>${tournament.nombre}</h2><div class="group-grid">${allGroupsHtml}</div></div>`;
}

function generateKnockoutMatchupsHtml(data) {
    const { matches, stage, tournament } = data;
    let matchupsHtml = '';

    matches.forEach(match => {
        matchupsHtml += `
            <div class="matchup-box">
                <div class="team-name">${match.equipoA.nombre}</div>
                <div class="vs">VS</div>
                <div class="team-name">${match.equipoB.nombre}</div>
            </div>`;
    });

    const stageTitles = {
        octavos: '¡Tenemos los cruces de Octavos!',
        cuartos: '¡Arrancan los Cuartos de Final!',
        semifinales: '¡Definidas las Semifinales!',
        final: '¡Esta es la Gran Final!'
    };

    return `
        <div class="container">
            <h1>${stageTitles[stage] || `Cruces de ${stage}`}</h1>
            <h2>${tournament.nombre}</h2>
            <div>${matchupsHtml}</div>
        </div>`;
}

function generateNewCaptainHtml(data) {
    const { captainData, draft } = data;
    const captainIdentifier = captainData.twitter ? `@${captainData.twitter}` : captainData.psnId;
    return `
      <div class="container">
        <h1>¡Nuevo Capitán en el Draft!</h1>
        <h2>${draft.name}</h2>
        <div class="matchup-box" style="background-color: transparent; border: none;">
            <p class="label">Equipo</p>
            <div class="team-name">${captainData.teamName}</div>
            <p class="label" style="margin-top: 20px;">Capitán</p>
            <div class="team-name" style="color: #e1e8ed;">${captainIdentifier}</div>
        </div>
      </div>`;
}

function generateRosterCompleteHtml(data) {
    const { captain, players, draft } = data;
    const captainPlayer = players.find(p => p.isCaptain);
    const selectedPlayers = players.filter(p => !p.isCaptain).sort((a, b) => a.psnId.localeCompare(b.psnId));
    let playerListHtml = '<ul style="list-style: none; padding: 0; text-align: center; columns: 2;">';
    selectedPlayers.forEach(player => {
        playerListHtml += `<li style="font-size: 20px; margin-bottom: 8px;">${player.psnId}</li>`;
    });
    playerListHtml += '</ul>';

    return `
        <div class="container">
            <h1>¡Plantilla Completa!</h1>
            <h2 style="color: #e1e8ed;">${captain.teamName}</h2>
            <p class="label">Capitán: <span class="value">${captainPlayer.psnId}</span></p>
            <div style="margin-top: 20px;">
                ${playerListHtml}
            </div>
        </div>`;
}

function generateKnockoutResultsHtml(data) {
    const { matches, stage, tournament } = data;
    let resultsHtml = '';
    const stageTitles = {
        octavos: 'Resultados de Octavos',
        cuartos: 'Resultados de Cuartos',
        semifinales: 'Resultados de Semifinales'
    };

    matches.forEach(match => {
        const [scoreA, scoreB] = match.resultado.split('-').map(Number);
        const winner = scoreA > scoreB ? match.equipoA : match.equipoB;
        const loser = scoreA > scoreB ? match.equipoB : match.equipoA;
        const winnerScore = scoreA > scoreB ? scoreA : scoreB;
        const loserScore = scoreA > scoreB ? scoreB : scoreA;

        resultsHtml += `
            <div class="matchup-box">
                <div class="team-name" style="color: #ffffff; font-weight: 900;">${winner.nombre}</div>
                <div class="result">${winnerScore} - ${loserScore}</div>
                <div class="team-name" style="color: #8899a6; text-decoration: line-through;">${loser.nombre}</div>
            </div>`;
    });

    return `
        <div class="container">
            <h1>${stageTitles[stage] || `Resultados de ${stage}`}</h1>
            <h2>${tournament.nombre}</h2>
            <div>${resultsHtml}</div>
        </div>`;
}

export async function postTournamentUpdate(eventType, data) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled) {
        console.log("[TWITTER] La publicación automática está desactivada globalmente.");
        return { success: false, error: "Twitter está desactivado." };
    }
    if (!process.env.TWITTER_API_KEY) {
        console.log("[TWITTER] No se han configurado las claves de API.");
        return { success: false, error: "Claves de API de Twitter no configuradas." };
    }

    let tweetText = "";
    let htmlContent = null;
    let logMessage = "";

    switch (eventType) {
        case 'INSCRIPCION_ABIERTA': {
            const tournament = data;
            tweetText = `¡INSCRIPCIONES ABIERTAS!\n\nTORNEO: "${tournament.nombre.toUpperCase()}" 🏆\n\n¡Apúntate en nuestro Discord! 👇\n${DISCORD_INVITE_LINK}\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateTournamentAnnouncementHtml(tournament);
            logMessage = `Tweet de apertura de inscripciones para ${tournament.nombre}`;
            break;
        }
        case 'GROUP_STAGE_START': {
             const tournament = data;
             tweetText = `¡ARRANCA LA FASE DE GRUPOS DEL TORNEO "${tournament.nombre.toUpperCase()}"! 🔥\n\n¡Mucha suerte a todos los equipos!\n\n${GLOBAL_HASHTAG}`;
             htmlContent = generateGroupStartHtml(tournament);
             logMessage = `Tweet de inicio de fase de grupos para ${tournament.nombre}`;
             break;
        }
        case 'GROUP_STAGE_END': {
            const tournament = data;
            tweetText = `¡FASE DE GRUPOS FINALIZADA!\n\nAsí quedan las tablas del torneo "${tournament.nombre.toUpperCase()}". ¡Enhorabuena a los clasificados! 🔥\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateGroupEndHtml(tournament);
            logMessage = `Tweet de clasificación final de grupos para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_MATCHUPS_CREATED': {
            const { stage, tournament } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡TENEMOS LOS CRUCES DE ${stageName.toUpperCase()}!\n\nEstos son los enfrentamientos del torneo "${tournament.nombre.toUpperCase()}". ¡Que gane el mejor! ⚔️\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateKnockoutMatchupsHtml(data);
            logMessage = `Tweet de cruces de ${stageName} para ${tournament.nombre}`;
            break;
        }
        case 'KNOCKOUT_ROUND_COMPLETE': {
            const { stage, tournament } = data;
            const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
            tweetText = `¡RESULTADOS FINALES DE ${stageName.toUpperCase()}!\n\nEstos son los marcadores de la última ronda del torneo "${tournament.nombre.toUpperCase()}". ¡Enhorabuena a los ganadores! 👏\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateKnockoutResultsHtml(data);
            logMessage = `Tweet de resultados de ${stageName} para ${tournament.nombre}`;
            break;
        }
        case 'NEW_CAPTAIN_APPROVED': {
            const { captainData, draft } = data;
            const captainMention = captainData.twitter ? `@${captainData.twitter}` : captainData.psnId;
            tweetText = `¡Nuevo equipo en el Draft "${draft.name.toUpperCase()}"! 🔥\n\nLe damos la bienvenida a "${captainData.teamName.toUpperCase()}" con su capitán ${captainMention}.\n\n¡Inscríbete! 👇\n${DISCORD_INVITE_LINK}\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateNewCaptainHtml(data);
            logMessage = `Tweet de nuevo capitán ${captainData.teamName} para el draft ${draft.name}`;
            break;
        }
        case 'ROSTER_COMPLETE': {
            const { captain, draft } = data;
            tweetText = `¡PLANTILLA COMPLETA! ✅\n\nEl equipo "${captain.teamName.toUpperCase()}" ha completado su roster para el Draft "${draft.name.toUpperCase()}".\n\n¡Mucha suerte en la competición! 🍀\n\n${GLOBAL_HASHTAG}`;
            htmlContent = generateRosterCompleteHtml(data);
            logMessage = `Tweet de plantilla completa para el equipo ${captain.teamName}`;
            break;
        }
        case 'FINALIZADO': {
            const tournament = data;
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch && finalMatch.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                tweetText = `¡TENEMOS CAMPEÓN! 🏆\n\nFelicidades al equipo "${champion.nombre.toUpperCase()}" por ganar el torneo "${tournament.nombre.toUpperCase()}".\n\n${GLOBAL_HASHTAG}`;
                htmlContent = generateChampionHtml(tournament);
            } else {
                tweetText = `EL TORNEO "${tournament.nombre.toUpperCase()}" HA FINALIZADO. ¡GRACIAS A TODOS POR PARTICIPAR! ${GLOBAL_HASHTAG}`;
                htmlContent = null;
            }
            logMessage = `Tweet de finalización para ${tournament.nombre}`;
            break;
        }
        default: {
            console.warn(`[TWITTER] Evento no reconocido para tuitear: ${eventType}`);
            return { success: false, error: "Evento no reconocido" };
        }
    }

    try {
        if (!htmlContent) {
            await twitterClient.v2.tweet({ text: tweetText });
            console.log(`[TWITTER] ${logMessage} (solo texto)`);
            return { success: true };
        }

        const imageResult = await generateHtmlImage(htmlContent);

        if (imageResult.success) {
            const imageResponse = await fetch(imageResult.url);
            const imageBuffer = await imageResponse.arrayBuffer();
            const mediaId = await client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType: 'image/png' });
            await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
            console.log(`[TWITTER] ${logMessage} (con imagen)`);
            return { success: true };
        } else {
            console.warn(`[TWITTER_WARN] Fallo al generar imagen: ${imageResult.error}. Publicando solo texto como fallback.`);
            await twitterClient.v2.tweet({ text: tweetText });
            console.log(`[TWITTER] ${logMessage} (solo texto - fallback)`);
            return { success: true };
        }
    } catch (e) {
        console.error(`[TWITTER] Error CRÍTICO al publicar tweet para ${eventType}:`, e);
        return { success: false, error: e.message };
    }
}
