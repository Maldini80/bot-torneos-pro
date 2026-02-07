// translations.js - Sistema de internacionalización (i18n)

export const translations = {
    es: {
        // Navegación
        nav: {
            active: 'Activos',
            history: 'Historial'
        },

        // Dashboard principal
        dashboard: {
            title: 'Dashboard de Eventos',
            activeEvents: 'Eventos Activos',
            noActiveEvents: 'No hay eventos activos en este momento',
            history: 'Historial de Eventos',
            allTypes: 'Todos los tipos',
            tournaments: 'Torneos',
            drafts: 'Drafts',
            search: 'Buscar por nombre...',
            name: 'Nombre',
            type: 'Tipo',
            date: 'Fecha',
            status: 'Estado',
            actions: 'Acciones',
            view: 'Ver',
            loading: 'Cargando eventos...',
            error: 'Error al cargar eventos',
            noResults: 'No se encontraron eventos'
        },

        // Estados de eventos
        status: {
            active: 'En curso',
            pending: 'Pendiente',
            completed: 'Finalizado',
            cancelled: 'Cancelado',
            registration_open: 'Inscripción abierta',
            fase_de_grupos: 'Fase de grupos',
            octavos: 'Octavos',
            cuartos: 'Cuartos',
            semifinales: 'Semifinales',
            final: 'Final',
            finalizado: 'Finalizado'
        },

        // Tipos de eventos
        eventTypes: {
            tournament: 'Torneo',
            draft: 'Draft',
            league: 'Liguilla'
        },

        // Torneos
        tournament: {
            format: 'Formato',
            teams: 'Equipos',
            matches: 'Partidos',
            classification: 'Clasificación',
            calendar: 'Calendario',
            bracket: 'Eliminatorias',
            teamList: 'Equipos Participantes',
            liveMatches: 'Partidos en Directo',
            champion: 'Campeón',
            groups: 'Fase de Grupos',
            winner: 'Ganador'
        },

        // Draft
        draft: {
            currentTurn: 'Turno actual',
            pick: 'Pick',
            round: 'Ronda',
            team: 'Equipo',
            availablePlayers: 'Jugadores Disponibles',
            position: 'Posición',
            primary: 'Primaria',
            secondary: 'Secundaria',
            strikes: 'Strikes',
            action: 'Acción',
            select: 'Seleccionar',
            myTeam: 'Mi Equipo'
        },

        // Común
        common: {
            close: 'Cerrar',
            back: 'Volver',
            next: 'Siguiente',
            previous: 'Anterior',
            page: 'Página',
            of: 'de',
            total: 'Total',
            filters: 'Filtros',
            clear: 'Limpiar',
            apply: 'Aplicar',
            createdAt: 'Creado el',
            updatedAt: 'Actualizado el'
        },

        // Mensajes
        messages: {
            noData: 'No hay datos disponibles',
            loadingError: 'Error al cargar los datos',
            connectionLost: 'Conexión perdida. Reintentando...',
            reconnected: 'Conexión restablecida'
        }
    },

    en: {
        // Navigation
        nav: {
            active: 'Active',
            history: 'History'
        },

        // Main dashboard
        dashboard: {
            title: 'Events Dashboard',
            activeEvents: 'Active Events',
            noActiveEvents: 'No active events at the moment',
            history: 'Events History',
            allTypes: 'All types',
            tournaments: 'Tournaments',
            drafts: 'Drafts',
            search: 'Search by name...',
            name: 'Name',
            type: 'Type',
            date: 'Date',
            status: 'Status',
            actions: 'Actions',
            view: 'View',
            loading: 'Loading events...',
            error: 'Error loading events',
            noResults: 'No events found'
        },

        // Event statuses
        status: {
            active: 'In progress',
            pending: 'Pending',
            completed: 'Completed',
            cancelled: 'Cancelled',
            registration_open: 'Registration open',
            fase_de_grupos: 'Group stage',
            octavos: 'Round of 16',
            cuartos: 'Quarterfinals',
            semifinales: 'Semifinals',
            final: 'Final',
            finalizado: 'Finished'
        },

        // Event types
        eventTypes: {
            tournament: 'Tournament',
            draft: 'Draft',
            league: 'League'
        },

        // Tournaments
        tournament: {
            format: 'Format',
            teams: 'Teams',
            matches: 'Matches',
            classification: 'Classification',
            calendar: 'Calendar',
            bracket: 'Bracket',
            teamList: 'Participating Teams',
            liveMatches: 'Live Matches',
            champion: 'Champion',
            groups: 'Group Stage',
            winner: 'Winner'
        },

        // Draft
        draft: {
            currentTurn: 'Current turn',
            pick: 'Pick',
            round: 'Round',
            team: 'Team',
            availablePlayers: 'Available Players',
            position: 'Position',
            primary: 'Primary',
            secondary: 'Secondary',
            strikes: 'Strikes',
            action: 'Action',
            select: 'Select',
            myTeam: 'My Team'
        },

        // Common
        common: {
            close: 'Close',
            back: 'Back',
            next: 'Next',
            previous: 'Previous',
            page: 'Page',
            of: 'of',
            total: 'Total',
            filters: 'Filters',
            clear: 'Clear',
            apply: 'Apply',
            createdAt: 'Created on',
            updatedAt: 'Updated on'
        },

        // Messages
        messages: {
            noData: 'No data available',
            loadingError: 'Error loading data',
            connectionLost: 'Connection lost. Retrying...',
            reconnected: 'Connection restored'
        }
    }
};

/**
 * Obtiene una traducción usando notación de puntos
 * @param {string} lang - Código de idioma ('es' o 'en')
 * @param {string} key - Clave en formato 'section.subsection.key'
 * @returns {string} Texto traducido o la clave si no existe
 */
export function t(lang, key) {
    const keys = key.split('.');
    let value = translations[lang];

    for (const k of keys) {
        if (value && typeof value === 'object') {
            value = value[k];
        } else {
            return key; // Retorna la clave si no se encuentra
        }
    }

    return value || key;
}

/**
 * Obtiene el idioma guardado en localStorage o el predeterminado
 * @returns {string} Código de idioma
 */
export function getCurrentLanguage() {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('lang') || 'es';
    }
    return 'es';
}

/**
 * Guarda el idioma en localStorage
 * @param {string} lang - Código de idioma
 */
export function setCurrentLanguage(lang) {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('lang', lang);
    }
}
