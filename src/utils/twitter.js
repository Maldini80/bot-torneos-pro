// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { TOURNAMENT_FORMATS, DISCORD_INVITE_LINK } from '../../config.js';
import { getBotSettings } from '../../database.js';

// 1. Configuración del Cliente de Twitter
const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// 2. Función para generar la imagen desde HTML
async function generateHtmlImage(htmlContent, css) {
    // CSS por defecto si no se proporciona uno específico
    const defaultCss = ".container { padding: 20px; background-color: #1a2a3a; color: #e1e8ed; font-family: sans-serif; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { padding: 8px; text-align: left; border-bottom: 1px solid #3a4a5a; } th { color: #1da1f2; } h2 { color: #1da1f2; border-bottom: 2px solid #1da1f2; padding-bottom: 5px; } .header { text-align: center; margin-bottom: 20px; } .header h1 { font-size: 28px; margin: 0; }";
    try {
        const response = await fetch('https://hcti.io/v1/image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(process.env.HCTI_API_USER_ID + ':' + process.env.HCTI_API_KEY).toString('base64')
            },
            body: JSON.stringify({ html: htmlContent, css: css || defaultCss })
        });
        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error("Error al generar imagen con HCTI:", error);
        return null;
    }
}

// Función auxiliar para subir la imagen a Twitter
async function uploadImageToTwitter(imageUrl) {
    if (!imageUrl) throw new Error("No se pudo obtener la URL de la imagen.");
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    return client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType: 'image/png' });
}

// 3. Función principal para postear un Tweet
export async function postTournamentUpdate(tournament) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled || !process.env.TWITTER_API_KEY) {
        console.log("[TWITTER] Publicación desactivada o sin configurar, omitiendo tuit.");
        return;
    }

    let tweetText = "";
    let htmlForImage = null;

    const format = TOURNAMENT_FORMATS[tournament.config.formatId];

    if (tournament.status === 'inscripcion_abierta') {
        tweetText = `¡Inscripciones abiertas para el torneo "${tournament.nombre}"! 🏆\n\nFormato: ${format.label}\nTipo: ${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}\n\n¡Apúntate aquí! 👇\n${DISCORD_INVITE_LINK}\n\n#eSports`;
    } else if (tournament.status === 'fase_de_grupos') {
        tweetText = `¡Comienza la fase de grupos en el torneo "${tournament.nombre}"! 🔥\n\nAquí están los grupos y la primera jornada. ¡Mucha suerte a todos los equipos!\n#eSports`;
        
        let tablesHtml = `<div class="container"><div class="header"><h1>Grupos - ${tournament.nombre}</h1></div>`;
        const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();
        
        for (const groupName of sortedGroupNames) {
            const group = tournament.structure.grupos[groupName];
            tablesHtml += `<h2>${groupName}</h2>`;
            tablesHtml += "<table><tr><th>Equipo</th><th>Pts</th><th>PJ</th><th>DG</th></tr>";
            group.equipos.forEach(team => {
                tablesHtml += `<tr><td>${team.nombre}</td><td>${team.stats.pts}</td><td>${team.stats.pj}</td><td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td></tr>`;
            });
            tablesHtml += "</table>";
        }
        tablesHtml += "</div>";
        htmlForImage = tablesHtml;

    } else if (tournament.status === 'finalizado') {
        const finalMatch = tournament.structure.eliminatorias.final;
        if (finalMatch && finalMatch.resultado) {
            const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
            const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
            tweetText = `¡Tenemos campeón en el "${tournament.nombre}"! 🏆\n\n¡Felicidades al equipo **${champion.nombre}** por una actuación increíble y por llevarse el título! ¡Grandes!\n#eSports #Campeones`;
        } else {
            tweetText = `El torneo "${tournament.nombre}" ha finalizado. ¡Gracias a todos por participar!`;
        }
    } else {
        // Para otras fases (cuartos, semis, etc.), se llamará a postKnockoutMatchups
        return;
    }

    try {
        if (htmlForImage) {
            const imageUrl = await generateHtmlImage(htmlForImage);
            const mediaId = await uploadImageToTwitter(imageUrl);
            await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
            console.log(`[TWITTER] Tweet de actualización con imagen publicado para ${tournament.nombre}`);
        } else {
            await twitterClient.v2.tweet(tweetText);
            console.log(`[TWITTER] Tweet simple publicado para ${tournament.nombre}`);
        }
    } catch (e) {
        console.error("[TWITTER] Error al publicar tweet de actualización:", e);
    }
}

// --- NUEVAS FUNCIONES DE TWITTER ---

export async function postNewCaptainAnnouncement(draft, captainData) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled || !process.env.TWITTER_API_KEY) return;

    const tweetText = `¡Nuevo capitán confirmado para el Draft '${draft.name}'! ⚔️\n\nDamos la bienvenida al equipo "${captainData.teamName}", liderado por ${captainData.psnId}.\n\n¡La competición se pone interesante!\n#${draft.shortId.replace(/-/g, '')} #eSports`;

    // Generar una imagen simple para el capitán
    const html = `<div class="container" style="text-align: center;">
                    <h2>NUEVO CAPITÁN CONFIRMADO</h2>
                    <h1>${captainData.teamName}</h1>
                    <p>Capitán: ${captainData.psnId}</p>
                    <p style="margin-top: 30px; font-size: 18px;">Para el Draft: ${draft.name}</p>
                  </div>`;

    try {
        const imageUrl = await generateHtmlImage(html);
        const mediaId = await uploadImageToTwitter(imageUrl);
        await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
        console.log(`[TWITTER] Anuncio de nuevo capitán publicado para ${captainData.teamName}`);
    } catch (e) {
        console.error("[TWITTER] Error al anunciar nuevo capitán:", e);
    }
}

