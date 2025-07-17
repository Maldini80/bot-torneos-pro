// config.js

// ID de la Categoría Principal de Torneos donde se crearán los canales de partidos
export const TOURNAMENT_CATEGORY_ID = '1394444274623582358';

// IDs de Roles globales del servidor
export const ADMIN_ROLE_ID = 'ID_DE_TU_ROL_DE_ADMIN'; // Reemplaza esto si es necesario
export const ARBITRO_ROLE_ID = '1393505777443930183';
export const PARTICIPANTE_ROLE_ID = '1394321301748977684';

// IDs de CANALES FIJOS que se reutilizan
export const CHANNELS = {
    // Canal donde vive el panel de admin
    GLOBAL_ADMIN_PANEL: '1393507085286899744',

    // Canal donde llegan los avisos para aprobar/rechazar inscripciones
    ADMIN_APPROVALS: '1393187598796587028',

    // Canales para anuncios públicos
    TORNEOS_STATUS: '1395276865597476908',
    INSCRIPCIONES: '1393942335645286412',
    CAPITANES_INSCRITOS: '1394444703822381076',
    CLASIFICACION: '1394445078948220928',
    CALENDARIO: '1394577975412002816',
};
// Configuración de los formatos de torneo
export const TOURNAMENT_FORMATS = {
    '8_teams_semis_classic': { label: '8 Equipos (Clásico - Semifinales)', description: '2 grupos de 4. Los 2 primeros de cada grupo a semifinales.', size: 8, groups: 2, qualifiersPerGroup: 2, knockoutStages: ['semifinales', 'final'] },
    '8_teams_final': { label: '8 Equipos (Nuevo - Final Directa)', description: '2 grupos de 4. El 1º de cada grupo va a la final.', size: 8, groups: 2, qualifiersPerGroup: 1, knockoutStages: ['final'] },
    '16_teams_quarters_classic': { label: '16 Equipos (Clásico - Cuartos)', description: '4 grupos de 4. El 1º de cada grupo a cuartos de final.', size: 16, groups: 4, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '16_teams_quarters_new': { label: '16 Equipos (Nuevo - Cuartos)', description: '4 grupos de 4. Los 2 primeros de cada grupo a cuartos.', size: 16, groups: 4, qualifiersPerGroup: 2, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '32_teams_quarters': { label: '32 Equipos (Cuartos de Final)', description: '8 grupos de 4. El 1º de cada grupo clasifica a cuartos.', size: 32, groups: 8, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '32_teams_ro16': { label: '32 Equipos (Octavos de Final)', description: '8 grupos de 4. Los 2 primeros clasifican a octavos.', size: 32, groups: 8, qualifiersPerGroup: 2, knockoutStages: ['octavos', 'cuartos', 'semifinales', 'final'] }
};
// Configuración de idiomas
export const languageRoles = {
    '🇪🇸': { name: 'Español', code: 'es' },
    '🇮🇹': { name: 'Italiano', code: 'it' },
    '🇬🇧': { name: 'English', code: 'en' },
    '🇫🇷': { name: 'Français', code: 'fr' },
    '🇵🇹': { name: 'Português', code: 'pt' },
    '🇩🇪': { name: 'Deutsch', code: 'de' },
    '🇹🇷': { name: 'Türkçe', code: 'tr' }
};

// ¡¡¡VARIABLE IMPORTANTE QUE FALTABA!!!
// Iconos de estado para los embeds y nombres de canales
export const TOURNAMENT_STATUS_ICONS = {
    inscripcion_abierta: '🟢',
    cupo_lleno: '🟠',
    fase_de_grupos: '🔵',
    eliminatorias: '🟣',
    finalizado: '🏁',
    cancelado: '🔴'
};
