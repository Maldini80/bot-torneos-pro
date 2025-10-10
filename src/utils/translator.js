import fs from 'fs';
import path from 'path';

// --- CONFIGURACIÓN ACTUALIZADA ---

// Mapeo con los IDs de rol que proporcionaste.
const LANGUAGE_ROLE_MAP = {
    '1392409960322826270': 'es', // Español
    '1392410199490302043': 'en', // English
    '1392410102706737282': 'it', // Italiano
    '1392410295044931746': 'fr', // Français
    '1392410361063276575': 'pt', // Português
    '1392410401391775814': 'de', // Deutsch
    '1392410445578637342': 'tr'  // Türkçe
};
// Idioma por defecto establecido a español.
const DEFAULT_LANG = 'es';

// --- CÓDIGO DEL TRADUCTOR (No necesitas modificar esto) ---
const translations = {};
try {
    const localesPath = path.resolve(process.cwd(), 'locales');
    const localeFiles = fs.readdirSync(localesPath).filter(file => file.endsWith('.json'));

    for (const file of localeFiles) {
        const lang = file.split('.')[0];
        const data = fs.readFileSync(path.join(localesPath, file), 'utf8');
        translations[lang] = JSON.parse(data);
    }
    console.log('[Translator] Idiomas cargados:', Object.keys(translations).join(', '));
} catch (error) {
    console.error('[Translator] Error: La carpeta "locales" no se pudo cargar. Asegúrate de que existe en la raíz del proyecto.', error);
}

/**
 * Obtiene el código de idioma de un miembro basado en sus roles.
 * @param {import('discord.js').GuildMember} member El miembro del servidor.
 * @returns {string} El código de idioma (ej: 'en') o el idioma por defecto.
 */
function getLanguageFromMember(member) {
    if (!member || !member.roles) return DEFAULT_LANG;

    for (const roleId of member.roles.cache.keys()) {
        const langCode = LANGUAGE_ROLE_MAP[roleId];
        if (langCode && translations[langCode]) {
            return langCode; // Devuelve el primer idioma que encuentre
        }
    }
    return DEFAULT_LANG; // Si no tiene rol de idioma, usa el por defecto
}

/**
 * Traduce una clave de texto al idioma del miembro.
 * @param {string} key La clave del texto del archivo .json.
 * @param {import('discord.js').GuildMember} member El miembro para determinar el idioma.
 * @param {Object.<string, string>} [options={}] Opcional: Un objeto para reemplazar variables.
 * @returns {string} El texto traducido.
 */
export function t(key, member, options = {}) {
    const lang = getLanguageFromMember(member);
    let text = translations[lang]?.[key] || translations[DEFAULT_LANG]?.[key];

    if (!text) {
        console.warn(`[Translator] Clave no encontrada: "${key}"`);
        return key; // Devuelve la clave si el texto no se encuentra
    }

    // Reemplaza los placeholders como {tournamentName} con los valores de las opciones
    for (const optionKey in options) {
        text = text.replace(new RegExp(`{${optionKey}}`, 'g'), options[optionKey]);
    }

    return text;
}
