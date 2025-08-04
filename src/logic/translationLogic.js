// src/logic/translationLogic.js
import { translate } from '@vitalets/google-translate-api';
import { languageRoles } from '../../config.js';
// --- INICIO DE LA CORRECCIÓN ---
// Importamos la función para obtener la configuración del bot.
import { getBotSettings } from '../../database.js';
// --- FIN DE LA CORRECCIÓN ---

/**
 * Maneja la traducción de un mensaje si el autor tiene un rol de idioma.
 * @param {import('discord.js').Message} message - El mensaje a procesar.
 */
export async function handleMessageTranslation(message) {
    try {
        // --- INICIO DE LA CORRECCIÓN ---
        // Comprobamos si la traducción está activada globalmente.
        const botSettings = await getBotSettings();
        if (!botSettings.translationEnabled) {
            return; // Si está desactivada, no hacemos nada.
        }
        // --- FIN DE LA CORRECCIÓN ---

        const authorMember = message.member;
        if (!authorMember) return;

        let sourceLang = '';
        let hasLangRole = false;

        // Determinar el idioma del autor
        for (const flag in languageRoles) {
            const roleInfo = languageRoles[flag];
            const role = message.guild.roles.cache.find(r => r.name === roleInfo.name);
            if (role && authorMember.roles.cache.has(role.id)) {
                sourceLang = roleInfo.code;
                hasLangRole = true;
                break;
            }
        }

        if (!hasLangRole) return;

        // Obtener la colección de miembros del canal/hilo de forma segura
        let membersToTranslateFor = [];
        try {
            if (message.channel.isThread()) {
                const threadMembersCollection = await message.channel.members.fetch();
                membersToTranslateFor = Array.from(threadMembersCollection.values());
            } else {
                membersToTranslateFor = Array.from(message.channel.members.values());
            }
        } catch (fetchError) {
            console.warn(`No se pudieron obtener los miembros del canal ${message.channel.id}. Se cancela la traducción para este mensaje.`);
            return;
        }

        const targetLangCodes = new Set();
        for (const member of membersToTranslateFor) {
            for (const flag in languageRoles) {
                const roleInfo = languageRoles[flag];
                const role = message.guild.roles.cache.find(r => r.name === roleInfo.name);
                // Asegurarnos de que el miembro tiene la propiedad 'roles'
                if (role && member.roles && member.roles.cache.has(role.id) && roleInfo.code !== sourceLang) {
                    targetLangCodes.add(roleInfo.code);
                }
            }
        }
        
        if (targetLangCodes.size === 0) return;

        const translationEmbeds = [];
        for (const targetCode of targetLangCodes) {
            try {
                const { text } = await translate(message.content, { to: targetCode });
                const flag = Object.keys(languageRoles).find(f => languageRoles[f].code === targetCode);
                translationEmbeds.push({
                    description: `${flag} *${text}*`,
                    color: 0x5865F2,
                });
            } catch (translateError) {
                console.warn(`[WARN] No se pudo traducir al idioma ${targetCode}:`, translateError.message);
            }
        }
        
        if (translationEmbeds.length > 0) {
            await message.reply({
                embeds: translationEmbeds,
                allowedMentions: { repliedUser: false }
            });
        }

    } catch (error) {
        console.error('[ERROR DE TRADUCCIÓN]', error);
    }
}
