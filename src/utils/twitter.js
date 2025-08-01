// src/utils/twitter.js
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import fetch from 'node-fetch';
import { TOURNAMENT_FORMATS } from '../../config.js';

// 1. Configuración del Cliente de Twitter
const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterClient = client.readWrite;

// 2. Función para generar la imagen desde HTML
async function generateHtmlImage(htmlContent) {
    try {
        const response = await fetch('https://hcti.io/v1/image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(process.env.HCTI_API_USER_ID + ':' + process.env.HCTI_API_KEY).toString('base64')
            },
            body: JSON.stringify({ html: htmlContent, css: ".container { padding: 20px; background-color: #1a2a3a; color: #e1e8ed; font-family: sans-serif; } table { width: 100%; border-collapse: collapse; } th, td { padding: 8px; text-align: left; border-bottom: 1px solid #3a4a5a; } th { color: #1da1f2; }" })
        });
        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error("Error al generar imagen con HCTI:", error);
        return null;
    }
}

// 3. Función principal para postear un Tweet con imagen
export async function postTournamentUpdate(tournament) {
    if (!process.env.TWITTER_API_KEY) {
        console.log("[TWITTER] No se han configurado las claves de API, se omite la publicación.");
        return;
    }

    let tweetText = "";
    let htmlForImage = "<h1>Actualización del Torneo</h1>"; // Default

    // Generar texto y HTML según el estado del torneo
    const format = TOURNAMENT_FORMATS[tournament.config.formatId];
    
    if (tournament.status === 'inscripcion_abierta') {
        tweetText = `¡Inscripciones abiertas para el torneo "${tournament.nombre}"! 🏆\n\nFormato: ${format.label}\nTipo: ${tournament.config.isPaid ? 'De Pago' : 'Gratuito'}\n\n¡Apúntate en nuestro Discord! #eSports`;
        // Para inscripciones abiertas, no publicaremos imagen de clasificación
        try {
            await twitterClient.v2.tweet(tweetText);
            console.log(`[TWITTER] Tweet de apertura de inscripciones publicado para ${tournament.nombre}`);
        } catch (e) {
            console.error("[TWITTER] Error al publicar tweet de inscripciones:", e);
        }
        return;

    } else if (tournament.status === 'fase_de_grupos') {
        tweetText = `¡Comienza la fase de grupos en el torneo "${tournament.nombre}"! 🔥\n\nAquí están los grupos y la primera jornada. ¡Mucha suerte a todos los equipos! #eSports`;
        
        // Generar HTML para la clasificación de grupos
        let tableHtml = "<table><tr><th>Equipo</th><th>Pts</th><th>PJ</th><th>DG</th></tr>";
        Object.values(tournament.structure.grupos).forEach(group => {
            group.equipos.forEach(team => {
                tableHtml += `<tr><td>${team.nombre}</td><td>${team.stats.pts}</td><td>${team.stats.pj}</td><td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td></tr>`;
            });
        });
        tableHtml += "</table>";
        htmlForImage = `<div class="container"><h2>Grupos - ${tournament.nombre}</h2>${tableHtml}</div>`;
    
    } else if (tournament.status === 'finalizado') {
        // Encontrar al campeón y finalista (esta lógica se debe mejorar si no está presente)
        const finalMatch = tournament.structure.eliminatorias.final;
        if (finalMatch && finalMatch.resultado) {
            const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
            const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
            tweetText = `¡Tenemos un campeón! 🏆\n\nFelicidades al equipo "${champion.nombre}" por ganar el torneo "${tournament.nombre}". ¡Gran actuación! #eSports #Campeones`;
        } else {
            tweetText = `El torneo "${tournament.nombre}" ha finalizado. ¡Gracias a todos por participar!`;
        }

    } else {
        // Para otras fases (cuartos, semis, etc.)
        tweetText = `¡Avanzamos a la fase de ${tournament.status.replace('_', ' ')} en el torneo "${tournament.nombre}"! 💥 #eSports`;
    }

    // Si no es un tweet simple (como el de inscripción), generar y adjuntar imagen
    if (htmlForImage && tournament.status !== 'inscripcion_abierta' && tournament.status !== 'finalizado') {
        try {
            const imageUrl = await generateHtmlImage(htmlForImage);
            if (!imageUrl) throw new Error("No se pudo obtener la URL de la imagen.");

            const imageResponse = await fetch(imageUrl);
            const imageBuffer = await imageResponse.arrayBuffer();

            // Subir imagen a Twitter
            const mediaId = await client.v1.uploadMedia(Buffer.from(imageBuffer), { mimeType: 'image/png' });

            // Publicar tweet con la imagen
            await twitterClient.v2.tweet({
                text: tweetText,
                media: { media_ids: [mediaId] }
            });

            console.log(`[TWITTER] Tweet de actualización publicado para ${tournament.nombre}`);
        } catch (e) {
            console.error("[TWITTER] Error al publicar tweet con imagen:", e);
        }
    } else if (tweetText) {
        // Publicar tweet simple (sin imagen)
         try {
            await twitterClient.v2.tweet(tweetText);
            console.log(`[TWITTER] Tweet simple publicado para ${tournament.nombre}`);
        } catch (e) {
            console.error("[TWITTER] Error al publicar tweet simple:", e);
        }
    }
}
