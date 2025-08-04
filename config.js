// config.js

// ID de la Categoría Principal de Torneos donde se crearán los canales de partidos
export const TOURNAMENT_CATEGORY_ID = '1394444274623582358';
// NUEVO: ID de la Categoría donde se crearán los canales privados de cada equipo del draft
export const TEAM_CHANNELS_CATEGORY_ID = '1392406963463262209';

// Se añade la constante para el enlace de invitación al servidor de Discord
export const DISCORD_INVITE_LINK = 'https://discord.gg/zEy9ztp8QM';

// IDs de Roles globales del servidor
export const ADMIN_ROLE_ID = 'ID_DE_TU_ROL_DE_ADMIN'; // Reemplaza esto si es necesario
export const ARBITRO_ROLE_ID = '1393505777443930183';
export const PARTICIPANTE_ROLE_ID = '1394321301748977684';
export const CASTER_ROLE_ID = '1394815380614283286'; // ROL para los Caster

// IDs de CANALES FIJOS que se reutilizan
export const CHANNELS = {
    TOURNAMENTS_MANAGEMENT_PARENT: '1393507085286899744',
    TOURNAMENTS_APPROVALS_PARENT: '1401729454409252946',
    TORNEOS_STATUS: '1395276865597476908',
    CASTER_HUB_ID: '1394818921453981766', // Canal para los hilos de casters
};

// Configuración de Pagos
export const PAYMENT_CONFIG = {
    PAYPAL_EMAIL: 'johancamirotti13@hotmail.com'
};

// Configuración para el sistema de Draft
export const DRAFT_POSITIONS = {
    GK: 'Portero (GK)',
    DFC: 'Defensa Central (DFC)',
    CARR: 'Carrilero (CARR)',
    MCD: 'Mediocentro Defensivo (MCD)',
    'MV/MCO': 'Mediocentro/Ofensivo (MV/MCO)',
    DC: 'Delantero Centro (DC)'
};

// Orden de visualización de las posiciones en las tablas del Draft
export const DRAFT_POSITION_ORDER = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];

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
        label: '16 Equipos (Clásico - Semis Directas)',
        description: '4 grupos de 4. El 1º de cada grupo a semifinales.',
        description_en: '4 groups of 4. The 1st of each group advances to semifinals.',
        size: 16, groups: 4,
        qualifiersPerGroup: 1,
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
