// config.js

// ID de la Categoría Principal de Torneos donde se crearán los canales de partidos
export const TOURNAMENT_CATEGORY_ID = '1394444274623582358';

// IDs de Roles globales del servidor
export const ADMIN_ROLE_ID = 'ID_DE_TU_ROL_DE_ADMIN'; // Reemplaza esto si es necesario
export const ARBITRO_ROLE_ID = '1393505777443930183';
export const PARTICIPANTE_ROLE_ID = '1394321301748977684';

// IDs de CANALES FIJOS que se reutilizan
export const CHANNELS = {
    TOURNAMENTS_MANAGEMENT_PARENT: '1393507085286899744',
    TOURNAMENTS_APPROVALS_PARENT: '1393187598796587028',
    TORNEOS_STATUS: '1395276865597476908',
};

// NUEVO: Configuración de Pagos (Esta es la única adición necesaria)
export const PAYMENT_CONFIG = {
    // IMPORTANTE: Pon aquí tu email de PayPal. Este se usará para todos los torneos de pago.
    PAYPAL_EMAIL: 'johancamirotti13@hotmail.com' 
};

// Configuración de los formatos de torneo CON TRADUCCIONES
export const TOURNAMENT_FORMATS = {
    '8_teams_semis_classic': { 
        label: '8 Equipos (Clásico - Semifinales)', 
        description: '2 grupos de 4. Los 2 primeros de cada grupo a semifinales. (1A vs 2B, 1B vs 2A)',
        description_en: '2 groups of 4. Top 2 advance to semifinals. (1A vs 2B, 1B vs 2A)',
        size: 8, groups: 2, qualifiersPerGroup: 2, knockoutStages: ['semifinales', 'final'] 
    },
    '8_teams_final': { 
        label: '8 Equipos (Nuevo - Final Directa)', 
        description: '2 grupos de 4. El 1º de cada grupo va a la final.',
        description_en: '2 groups of 4. The 1st of each group goes to the final.',
        size: 8, groups: 2, qualifiersPerGroup: 1, knockoutStages: ['final'] 
    },
    '16_teams_quarters_classic': { 
        label: '16 Equipos (Clásico - Cuartos)', 
        description: '4 grupos de 4. El 1º de cada grupo a cuartos de final.',
        description_en: '4 groups of 4. The 1st of each group advances to quarterfinals.',
        size: 16, groups: 4, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] 
    },
    '16_teams_quarters_new': { 
        label: '16 Equipos (Nuevo - Cuartos)', 
        description: '4 grupos de 4. Los 2 primeros a cuartos (1º vs 2º de otro grupo).',
        description_en: '4 groups of 4. Top 2 advance to quarterfinals (1st vs 2nd from another group).',
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
        description: '8 grupos de 4. Los 2 primeros a octavos (1º vs 2º de otro grupo).',
        description_en: '8 groups of 4. Top 2 qualify for round of 16 (1st vs 2nd from another group).',
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

// --- Enlace al PDF con las normas del torneo ---
export const RULES_PDF_URL = 'https://cdn.discordapp.com/attachments/1396998137859543240/1398204787622936606/Normas_de_los_partidos_y_guia_de_como_reportar_.pdf?ex=6884832e&is=688331ae&hm=ba0c2c2c775d50c581904ce15d86b29c088877a9a14bae1ba83fde927d4755db&'; 