export async function postTeamRosterAnnouncement(draft, captain, players) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled || !process.env.TWITTER_API_KEY) return;

    const tweetText = `¡Equipo completo en el Draft '${draft.name}'! 🛡️\n\nEl capitán ${captain.psnId} ha cerrado su plantilla. ¡Así queda el equipo ${captain.teamName} que luchará por el título!\n\n¡Mucha suerte!\n#${draft.shortId.replace(/-/g, '')} #eSports`;

    let html = `<div class="container">
                  <div class="header"><h1>${captain.teamName}</h1><p>Capitán: ${captain.psnId}</p></div>`;
    
    // Agrupar jugadores por rol general para la imagen
    const roster = { Defensas: [], Medios: [], Delanteros: [] };
    players.forEach(p => {
        if (p.primaryPosition === 'GK' || p.primaryPosition === 'DFC' || p.primaryPosition === 'CARR') {
            roster.Defensas.push(p.psnId);
        } else if (p.primaryPosition === 'MCD' || p.primaryPosition === 'MV/MCO') {
            roster.Medios.push(p.psnId);
        } else {
            roster.Delanteros.push(p.psnId);
        }
    });

    for (const [role, playerList] of Object.entries(roster)) {
        if (playerList.length > 0) {
            html += `<h2>${role.toUpperCase()}</h2><p>${playerList.join(', ')}</p>`;
        }
    }
    html += `</div>`;
    
    try {
        const imageUrl = await generateHtmlImage(html);
        const mediaId = await uploadImageToTwitter(imageUrl);
        await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
        console.log(`[TWITTER] Anuncio de plantilla completa para ${captain.teamName}`);
    } catch (e) {
        console.error("[TWITTER] Error al anunciar plantilla completa:", e);
    }
}

export async function postGroupStageEnd(tournament) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled || !process.env.TWITTER_API_KEY) return;

    const tweetText = `¡La fase de grupos del "${tournament.nombre}" ha concluido! 🔥\n\nAquí están las clasificaciones finales y los equipos que avanzan a la siguiente ronda. ¡La verdadera batalla comienza ahora!\n#eSports #Clasificación`;
    
    let tablesHtml = `<div class="container"><div class="header"><h1>Clasificación Final - ${tournament.nombre}</h1></div>`;
    const sortedGroupNames = Object.keys(tournament.structure.grupos).sort();
    
    for (const groupName of sortedGroupNames) {
        const group = tournament.structure.grupos[groupName];
        tablesHtml += `<h2>${groupName}</h2>`;
        tablesHtml += "<table><tr><th>Equipo</th><th>Pts</th><th>PJ</th><th>DG</th></tr>";
        group.equipos.forEach(team => {
            tablesHtml += `<tr><td>${team.nombre}</td><td>${team.stats.pts}</td><td>${team.stats.pj}</td><td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td></tr>`;
        });
        tablesHtml += "</table>";
    }
    tablesHtml += "</div>";

    try {
        const imageUrl = await generateHtmlImage(tablesHtml);
        const mediaId = await uploadImageToTwitter(imageUrl);
        await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
        console.log(`[TWITTER] Anuncio de fin de fase de grupos para ${tournament.nombre}`);
    } catch (e) {
        console.error("[TWITTER] Error al anunciar fin de fase de grupos:", e);
    }
}

export async function postKnockoutMatchups(tournament, stageName) {
    const settings = await getBotSettings();
    if (!settings.twitterEnabled || !process.env.TWITTER_API_KEY) return;

    const stageMatches = tournament.structure.eliminatorias[stageName.toLowerCase()];
    if (!stageMatches || stageMatches.length === 0) return;

    const tweetText = `¡Los cruces de ${stageName} están definidos para el "${tournament.nombre}"! ⚔️\n\nEstos son los enfrentamientos que nos llevarán a la gran final. ¿Quiénes son vuestros favoritos?\n#eSports`;

    let html = `<div class="container" style="text-align: center;"><h1>${stageName.toUpperCase()}</h1>`;
    const matches = Array.isArray(stageMatches) ? stageMatches : [stageMatches];
    
    matches.forEach(match => {
        html += `<div style="font-size: 24px; margin: 20px 0;">${match.equipoA.nombre} <span style="color: #e74c3c;">vs</span> ${match.equipoB.nombre}</div>`;
    });
    html += `</div>`;

    try {
        const imageUrl = await generateHtmlImage(html);
        const mediaId = await uploadImageToTwitter(imageUrl);
        await twitterClient.v2.tweet({ text: tweetText, media: { media_ids: [mediaId] } });
        console.log(`[TWITTER] Anuncio de cruces de ${stageName} para ${tournament.nombre}`);
    } catch (e) {
        console.error(`[TWITTER] Error al anunciar cruces de ${stageName}:`, e);
    }
}
