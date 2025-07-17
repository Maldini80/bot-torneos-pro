// config.js
export const TOURNAMENT_CATEGORY_ID = '1394444274623582358';
export const ADMIN_ROLE_ID = 'ID_DE_TU_ROL_DE_ADMIN';
export const ARBITRO_ROLE_ID = '1393505777443930183';
export const PARTICIPANTE_ROLE_ID = '1394321301748977684';
export const CHANNELS = {
    GLOBAL_ADMIN_PANEL: '1393187598796587028',
    TORNEOS_STATUS: '1395276865597476908',
    INSCRIPCIONES: '1393942335645286412',
    CAPITANES_INSCRITOS: '1394444703822381076',
    CLASIFICACION: '1394445078948220928',
    CALENDARIO: '1394577975412002816',
};
export const TOURNAMENT_FORMATS = {
    '8_teams_semis_classic': { label: '8 Equipos (Clásico - Semifinales)', description: '2 grupos de 4. Los 2 primeros de cada grupo a semifinales.', size: 8, groups: 2, qualifiersPerGroup: 2, knockoutStages: ['semifinales', 'final'] },
    '8_teams_final': { label: '8 Equipos (Nuevo - Final Directa)', description: '2 grupos de 4. El 1º de cada grupo va a la final.', size: 8, groups: 2, qualifiersPerGroup: 1, knockoutStages: ['final'] },
    '16_teams_quarters_classic': { label: '16 Equipos (Clásico - Cuartos)', description: '4 grupos de 4. El 1º de cada grupo a cuartos de final.', size: 16, groups: 4, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '16_teams_quarters_new': { label: '16 Equipos (Nuevo - Cuartos)', description: '4 grupos de 4. Los 2 primeros de cada grupo a cuartos.', size: 16, groups: 4, qualifiersPerGroup: 2, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '32_teams_quarters': { label: '32 Equipos (Cuartos de Final)', description: '8 grupos de 4. El 1º de cada grupo clasifica a cuartos.', size: 32, groups: 8, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '32_teams_ro16': { label: '32 Equipos (Octavos de Final)', description: '8 grupos de 4. Los 2 primeros clasifican a octavos.', size: 32, groups: 8, qualifiersPerGroup: 2, knockoutStages: ['octavos', 'cuartos', 'semifinales', 'final'] }
};
export const languageRoles = {
    '🇪🇸': { name: 'Español', code: 'es' }, '🇮🇹': { name: 'Italiano', code: 'it' }, '🇬🇧': { name: 'English', code: 'en' },
    '🇫🇷': { name: 'Français', code: 'fr' }, '🇵🇹': { name: 'Português', code: 'pt' }, '🇩🇪': { name: 'Deutsch', code: 'de' },
    '🇹🇷': { name: 'Türkçe', code: 'tr' }
};
export const TOURNAMENT_STATUS_ICONS = {
    inscripcion_abierta: '🟢', cupo_lleno: '🟠', fase_de_grupos: '🔵', eliminatorias: '🟣',
    finalizado: '🏁', cancelado: '🔴'
};
