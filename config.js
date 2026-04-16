// config.js

export const VERIFIED_ROLE_ID = '1409041757672570890'; // 👈 Pega aquí el ID de tu nuevo rol
export const ADMIN_APPROVAL_CHANNEL_ID = '1405086450583732245'; // Canal para solicitudes manuales y de actualización

// ID de la Categoría Principal de Torneos donde se crearán los canales de partidos
export const TOURNAMENT_CATEGORY_ID = '1394444274623582358';
// NUEVO: ID de la Categoría donde se crearán los canales privados de cada equipo del draft
export const TEAM_CHANNELS_CATEGORY_ID = '1392406963463262209';
// ID de la Categoría donde se crean los canales de verificación/tickets
export const VERIFICATION_TICKET_CATEGORY_ID = '1396814712649551974';

// Se añade la constante para el enlace de invitación al servidor de Discord
export const DISCORD_INVITE_LINK = 'https://discord.gg/zEy9ztp8QM';

// IDs de Roles globales del servidor
export const ADMIN_ROLE_ID = 'ID_DE_TU_ROL_DE_ADMIN'; // Reemplaza esto si es necesario
export const ARBITRO_ROLE_ID = '1393505777443930183';
export const PARTICIPANTE_ROLE_ID = '1394321301748977684';
export const CASTER_ROLE_ID = '1394815380614283286'; // ROL para los Caster

export const CHANNELS = {
    TOURNAMENTS_MANAGEMENT_PARENT: '1393507085286899744',
    TOURNAMENTS_APPROVALS_PARENT: '1402099941685465168',
    // ANTES: TORNEOS_STATUS
    TOURNAMENTS_STATUS: '1395276865597476908', // <-- Canal para anuncios de TORNEOS
    DRAFTS_STATUS: '1413906746258362398',     // <-- Canal para anuncios de DRAFTS
    CASTER_HUB_ID: '1394818921453981766', // Canal para los hilos de casters
    CASTER_DRAFT_CATEGORY_ID: '1394815147784146967',
};

// Configuración de Pagos
export const PAYMENT_CONFIG = {
    PAYPAL_EMAIL: process.env.PAYPAL_EMAIL || 'Jgm141400@gmail.com'
};

// Configuración para el sistema de Draft
export const DRAFT_POSITIONS = {
    GK: 'Portero (GK)',
    DFC: 'Defensa Central (DFC)',
    CARR: 'Carrilero (CARR)',
    MC: 'Medio',
    DC: 'Delantero Centro (DC)'
};

// Orden de visualización de las posiciones en las tablas del Draft
export const DRAFT_POSITION_ORDER = ['GK', 'DFC', 'CARR', 'MC', 'DC'];

// Configuración de los formatos de torneo CON TRADUCCIONES
export const TOURNAMENT_FORMATS = {
    '8_teams_semis_classic': {
        label: '8 Equipos (Clásico - Semifinales)',
        description: '2 grupos de 4. Los 2 primeros de cada grupo a semifinales.',
        description_en: '2 groups of 4. The top 2 from each group advance to semifinals.',
        size: 8, groups: 2, qualifiersPerGroup: 2, knockoutStages: ['semifinales', 'final'],
        isDraftCompatible: true // <--- AÑADIDO
    },
    '8_teams_final': {
        label: '8 Equipos (Nuevo - Final Directa)',
        description: '2 grupos de 4. El 1º de cada grupo va a la final.',
        description_en: '2 groups of 4. The 1st of each group goes to the final.',
        size: 8, groups: 2, qualifiersPerGroup: 1, knockoutStages: ['final'],
        isDraftCompatible: true // <--- AÑADIDO
    },
    '16_teams_quarters_classic': {
        label: '16 Equipos (Clásico - Semis Directas)',
        description: '4 grupos de 4. El 1º de cada grupo a semifinales.',
        description_en: '4 groups of 4. The 1st of each group advances to semifinals.',
        size: 16, groups: 4,
        qualifiersPerGroup: 1,
        knockoutStages: ['semifinales', 'final'],
        isDraftCompatible: true // <--- AÑADIDO
    },
    '16_teams_quarters_new': {
        label: '16 Equipos (Nuevo - Cuartos)',
        description: '4 grupos de 4. Los 2 primeros de cada grupo a cuartos.',
        description_en: '4 groups of 4. The top 2 from each group advance to quarterfinals.',
        size: 16, groups: 4, qualifiersPerGroup: 2, knockoutStages: ['cuartos', 'semifinales', 'final'],
        isDraftCompatible: true // <--- AÑADIDO
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
    },
    '12_teams_quarters_worldcup': {
        label: '12 Equipos (Mundial — Cuartos)',
        description: '3 grupos de 4. Top 2 de cada grupo + 2 mejores terceros → cuartos de final.',
        description_en: '3 groups of 4. Top 2 from each group + 2 best 3rd-place teams → quarterfinals.',
        size: 12, groups: 3, qualifiersPerGroup: 2,
        bestThirds: 2, // Los 2 mejores 3os clasifican a cuartos
        knockoutStages: ['cuartos', 'semifinales', 'final'],
        isDraftCompatible: true,
    },
    'flexible_league': {
        label: 'Liguilla',
        description: 'Una única liga donde se juegan 3 jornadas. El número de clasificados es personalizable.',
        description_en: 'A single league where 3 rounds are played. The number of qualifiers is customizable.',
        size: 0, // 0 indica que el tamaño es variable
        groups: 1,
        qualifiersPerGroup: 0, // 0 indica que es variable
        knockoutStages: ['octavos', 'cuartos', 'semifinales', 'final'],
        isDraftCompatible: true // Es compatible con drafts
    },
    'knockout_only': {
        label: 'Solo Eliminatorias',
        description: 'Torneo directo a eliminatorias (Dieciseisavos de Final, Octavos, Cuartos...). Sin fase de grupos.',
        description_en: 'Direct knockout tournament (Round of 32, Round of 16, Quarterfinals...). No group stage.',
        size: 0, // flexible
        groups: 0,
        qualifiersPerGroup: 0,
        knockoutStages: ['treintaidosavos', 'dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'],
        isDraftCompatible: true
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
export const PDF_RULES_URL = 'https://i.imgur.com/B72xwaB.jpeg';
