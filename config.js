// config.js

// ID de la Categoría Principal de Torneos donde se crearán los canales de partidos
export const TOURNAMENT_CATEGORY_ID = '1394444274623582358';

// IDs de Roles globales del servidor
export const ADMIN_ROLE_ID = 'ID_DE_TU_ROL_DE_ADMIN'; // Reemplaza esto si es necesario
export const ARBITRO_ROLE_ID = '1393505777443930183';
export const PARTICIPANTE_ROLE_ID = '1394321301748977684';
export const CASTER_ROLE_ID = '1394815380614283286'; // NUEVO: Rol para los Caster

// IDs de CANALES FIJOS que se reutilizan
export const CHANNELS = {
    TOURNAMENTS_MANAGEMENT_PARENT: '1393507085286899744',
    TOURNAMENTS_APPROVALS_PARENT: '1393187598796587028',
    TORNEOS_STATUS: '1395276865597476908',
    CASTER_HUB_ID: '1394818921453981766', // NUEVO: Canal para los hilos de casters
};

// NUEVO: URLs de las imágenes para el proceso de aceptación de normas
export const RULES_ACCEPTANCE_IMAGE_URLS = [
    'URL_DE_LA_IMAGEN_DE_NORMA_1', // Reemplaza esto con el enlace a tu primera imagen de normas
    'URL_DE_LA_IMAGEN_DE_NORMA_2', // Reemplaza esto con el enlace a tu segunda imagen de normas
    'URL_DE_LA_IMAGEN_DE_NORMA_3'  // Reemplaza esto con el enlace a tu tercera imagen de normas
];

// Configuración de Pagos
export const PAYMENT_CONFIG = {
    PAYPAL_EMAIL: 'johancamirotti13@hotmail.com'
};

// Configuración de los formatos de torneo CON TRADUCCIONES
export const TOURNAMENT_FORMATS = {
    '8_teams_semis_classic': {
        label: '8 Equipos (Clásico - Semifinales)',
        description: '2 grupos de 4. Los 2 primeros de cada grupo a semifinales.',
        description_en: '2 groups of 4. The top 2 from each group advance to semifinals.',
        size: 8, groups: 2, qualifiersPerGroup: 2, knockoutStages: ['semifinales', 'final']
    },
    '8_teams_final': {
        label: '8 Equipos (Nuevo - Final Directa)',
        description: '2 grupos de 4. El 1º de cada grupo va a la final.',
        description_en: '2 groups of 4. The 1st of each group goes to the final.',
        size: 8, groups: 2, qualifiersPerGroup: 1, knockoutStages: ['final']
    },
    '16_teams_quarters_classic': { 
        // CORRECCIÓN: Se ajusta el nombre y la descripción a la lógica real.
        label: '16 Equipos (Clásico - Semis Directas)', 
        description: '4 grupos de 4. El 1º de cada grupo a semifinales.',
        description_en: '4 groups of 4. The 1st of each group advances to semifinals.',
        size: 16, groups: 4, 
        // CORRECCIÓN: Se revierte al valor original que querías.
        qualifiersPerGroup: 1, 
        // CORRECCIÓN: La primera fase eliminatoria con 4 equipos es 'semifinales'.
        knockoutStages: ['semifinales', 'final'] 
    },
    '16_teams_quarters_new': { 
        label: '16 Equipos (Nuevo - Cuartos)', 
        description: '4 grupos de 4. Los 2 primeros de cada grupo a cuartos.',
        description_en: '4 groups of 4. The top 2 from each group advance to quarterfinals.',
        size: 16, groups: 4, qualifiersPerGroup: 2, knockoutStages: ['cuartos', 'semifinales', 'final'] 
    },
    '32_teams_quarters': { 
        label: '32 Equipos (Cuartos de Final)', 
        description: '8 grupos de 4. El 1º de cada grupo clasifica a cuartos.',
        description_en: '8 groups of 4. The 1st of each group qualifies for quarterfinals.',
        size: 32, groups: 8, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] 
    },
    '32_teams_ro16': { 
        label: '32 Equipos (Octavos de Final)', 
        description: '8 grupos de 4. Los 2 primeros clasifican a octavos.',
        description_en: '8 groups of 4. The top 2 qualify for the round of 16.',
        size: 32, groups: 8, qualifiersPerGroup: 2, knockoutStages: ['octavos', 'cuartos', 'semifinales', 'final'] 
    }
};

// Configuración de idiomas
export const languageRoles = {
    '🇪🇸': { name: 'Español', code: 'es' }, '🇮🇹': { name: 'Italiano', code: 'it' }, '🇬🇧': { name: 'English', code: 'en' },
    '🇫🇷': { name: 'Français', code: 'fr' }, '🇵🇹': { name: 'Português', code: 'pt' }, '🇩🇪': { name: 'Deutsch', code: 'de' },
    '🇹🇷': { name: 'Türkçe', code: 'tr' }
};

// Iconos de estado para los embeds y nombres de canales
export const TOURNAMENT_STATUS_ICONS = {
    inscripcion_abierta: '🟢',
    cupo_lleno: '🟠',
    fase_de_grupos: '🔵',
    octavos: '🟣',
    cuartos: '🟣',
    semifinales: '🟣',
    final: '🟣',
    finalizado: '🏁',
    cancelado: '🔴'
};

// Enlace al PDF de las normas del torneo
export const PDF_RULES_URL = 'https://cdn.discordapp.com/attachments/1396998137859543240/1398204787622936606/Normas_de_los_partidos_y_guia_de_como_reportar_.pdf?ex=6884832e&is=688331ae&hm=ba0c2c2c775d50c581904ce15d86b29c088877a9a14bae1ba83fde927d4755db&';
