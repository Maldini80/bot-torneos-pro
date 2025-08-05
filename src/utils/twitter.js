// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { getBotSettings } from '../../database.js';

// --- CONFIGURACIÓN GLOBAL ---
const DISCORD_INVITE_LINK = 'https://discord.gg/zEy9ztp8QM';
const GLOBAL_HASHTAG = '#VPGLightnings';
// Usamos la URL de Imgur que sabemos que funciona
const LOGO_URL_BACKGROUND = 'https://www.rektv.es/wp-content/uploads/2022/11/Recurso-10.png';

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// --- CSS DEFINITIVO Y CORREGIDO ---
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');

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
    background-color: rgba(29, 29, 29, 0.9);
    background-image: url('${LOGO_URL_BACKGROUND}');
    background-position: center;
    background-repeat: no-repeat;
    background-size: 450px;
    border: 3px solid #C70000;
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
  h1, h2, th, .team-name, .value, .label, p {
    text-transform: uppercase;
  }
  h1 { 
    color: #C70000; 
    font-size: 64px; 
    margin: 0 0 20px 0;
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

// --- FUNCIÓN PRINCIPAL DE TWITTER COMPLETA Y CORREGIDA ---
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

    // --- BLOQUE TRY/CATCH CORREGIDO ---
    try {
        if (!htmlContent) { // Si el evento es solo de texto
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
